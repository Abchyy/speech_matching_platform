import { z } from "zod";
import { evidenceRefSchema } from "./evidence";
import { enterpriseProfileSchema } from "./profile";

export const discourseAssetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  text: z.string().min(1),
  profileEvidenceIds: z.array(z.string()),
  evidenceRefs: z.array(evidenceRefSchema),
});

export type DiscourseAsset = z.infer<typeof discourseAssetSchema>;

export const discourseAssetsSchema = z.object({
  placeholder: z.boolean().optional(),
  technologyInnovation: z.array(discourseAssetSchema),
  industryValue: z.array(discourseAssetSchema),
  socialValue: z.array(discourseAssetSchema),
  developmentPositioning: z.array(discourseAssetSchema),
});

export type DiscourseAssets = z.infer<typeof discourseAssetsSchema>;

export const generateAssetsRequestSchema = z.object({
  confirmedProfile: enterpriseProfileSchema,
  selectedEvidenceRefs: z.array(evidenceRefSchema).min(1),
});
