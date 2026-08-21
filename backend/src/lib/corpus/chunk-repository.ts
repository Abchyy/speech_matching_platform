import type { SpeechChunk } from "../schemas";

/**
 * 检索与引用回填的 Chunk 读取边界。
 * 业务 Service 依赖本接口，不直接依赖 Demo 语料实现。
 * 后续可用 CanonicalChunkRepository 替换 DemoChunkRepository。
 */
export interface ChunkRepository {
  getByChunkId(chunkId: string): SpeechChunk | undefined;
  listAll(): SpeechChunk[];
}
