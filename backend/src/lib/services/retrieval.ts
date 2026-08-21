import { embeddingConfig } from "../config";
import { defaultChunkRepository, type ChunkRepository } from "../corpus";
import type { EmbeddingClient } from "../embedding";
import type { SpeechChunk } from "../schemas";
import { defaultLanceDbUri, type VectorSearchHit, type VectorStore } from "../vector";

export class RetrievalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalError";
  }
}

export type RetrievedChunk = {
  chunk: SpeechChunk;
  score: number;
};

function sameIdSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = [...right].sort();
  return [...left].sort().every((id, index) => id === expected[index]);
}

export async function indexChunks(
  chunks: SpeechChunk[],
  embeddingClient: EmbeddingClient,
  vectorStore: VectorStore,
): Promise<{ dimensions: number }> {
  if (chunks.length === 0) {
    throw new RetrievalError("没有可索引的 Canonical Chunk");
  }

  const vectors = await embeddingClient.embed(
    chunks.map((chunk) => chunk.embeddingText),
    "document",
  );
  if (vectors.length !== chunks.length) {
    throw new RetrievalError("Embedding 数量与 Chunk 数量不一致");
  }

  await vectorStore.upsert(
    chunks.map((chunk, index) => ({
      chunkId: chunk.chunkId,
      speechId: chunk.speechId,
      vector: vectors[index] ?? [],
    })),
  );
  return { dimensions: vectors[0]?.length ?? 0 };
}

export type ChunkIndexStats = {
  model: string;
  dimensions: number;
  batchSize: number;
  batchCount: number;
  recordCount: number;
  uri: string;
};

export async function indexChunksWithStats(
  chunks: SpeechChunk[],
  embeddingClient: EmbeddingClient,
  vectorStore: VectorStore,
  uri = defaultLanceDbUri(),
): Promise<ChunkIndexStats> {
  const batchSize = Math.max(1, embeddingConfig.batchSize);
  const { dimensions } = await indexChunks(chunks, embeddingClient, vectorStore);
  const indexed = await vectorStore.listChunkIds();
  return {
    model: embeddingClient.model,
    dimensions,
    batchSize,
    batchCount: Math.ceil(chunks.length / batchSize),
    recordCount: indexed.length,
    uri,
  };
}

export async function ensureChunkIndex(
  chunkRepository: ChunkRepository,
  embeddingClient: EmbeddingClient,
  vectorStore: VectorStore,
): Promise<void> {
  const chunks = chunkRepository.listAll();
  const indexed = await vectorStore.listChunkIds();
  if (sameIdSet(indexed, chunks.map((chunk) => chunk.chunkId))) {
    return;
  }
  await indexChunks(chunks, embeddingClient, vectorStore);
}

export async function retrieveRelevantChunks(
  queryText: string,
  options: {
    topK: number;
    embeddingClient: EmbeddingClient;
    vectorStore: VectorStore;
    chunkRepository?: ChunkRepository;
  },
): Promise<RetrievedChunk[]> {
  const chunkRepository = options.chunkRepository ?? defaultChunkRepository;
  if (!queryText.trim()) {
    throw new RetrievalError("检索查询不能为空");
  }

  const [queryVector] = await options.embeddingClient.embed([queryText], "query");
  if (!queryVector) {
    throw new RetrievalError("查询文本未能生成 embedding");
  }

  const hits: VectorSearchHit[] = await options.vectorStore.search(queryVector, options.topK);
  const retrieved: RetrievedChunk[] = [];

  for (const hit of hits) {
    const chunk = chunkRepository.getByChunkId(hit.chunkId);
    if (!chunk) {
      throw new RetrievalError(`向量命中了未知 chunkId=${hit.chunkId}，无法回溯 Canonical Chunk`);
    }
    retrieved.push({ chunk, score: hit.score });
  }

  return retrieved;
}
