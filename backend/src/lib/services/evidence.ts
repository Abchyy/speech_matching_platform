import { defaultChunkRepository, type ChunkRepository } from "../corpus";
import type { EvidenceRef, SpeechChunk } from "../schemas";

export class EvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceError";
  }
}

export function toFullChunkEvidenceRef(chunk: SpeechChunk): EvidenceRef {
  return {
    speechId: chunk.speechId,
    chunkId: chunk.chunkId,
    startIndex: 0,
    endIndex: chunk.text.length,
  };
}

export function assertChunkLevelEvidence(chunk: SpeechChunk, ref: EvidenceRef): void {
  if (ref.speechId !== chunk.speechId || ref.chunkId !== chunk.chunkId) {
    throw new EvidenceError("EvidenceRef 与 Chunk 标识不一致");
  }

  if (ref.startIndex !== 0 || ref.endIndex !== chunk.text.length) {
    throw new EvidenceError(
      `MVP 仅支持 Chunk 级 Evidence，不支持 Chunk 内 Span 选择: ${ref.chunkId} [${ref.startIndex}, ${ref.endIndex}) / ${chunk.text.length}`,
    );
  }
}

export function resolveQuoteFromChunk(chunk: SpeechChunk, ref: EvidenceRef): string {
  assertChunkLevelEvidence(chunk, ref);

  const quote = chunk.text.slice(ref.startIndex, ref.endIndex);

  if (quote !== chunk.text || !chunk.text.includes(quote)) {
    throw new EvidenceError("引用文本必须等于完整 Canonical Chunk");
  }

  return quote;
}

export function resolveQuoteFromEvidenceRef(
  ref: EvidenceRef,
  repository: ChunkRepository = defaultChunkRepository,
): string {
  const chunk = repository.getByChunkId(ref.chunkId);
  if (!chunk) {
    throw new EvidenceError(`未找到 chunkId=${ref.chunkId} 的 Canonical Chunk`);
  }

  return resolveQuoteFromChunk(chunk, ref);
}
