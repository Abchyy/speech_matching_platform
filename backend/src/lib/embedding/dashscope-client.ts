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

export class DashScopeEmbeddingClient implements EmbeddingClient {
  readonly model = embeddingConfig.model;

  constructor(
    private readonly apiKey = requireDashscopeApiKey(),
    private readonly baseUrl = embeddingConfig.baseUrl,
    private readonly dimensions = embeddingConfig.dimensions,
  ) {}

  async embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }
    if (isCompatibleMode(this.baseUrl)) {
      return this.embedCompatible(texts, inputType);
    }
    return this.embedNative(texts, inputType);
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
      throw new EmbeddingError(
        `Embedding API 调用失败（HTTP ${response.status}）: ${errorMessage(payload, "unknown error")}`,
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
      throw new EmbeddingError(
        `Embedding API 调用失败（HTTP ${response.status}）: ${errorMessage(payload, payload.code ?? "unknown error")}`,
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
