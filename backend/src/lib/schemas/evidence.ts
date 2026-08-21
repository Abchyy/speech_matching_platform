import { z } from "zod";

/**
 * MVP 冻结：Chunk 级 Evidence。
 * 字段保持 speechId / chunkId / startIndex / endIndex。
 * 运行时必须满足 startIndex === 0 且 endIndex === chunk.text.length；
 * 该约束在 Evidence service 中强制校验，不支持 Chunk 内 Span。
 */
export const evidenceRefSchema = z.object({
  speechId: z.string().min(1),
  chunkId: z.string().min(1),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
});

export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
