import { embeddingConfig, providerConfig, requireDashscopeApiKey } from "../config";
import {
  ProviderError,
  classifyHttpStatus,
  readJsonResponse,
  withBoundedRetry,
} from "../providers";
import {
  EmbeddingError,
  type EmbeddingClient,
  type EmbeddingInputType,
} from "./embedding-client";

type OpenAiEmbeddingResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
};

type DashscopeEmbeddingResponse = {
  output?: {
    embeddings?: Array<{ embedding?: number[]; text_index?: number }>;
  };
  message?: string;
  code?: string;
};

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function isCompatibleMode(baseUrl: string): boolean {
  return baseUrl.includes("compatible-mode");
}

function nativeEmbeddingUrl(baseUrl: string): string {
  if (baseUrl.includes("/services/embeddings/")) {
    return baseUrl;
  }
  const origin = baseUrl.replace(/\/compatible-mode\/v1\/?$/, "").replace(/\/+$/, "");
  return `${origin}/api/v1/services/embeddings/text-embedding/text-embedding`;
}



function errorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const record = payload as Record<string, unknown>;
  const nestedError = record.error;
  if (nestedError && typeof nestedError === "object") {
    const message = (nestedError as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  if (typeof record.message === "string" && record.message.length > 0) {
    return record.message;
  }
  return fallback;
}

export class DashScopeEmbeddingClient implements EmbeddingClient {
  readonly model = embeddingConfig.model;
  callCount = 0;
  lastDurationMs = 0;

  constructor(
    private readonly apiKey = requireDashscopeApiKey(),
    private readonly baseUrl = embeddingConfig.baseUrl,
    private readonly dimensions = embeddingConfig.dimensions,
    private readonly batchSize = embeddingConfig.batchSize,
  ) {}

  async embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    const size = Math.max(1, this.batchSize);
    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += size) {
      const batch = texts.slice(offset, offset + size);
      const part = await this.embedBatchWithRetry(batch, inputType);
      vectors.push(...part);
    }
    return vectors;
  }

  private async embedBatchWithRetry(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<number[][]> {
    const started = Date.now();
    try {
      return await withBoundedRetry(
        async (_attempt, signal) => {
          this.callCount += 1;
          return isCompatibleMode(this.baseUrl)
            ? await this.embedCompatible(texts, inputType, signal)
            : await this.embedNative(texts, inputType, signal);
        },
        {
          maxRetries: providerConfig.maxRetries,
          timeoutMs: providerConfig.timeoutMs,
        },
      );
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw error;
      }
      if (error instanceof ProviderError) {
        throw new EmbeddingError(error.message, {
          code: error.code,
          retryable: error.retryable,
          status: error.status,
          provider: error.provider ?? "dashscope",
          model: error.model ?? this.model,
          durationMs: error.durationMs ?? Date.now() - started,
          attempts: error.attempts,
        });
      }
      throw error;
    } finally {
      this.lastDurationMs += Date.now() - started;
    }
  }

  private async embedCompatible(
    texts: string[],
    inputType: EmbeddingInputType,
    signal?: AbortSignal,
  ): Promise<number[][]> {
    const response = await fetch(joinUrl(this.baseUrl, "embeddings"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
        encoding_format: "float",
        text_type: inputType,
      }),
      signal,
    });
    const payload = (await readJsonResponse(response)) as OpenAiEmbeddingResponse;
    if (!response.ok) {
      const classified = classifyHttpStatus(response.status);
      throw new ProviderError(
        `Embedding API 调用失败（HTTP ${response.status}）: ${errorMessage(payload, "unknown error")}`,
        {
          code: classified.code,
          retryable: classified.retryable,
          status: response.status,
          provider: "dashscope",
          model: this.model,
        },
      );
    }
    const items = [...(payload.data ?? [])].sort(
      (left, right) => (left.index ?? 0) - (right.index ?? 0),
    );
    if (items.length !== texts.length || items.some((item) => !item.embedding?.length)) {
      throw new EmbeddingError("Embedding API 返回向量数量与输入不一致");
    }
    return items.map((item) => item.embedding as number[]);
  }

  private async embedNative(
    texts: string[],
    inputType: EmbeddingInputType,
    signal?: AbortSignal,
  ): Promise<number[][]> {
    const response = await fetch(nativeEmbeddingUrl(this.baseUrl), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: { texts },
        parameters: {
          dimension: this.dimensions,
          text_type: inputType,
        },
      }),
      signal,
    });
    const payload = (await readJsonResponse(response)) as DashscopeEmbeddingResponse;
    if (!response.ok) {
      const classified = classifyHttpStatus(response.status);
      throw new ProviderError(
        `Embedding API 调用失败（HTTP ${response.status}）: ${errorMessage(payload, payload.code ?? "unknown error")}`,
        {
          code: classified.code,
          retryable: classified.retryable,
          status: response.status,
          provider: "dashscope",
          model: this.model,
        },
      );
    }
    const items = [...(payload.output?.embeddings ?? [])].sort(
      (left, right) => (left.text_index ?? 0) - (right.text_index ?? 0),
    );
    if (items.length !== texts.length || items.some((item) => !item.embedding?.length)) {
      throw new EmbeddingError("Embedding API 返回向量数量与输入不一致");
    }
    return items.map((item) => item.embedding as number[]);
  }
}
