import type { ChunkRepository } from "./chunk-repository";
import { InMemoryChunkRepository } from "./in-memory-chunk-repository";
import { ingestProjectCorpus } from "./ingestion";
import type { SpeechChunk } from "../schemas";

/**
 * 正式 Canonical 语料的 ChunkRepository。
 * 源为 corpus/cleaned/，Chunk 由当前后端 Chunker 从原文生成。
 */
export class CanonicalChunkRepository implements ChunkRepository {
  private readonly inner: InMemoryChunkRepository;

  constructor(chunks: SpeechChunk[] = ingestProjectCorpus().chunks) {
    this.inner = new InMemoryChunkRepository(chunks);
  }

  getByChunkId(chunkId: string): SpeechChunk | undefined {
    return this.inner.getByChunkId(chunkId);
  }

  listAll(): SpeechChunk[] {
    return this.inner.listAll();
  }
}
