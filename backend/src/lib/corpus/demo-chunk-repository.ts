import type { SpeechChunk } from "../schemas";
import type { ChunkRepository } from "./chunk-repository";
import { demoSpeechChunks } from "./demo-corpus";

export class DemoChunkRepository implements ChunkRepository {
  getByChunkId(chunkId: string): SpeechChunk | undefined {
    return demoSpeechChunks.find((chunk) => chunk.chunkId === chunkId);
  }

  listAll(): SpeechChunk[] {
    return demoSpeechChunks;
  }
}
