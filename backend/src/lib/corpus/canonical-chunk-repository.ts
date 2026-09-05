import type { SpeechChunk } from "../schemas";
import type { CanonicalDocument } from "./canonical-document";
import type { ChunkRepository } from "./chunk-repository";
import type { CorpusSnapshot } from "./fingerprint";
import { InMemoryChunkRepository } from "./in-memory-chunk-repository";
import { ingestProjectCorpus } from "./ingestion";

/**
 * 正式 Canonical 语料的 ChunkRepository。
 * Canonical Source 为 corpus/cleaned/；运行时 Chunk 只来自 corpus/chunks/ Artifact。
 */
export class CanonicalChunkRepository implements ChunkRepository {
  private readonly inner: InMemoryChunkRepository;
  private readonly documentsById: Map<string, CanonicalDocument>;
  private readonly snapshot: CorpusSnapshot | undefined;

  constructor(
    chunks?: SpeechChunk[],
    documents: CanonicalDocument[] = [],
    snapshot?: CorpusSnapshot,
  ) {
    const loaded = chunks ? { chunks, documents, snapshot } : ingestProjectCorpus();
    this.inner = new InMemoryChunkRepository(loaded.chunks);
    this.documentsById = new Map((loaded.documents ?? documents).map((document) => [document.speechId, document]));
    this.snapshot = loaded.snapshot ?? snapshot;
  }

  getByChunkId(chunkId: string): SpeechChunk | undefined {
    return this.inner.getByChunkId(chunkId);
  }

  listAll(): SpeechChunk[] {
    return this.inner.listAll();
  }

  getDocument(speechId: string): CanonicalDocument | undefined {
    return this.documentsById.get(speechId);
  }

  getSnapshot(): CorpusSnapshot | undefined {
    return this.snapshot;
  }
}
