import { z } from "zod";

export const indexBuildStatusSchema = z.enum([
  "staging",
  "published",
  "failed",
  "rolled_back",
]);

export type IndexBuildStatus = z.infer<typeof indexBuildStatusSchema>;

export const indexManifestSchema = z.object({
  domain: z.string().min(1),
  corpusVersion: z.string().min(1),
  corpusFingerprint: z.string().min(1),
  chunkFingerprint: z.string().min(1),
  chunkPolicyVersion: z.string().min(1),
  recordCount: z.number().int().nonnegative(),
  embeddingProvider: z.string().min(1),
  embeddingModel: z.string().min(1),
  dimensions: z.number().int().positive(),
  indexVersion: z.string().min(1),
  buildStatus: indexBuildStatusSchema,
  createdAt: z.string().min(1),
  publishedAt: z.string().optional(),
  lexicalRecordCount: z.number().int().nonnegative().optional(),
});

export type IndexManifest = z.infer<typeof indexManifestSchema>;

export class IndexError extends Error {
  readonly code: string;

  constructor(message: string, code = "INDEX_ERROR") {
    super(message);
    this.name = "IndexError";
    this.code = code;
  }
}
