export type VectorRecord = {
  chunkId: string;
  speechId: string;
  vector: number[];
};

export type VectorSearchHit = {
  chunkId: string;
  score: number;
};

export interface VectorStore {
  upsert(records: VectorRecord[]): Promise<void>;
  search(vector: number[], topK: number): Promise<VectorSearchHit[]>;
  listChunkIds(): Promise<string[]>;
}

export class VectorStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VectorStoreError";
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator === 0 ? 0 : dot / denominator;
}

export class InMemoryVectorStore implements VectorStore {
  private records: VectorRecord[] = [];

  async upsert(records: VectorRecord[]): Promise<void> {
    const byId = new Map(this.records.map((record) => [record.chunkId, record]));
    for (const record of records) {
      byId.set(record.chunkId, record);
    }
    this.records = [...byId.values()];
  }

  async search(vector: number[], topK: number): Promise<VectorSearchHit[]> {
    return this.records
      .map((record) => ({
        chunkId: record.chunkId,
        score: cosineSimilarity(vector, record.vector),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, topK);
  }

  async listChunkIds(): Promise<string[]> {
    return this.records.map((record) => record.chunkId);
  }
}
