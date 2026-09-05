import type { SpeechChunk } from "../schemas";
import { CorpusIngestionError, type CanonicalDocument } from "./canonical-document";
import type { ChunkRepository } from "./chunk-repository";
import type { CorpusSnapshot } from "./fingerprint";

export class InMemoryChunkRepository implements ChunkRepository {
  private readonly byId: Map<string, SpeechChunk>;
  private readonly all: SpeechChunk[];
  private readonly documentsById: Map<string, CanonicalDocument>;
  private readonly snapshot: CorpusSnapshot | undefined;

  constructor(
    chunks: SpeechChunk[],
    documents: CanonicalDocument[] = [],
    snapshot?: CorpusSnapshot,
  ) {
    this.documentsById = new Map(documents.map((document) => [document.speechId, document]));
    this.snapshot = snapshot;
    const seen = new Set<string>();
    for (const chunk of chunks) {
      if (seen.has(chunk.chunkId)) {
        throw new CorpusIngestionError(`重复的 chunkId: ${chunk.chunkId}`);
      }
      seen.add(chunk.chunkId);
    }

    this.all = chunks.map((chunk) => {
      const copy: SpeechChunk = {
        ...chunk,
        keywords: [...chunk.keywords],
      };
      Object.freeze(copy.keywords);
      Object.freeze(copy);
      return copy;
    });
    this.byId = new Map(this.all.map((chunk) => [chunk.chunkId, chunk]));
  }

  getByChunkId(chunkId: string): SpeechChunk | undefined {
    return this.byId.get(chunkId);
  }

  listAll(): SpeechChunk[] {
    return [...this.all];
  }

  getDocument(speechId: string): CanonicalDocument | undefined {
    return this.documentsById.get(speechId);
  }

  getSnapshot(): CorpusSnapshot | undefined {
    return this.snapshot;
  }
}
