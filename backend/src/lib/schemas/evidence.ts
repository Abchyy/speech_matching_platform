import { z } from "zod";

/**
 * 严格 v1/v2 判别联合。
 * v1 保持 speechId / chunkId / startIndex / endIndex。
 * v2 必须包含 version=2 与全部语料绑定字段；缺任一字段 fail closed。
 * 运行时仍冻结为 Chunk 级：startIndex === 0 且 endIndex === chunk.text.length。
 */
export const evidenceRefV1Schema = z.object({
  speechId: z.string().min(1),
  chunkId: z.string().min(1),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
  version: z.literal(1).optional(),
});

export const evidenceRefV2Schema = z.object({
  speechId: z.string().min(1),
  chunkId: z.string().min(1),
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
  version: z.literal(2),
  domain: z.string().min(1),
  corpusVersion: z.string().min(1),
  documentId: z.string().min(1),
  documentContentHash: z.string().min(1),
  chunkContentHash: z.string().min(1),
});

export type EvidenceRefV1 = z.infer<typeof evidenceRefV1Schema>;
export type EvidenceRefV2 = z.infer<typeof evidenceRefV2Schema>;
export type EvidenceRef = EvidenceRefV1 | EvidenceRefV2;

function stripClientQuote(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }
  const record = { ...(input as Record<string, unknown>) };
  delete record.quote;
  return record;
}

export function decodeEvidenceRef(input: unknown): EvidenceRef {
  const stripped = stripClientQuote(input);
  const version =
    stripped && typeof stripped === "object" ? (stripped as { version?: unknown }).version : undefined;
  if (version === 2) {
    const parsed = evidenceRefV2Schema.safeParse(stripped);
    if (!parsed.success) {
      throw new Error("v2 EvidenceRef 缺少必要绑定字段");
    }
    return parsed.data;
  }
  if (version !== undefined && version !== 1) {
    throw new Error(`不支持的 Evidence 版本: ${String(version)}`);
  }
  const parsed = evidenceRefV1Schema.safeParse(stripped);
  if (!parsed.success) {
    throw new Error("EvidenceRef 未通过 Schema 校验");
  }
  return parsed.data;
}

export const evidenceRefSchema: z.ZodType<EvidenceRef> = z.any().transform((value, ctx) => {
  try {
    return decodeEvidenceRef(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "EvidenceRef 未通过 Schema 校验",
    });
    return z.NEVER;
  }
});
