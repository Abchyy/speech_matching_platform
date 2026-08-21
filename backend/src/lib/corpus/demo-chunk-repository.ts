import type { ChunkRepository } from "./chunk-repository";
import { InMemoryChunkRepository } from "./in-memory-chunk-repository";
import { ingestDemoCorpus } from "./ingestion";
import type { SpeechChunk } from "../schemas";

/**
 * Demo 语料的 ChunkRepository。
 * Chunk 由 corpus/demo Canonical Markdown 经 ingestion 生成，不手写维护。
 */
export class DemoChunkRepository implements ChunkRepository {
  private readonly inner: InMemoryChunkRepository;

  constructor(chunks: SpeechChunk[] = ingestDemoCorpus().chunks) {
    this.inner = new InMemoryChunkRepository(chunks);
  }

  getByChunkId(chunkId: string): SpeechChunk | undefined {
    return this.inner.getByChunkId(chunkId);
  }

  listAll(): SpeechChunk[] {
    return this.inner.listAll();
  }
}
