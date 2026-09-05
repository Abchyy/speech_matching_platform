import { deepseekConfig, providerConfig, requireDeepseekApiKey } from "../config";
import {
  ProviderError,
  classifyHttpStatus,
  isRetryableNetworkError,
  readJsonResponse,
  withBoundedRetry,
  type LlmCompleteOptions,
  type LlmProvider,
} from "../providers";

export class DeepSeekError extends ProviderError {
  constructor(
    message: string,
    options: {
      code: ProviderError["code"];
      retryable: boolean;
      status?: number;
      provider?: string;
      model?: string;
      durationMs?: number;
      attempts?: number;
    } = { code: "PROVIDER_UNKNOWN", retryable: false },
  ) {
    super(message, {
      ...options,
      provider: options.provider ?? "deepseek",
    });
    this.name = "DeepSeekError";
  }
}

function toDeepSeekError(error: unknown, extra?: { durationMs?: number; attempts?: number }): DeepSeekError {
  if (error instanceof DeepSeekError) {
    return error;
  }
  if (error instanceof ProviderError) {
    return new DeepSeekError(error.message, {
      code: error.code,
      retryable: error.retryable,
      status: error.status,
      provider: error.provider ?? "deepseek",
      model: error.model,
      durationMs: extra?.durationMs ?? error.durationMs,
      attempts: extra?.attempts ?? error.attempts,
    });
  }
  return new DeepSeekError(error instanceof Error ? error.message : "DeepSeek 调用失败", {
    code: "PROVIDER_UNKNOWN",
    retryable: isRetryableNetworkError(error),
    durationMs: extra?.durationMs,
    attempts: extra?.attempts,
  });
}

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      reasoning_content?: string;
    };
  }>;
  error?: { message?: string };
  message?: string;
};

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const record = payload as Record<string, unknown>;
  const nested = record.error;
  if (nested && typeof nested === "object") {
    const message = (nested as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }
  return fallback;
}

function extractContent(payload: ChatCompletionResponse): string {
  const message = payload.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string" && content.trim()) {
    return content;
  }
  if (Array.isArray(content)) {
    const joined = content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
    if (joined) return joined;
  }
  if (typeof message?.reasoning_content === "string" && message.reasoning_content.trim()) {
    return message.reasoning_content;
  }
  throw new DeepSeekError("DeepSeek 未返回可解析的 JSON 内容");
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1)) as unknown;
    }
    throw new DeepSeekError("DeepSeek 返回内容不是合法 JSON");
  }
}

export class DeepSeekChatClient implements LlmProvider {
  readonly provider = "deepseek";
  readonly model = deepseekConfig.model;
  callCount = 0;
  lastDurationMs = 0;

  constructor(
    private readonly apiKey = requireDeepseekApiKey(),
    private readonly baseUrl = deepseekConfig.baseUrl,
  ) {}

  async completeJson(
    systemPrompt: string,
    userPrompt: string,
    options: LlmCompleteOptions = {},
  ): Promise<unknown> {
    const started = Date.now();
    try {
      return await withBoundedRetry(
        async (_attempt, signal) => {
          this.callCount += 1;
          const response = await fetch(joinUrl(this.baseUrl, "chat/completions"), {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: this.model,
              temperature: 0.2,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
            }),
            signal,
          });
          const payload = (await readJsonResponse(response)) as ChatCompletionResponse;
          if (!response.ok) {
            const classified = classifyHttpStatus(response.status);
            throw new ProviderError(
              `DeepSeek API 调用失败（HTTP ${response.status}）: ${errorMessage(payload, "unknown error")}`,
              {
                code: classified.code,
                retryable: classified.retryable,
                status: response.status,
                provider: this.provider,
                model: this.model,
              },
            );
          }
          try {
            return parseJsonContent(extractContent(payload));
          } catch (error) {
            throw new ProviderError(
              error instanceof Error ? error.message : "DeepSeek 返回内容不是合法 JSON",
              {
                code: "PROVIDER_INVALID_JSON",
                retryable: false,
                provider: this.provider,
                model: this.model,
              },
            );
          }
        },
        {
          maxRetries: providerConfig.maxRetries,
          timeoutMs: options.timeoutMs ?? providerConfig.timeoutMs,
          signal: options.signal,
        },
      );
    } catch (error) {
      throw toDeepSeekError(error, { durationMs: Date.now() - started });
    } finally {
      this.lastDurationMs = Date.now() - started;
    }
  }
}
