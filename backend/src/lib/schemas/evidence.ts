import { z } from "zod";

/**
 * MVP 冻结：Chunk 级 Evidence。
 * offset 相对于该 Chunk 的 Canonical `text`，半开区间 [startIndex, endIndex)。
 * 确认整个 Chunk 时 startIndex = 0 且 endIndex = chunk.text.length。
 */
export const evidenceRefSchema = z.object({
  speechId: z.string().min(1),
  chunkId: z.string().min(1),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
});

export type EvidenceRef = z.infer<typeof evidenceRefSchema>;
