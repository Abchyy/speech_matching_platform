import { embeddingConfig, requireDashscopeApiKey } from "../config";
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

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new EmbeddingError(`Embedding API 返回了无法解析的响应（HTTP ${response.status}）`);
  }
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

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class DashScopeEmbeddingClient implements EmbeddingClient {
  readonly model = embeddingConfig.model;

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
    const attempts = 5;
    let lastError: unknown;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return isCompatibleMode(this.baseUrl)
          ? await this.embedCompatible(texts, inputType)
          : await this.embedNative(texts, inputType);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const retryable =
          message.includes("[retryable]") || /fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(message);
        if (!retryable || attempt === attempts - 1) {
          throw error;
        }
        await sleep(1000 * 2 ** attempt);
      }
    }
    throw lastError;
  }

  private async embedCompatible(
    texts: string[],
    inputType: EmbeddingInputType,
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
    });
    const payload = (await readJson(response)) as OpenAiEmbeddingResponse;
    if (!response.ok) {
      const message = `Embedding API 调用失败（HTTP ${response.status}）: ${errorMessage(payload, "unknown error")}`;
      if (isRetryableStatus(response.status)) {
        throw new EmbeddingError(`${message} [retryable]`);
      }
      throw new EmbeddingError(message);
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
    });
    const payload = (await readJson(response)) as DashscopeEmbeddingResponse;
    if (!response.ok) {
      const message = `Embedding API 调用失败（HTTP ${response.status}）: ${errorMessage(payload, payload.code ?? "unknown error")}`;
      if (isRetryableStatus(response.status)) {
        throw new EmbeddingError(`${message} [retryable]`);
      }
      throw new EmbeddingError(message);
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
