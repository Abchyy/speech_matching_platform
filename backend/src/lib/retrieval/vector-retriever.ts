import type { EmbeddingClient } from "../embedding";
import type { ChunkRepository } from "../corpus";
import type { VectorStore } from "../vector";
import type { RetrievedCandidate, RetrievalQuery, Retriever } from "./types";

export class VectorRetriever implements Retriever {
  readonly channel = "dense" as const;

  constructor(
    private readonly embeddingClient: EmbeddingClient,
    private readonly vectorStore: VectorStore,
    private readonly chunkRepository: ChunkRepository,
  ) {}

  async retrieve(query: RetrievalQuery): Promise<RetrievedCandidate[]> {
    if (!query.text.trim()) {
      return [];
    }
    const [vector] = await this.embeddingClient.embed([query.text], "query");
    if (!vector) {
      return [];
    }
    const hits = await this.vectorStore.search(vector, query.topK);
    const results: RetrievedCandidate[] = [];
    for (const [index, hit] of hits.entries()) {
      const chunk = this.chunkRepository.getByChunkId(hit.chunkId);
      if (!chunk) {
        throw new Error(`向量命中了未知 chunkId=${hit.chunkId}，无法回溯 Canonical Chunk`);
      }
      if (!passesMetadataFilter(chunk, query)) {
        continue;
      }
      results.push({
        chunk,
        channels: ["dense"],
        scores: { dense: hit.score, denseRank: index + 1 },
      });
    }
    return results;
  }
}

export function passesMetadataFilter(
  chunk: { speechId: string; keywords: string[] },
  query: RetrievalQuery,
): boolean {
  const speechIds = query.metadataFilters?.speechIds;
  if (speechIds && speechIds.length > 0 && !speechIds.includes(chunk.speechId)) {
    return false;
  }
  const keywords = query.metadataFilters?.keywords;
  if (keywords && keywords.length > 0) {
    const haystack = chunk.keywords.join(" ");
    if (!keywords.some((keyword) => haystack.includes(keyword))) {
      return false;
    }
  }
  return true;
}
