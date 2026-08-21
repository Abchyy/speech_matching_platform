import type { SpeechChunk } from "../schemas";
import type { ChunkRepository } from "./chunk-repository";
import { CorpusIngestionError } from "./canonical-document";

export class InMemoryChunkRepository implements ChunkRepository {
  private readonly byId: Map<string, SpeechChunk>;
  private readonly all: SpeechChunk[];

  constructor(chunks: SpeechChunk[]) {
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
}
