import { z } from "zod";
import { evidenceRefSchema } from "./evidence";
import { enterpriseProfileSchema } from "./profile";

export const speechDocumentSchema = z.object({
  speechId: z.string().min(1),
  title: z.string().min(1),
  date: z.string().nullable(),
  source: z.string().min(1),
  url: z.string().optional(),
  fullText: z.string().min(1),
  sha256: z.string().optional(),
  isDemoPlaceholder: z.boolean().optional(),
});

export type SpeechDocument = z.infer<typeof speechDocumentSchema>;

export const speechChunkSchema = z.object({
  chunkId: z.string().min(1),
  speechId: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  title: z.string().min(1),
  date: z.string().nullable(),
  source: z.string().min(1),
  url: z.string().optional(),
  text: z.string().min(1),
  keywords: z.array(z.string()),
  embeddingText: z.string().min(1),
  isDemoPlaceholder: z.boolean().optional(),
});

export type SpeechChunk = z.infer<typeof speechChunkSchema>;

export const relevanceSchema = z.enum(["strong", "medium", "weak", "irrelevant"]);

export type Relevance = z.infer<typeof relevanceSchema>;

export const speechRecommendationSchema = z.object({
  chunkId: z.string().min(1),
  speechId: z.string().min(1),
  title: z.string().min(1),
  date: z.string().nullable(),
  source: z.string().min(1),
  url: z.string().optional(),
  keywords: z.array(z.string()),
  quote: z.string().min(1),
  evidenceRef: evidenceRefSchema,
  relevance: relevanceSchema,
  reason: z.string().min(1),
  profileEvidenceIds: z.array(z.string()),
  isDemoPlaceholder: z.boolean().optional(),
});

export type SpeechRecommendation = z.infer<typeof speechRecommendationSchema>;

export const recommendSpeechesRequestSchema = z.object({
  confirmedProfile: enterpriseProfileSchema,
});
