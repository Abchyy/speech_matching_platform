import { getDemoChunkById } from "../corpus/demo-corpus";
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

export function sliceCanonicalQuote(text: string, ref: EvidenceRef): string {
  if (ref.startIndex < 0 || ref.endIndex > text.length || ref.startIndex >= ref.endIndex) {
    throw new EvidenceError(
      `EvidenceRef 偏移无效: ${ref.chunkId} [${ref.startIndex}, ${ref.endIndex}) / ${text.length}`,
    );
  }

  return text.slice(ref.startIndex, ref.endIndex);
}

export function resolveQuoteFromChunk(chunk: SpeechChunk, ref: EvidenceRef): string {
  if (ref.speechId !== chunk.speechId || ref.chunkId !== chunk.chunkId) {
    throw new EvidenceError("EvidenceRef 与 Chunk 标识不一致");
  }

  const quote = sliceCanonicalQuote(chunk.text, ref);

  if (!chunk.text.includes(quote) || quote !== chunk.text.slice(ref.startIndex, ref.endIndex)) {
    throw new EvidenceError("引用文本不是 Canonical Chunk 的原样子串");
  }

  return quote;
}

export function resolveQuoteFromEvidenceRef(ref: EvidenceRef): string {
  const chunk = getDemoChunkById(ref.chunkId);
  if (!chunk) {
    throw new EvidenceError(`未找到 chunkId=${ref.chunkId} 的 Canonical Chunk`);
  }

  return resolveQuoteFromChunk(chunk, ref);
}
