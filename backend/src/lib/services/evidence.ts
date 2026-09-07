import {
  defaultChunkRepository,
  hashCanonicalText,
  type ChunkRepository,
  type CorpusSnapshot,
} from "../corpus";
import {
  CORPUS_VERSION,
  XI_SPEECH_DOMAIN,
} from "../domain/xi-speech/constants";
import { decodeEvidenceRef, type EvidenceRef, type EvidenceRefV2, type SpeechChunk } from "../schemas";

export class EvidenceError extends Error {
  readonly code: string;

  constructor(message: string, code = "EVIDENCE_INVALID") {
    super(message);
    this.name = "EvidenceError";
    this.code = code;
  }
}

export type EvidenceContext = {
  domain?: string;
  corpusVersion?: string;
  snapshot?: CorpusSnapshot;
};

function chunkContentHash(chunk: SpeechChunk): string {
  return chunk.contentHash ?? hashCanonicalText(chunk.text);
}

function documentContentHash(chunk: SpeechChunk, repository?: ChunkRepository): string | undefined {
  if (chunk.documentContentHash) {
    return chunk.documentContentHash;
  }
  const document = repository?.getDocument?.(chunk.speechId);
  if (document?.sha256) {
    return document.sha256;
  }
  if (document?.fullText) {
    return hashCanonicalText(document.fullText);
  }
  return undefined;
}

export function toFullChunkEvidenceRef(
  chunk: SpeechChunk,
  context: EvidenceContext = {},
): EvidenceRefV2 {
  const snapshot = context.snapshot;
  const documentHash = documentContentHash(chunk);
  if (!documentHash) {
    throw new EvidenceError("无法签发 v2 Evidence：缺少 documentContentHash", "EVIDENCE_HASH_MISSING");
  }
  return {
    speechId: chunk.speechId,
    chunkId: chunk.chunkId,
    startIndex: 0,
    endIndex: chunk.text.length,
    version: 2,
    domain: context.domain ?? snapshot?.domain ?? XI_SPEECH_DOMAIN,
    corpusVersion: context.corpusVersion ?? snapshot?.corpusVersion ?? CORPUS_VERSION,
    documentId: chunk.speechId,
    documentContentHash: documentHash,
    chunkContentHash: chunkContentHash(chunk),
  };
}

export function parseEvidenceRef(input: unknown): EvidenceRef {
  try {
    return decodeEvidenceRef(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "EvidenceRef 未通过 Schema 校验";
    const code = message.includes("缺少必要绑定字段")
      ? "EVIDENCE_V2_INCOMPLETE"
      : message.includes("不支持的 Evidence 版本")
        ? "EVIDENCE_VERSION_UNSUPPORTED"
        : "EVIDENCE_INVALID";
    throw new EvidenceError(message, code);
  }
}

export function isVersionedEvidence(ref: EvidenceRef): ref is EvidenceRefV2 {
  return ref.version === 2;
}

export function assertChunkLevelEvidence(chunk: SpeechChunk, ref: EvidenceRef): void {
  if (ref.speechId !== chunk.speechId || ref.chunkId !== chunk.chunkId) {
    throw new EvidenceError("EvidenceRef 与 Chunk 标识不一致", "EVIDENCE_IDENTITY_MISMATCH");
  }
  if (isVersionedEvidence(ref) && ref.documentId !== chunk.speechId) {
    throw new EvidenceError("EvidenceRef documentId 与 speechId 不一致", "EVIDENCE_IDENTITY_MISMATCH");
  }

  if (ref.startIndex !== 0 || ref.endIndex !== chunk.text.length) {
    throw new EvidenceError(
      `仅支持 Chunk 级 Evidence，不支持 Chunk 内 Span 选择: ${ref.chunkId} [${ref.startIndex}, ${ref.endIndex}) / ${chunk.text.length}`,
      "EVIDENCE_SPAN_FORBIDDEN",
    );
  }
}

function assertVersionedBindings(
  chunk: SpeechChunk,
  ref: EvidenceRefV2,
  repository?: ChunkRepository,
): void {
  const snapshot = repository?.getSnapshot?.();
  if (ref.domain !== (snapshot?.domain ?? XI_SPEECH_DOMAIN)) {
    throw new EvidenceError("跨语料 Evidence 引用被拒绝", "EVIDENCE_CROSS_CORPUS");
  }
  if (ref.corpusVersion !== (snapshot?.corpusVersion ?? CORPUS_VERSION)) {
    throw new EvidenceError("跨语料版本 Evidence 引用被拒绝", "EVIDENCE_CROSS_CORPUS");
  }
  if (ref.documentId !== chunk.speechId) {
    throw new EvidenceError("EvidenceRef documentId 与 speechId 不一致", "EVIDENCE_IDENTITY_MISMATCH");
  }
  if (ref.chunkContentHash !== chunkContentHash(chunk)) {
    throw new EvidenceError("Chunk 内容哈希不一致，拒绝回填", "EVIDENCE_HASH_MISMATCH");
  }
  const expectedDocumentHash = documentContentHash(chunk, repository);
  if (!expectedDocumentHash || ref.documentContentHash !== expectedDocumentHash) {
    throw new EvidenceError("Document 内容哈希不一致，拒绝回填", "EVIDENCE_HASH_MISMATCH");
  }
}

export function resolveQuoteFromChunk(
  chunk: SpeechChunk,
  ref: EvidenceRef,
  repository?: ChunkRepository,
): string {
  const normalized = parseEvidenceRef(ref);
  assertChunkLevelEvidence(chunk, normalized);
  if (isVersionedEvidence(normalized)) {
    assertVersionedBindings(chunk, normalized, repository);
  }

  const quote = chunk.text.slice(normalized.startIndex, normalized.endIndex);
  if (quote !== chunk.text || !chunk.text.includes(quote)) {
    throw new EvidenceError("引用文本必须等于完整 Canonical Chunk", "EVIDENCE_QUOTE_MISMATCH");
  }
  return quote;
}

export function resolveQuoteFromEvidenceRef(
  ref: EvidenceRef,
  repository: ChunkRepository = defaultChunkRepository,
): string {
  const normalized = parseEvidenceRef(ref);
  const chunk = repository.getByChunkId(normalized.chunkId);
  if (!chunk) {
    throw new EvidenceError(`未找到 chunkId=${normalized.chunkId} 的 Canonical Chunk`, "EVIDENCE_UNKNOWN_CHUNK");
  }
  return resolveQuoteFromChunk(chunk, normalized, repository);
}
