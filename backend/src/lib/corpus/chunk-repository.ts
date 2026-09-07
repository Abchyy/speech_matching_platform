import type { SpeechChunk } from "../schemas";
import type { CanonicalDocument } from "./canonical-document";
import type { CorpusSnapshot } from "./fingerprint";

/**
 * 检索与引用回填的 Chunk 读取边界。
 * 运行时实现只读取已发布 Chunk Artifact，不再从 Canonical Markdown 现场切块。
 */
export interface ChunkRepository {
  getByChunkId(chunkId: string): SpeechChunk | undefined;
  listAll(): SpeechChunk[];
  getDocument?(speechId: string): CanonicalDocument | undefined;
  getSnapshot?(): CorpusSnapshot | undefined;
}
