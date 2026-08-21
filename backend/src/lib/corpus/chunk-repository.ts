import type { SpeechChunk } from "../schemas";

/**
 * 检索与引用回填的 Chunk 读取边界。
 * 业务 Service 依赖本接口，不直接读取文件或依赖 ingestion 细节。
 * Demo 实现通过 Canonical Markdown → Document → Chunk 注入本仓库。
 */
export interface ChunkRepository {
  getByChunkId(chunkId: string): SpeechChunk | undefined;
  listAll(): SpeechChunk[];
}
