export type EmbeddingInputType = "query" | "document";

export interface EmbeddingClient {
  readonly model: string;
  embed(texts: string[], inputType: EmbeddingInputType): Promise<number[][]>;
}

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector.map(() => 0);
  }
  return vector.map((value) => value / norm);
}

/**
 * 测试用确定性向量：按字符散列到固定维度。
 * 不调用外部 API，也不作为正式检索模型。
 */
export class HashEmbeddingClient implements EmbeddingClient {
  readonly model = "hash-embedding-test";

  constructor(private readonly dimensions = 64) {}

  async embed(texts: string[], _inputType: EmbeddingInputType): Promise<number[][]> {
    return texts.map((text) => {
      const vector = Array.from({ length: this.dimensions }, () => 0);
      for (const char of text) {
        const code = char.codePointAt(0) ?? 0;
        const index = code % this.dimensions;
        vector[index] = (vector[index] ?? 0) + 1;
      }
      return l2Normalize(vector);
    });
  }
}
