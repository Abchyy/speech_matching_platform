import { z } from "zod";
import { discourseAssetsSchema } from "./assets";
import { evidenceRefSchema } from "./evidence";
import { enterpriseProfileSchema } from "./profile";

export const scenarioSchema = z.enum([
  "leadership_research",
  "government_symposium",
  "government_coordination",
]);

export type Scenario = z.infer<typeof scenarioSchema>;

export const generatedMaterialSchema = z.object({
  placeholder: z.boolean().optional(),
  scenario: scenarioSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  usedAssetIds: z.array(z.string()),
  usedSpeechIds: z.array(z.string()),
  usedEvidenceRefs: z.array(evidenceRefSchema),
});

export type GeneratedMaterial = z.infer<typeof generatedMaterialSchema>;

export const generateMaterialRequestSchema = z.object({
  confirmedProfile: enterpriseProfileSchema,
  selectedEvidenceRefs: z.array(evidenceRefSchema).min(1),
  confirmedAssets: discourseAssetsSchema,
  scenario: scenarioSchema,
  additionalRequirements: z.string().optional(),
});
