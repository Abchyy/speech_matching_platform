import { deepseekConfig, requireDeepseekApiKey } from "../config";

export class DeepSeekError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSeekError";
  }
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

export class DeepSeekChatClient {
  readonly model = deepseekConfig.model;

  constructor(
    private readonly apiKey = requireDeepseekApiKey(),
    private readonly baseUrl = deepseekConfig.baseUrl,
  ) {}

  async completeJson(systemPrompt: string, userPrompt: string): Promise<unknown> {
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
    });

    const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;
    if (!response.ok) {
      throw new DeepSeekError(
        `DeepSeek API 调用失败（HTTP ${response.status}）: ${errorMessage(payload, "unknown error")}`,
      );
    }

    return parseJsonContent(extractContent(payload));
  }
}
