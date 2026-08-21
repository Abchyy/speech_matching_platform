export const appConfig = {
  name: "speech-matching-platform",
  mockMode: true,
  /** 工程默认值，产品侧推荐数量尚未冻结。 */
  recommendationLimit: 5,
  /** 工程默认值，Vector Top-K 尚未冻结。 */
  retrievalTopK: 20,
  /** 工程默认值，同一讲话保留几个 Chunk 尚未冻结。 */
  maxChunksPerSpeech: 2,
} as const;

export const workflowStages = [
  "PROFILE_DRAFT",
  "PROFILE_CONFIRMED",
  "RECOMMENDATIONS_READY",
  "SPEECHES_SELECTED",
  "ASSETS_DRAFT",
  "ASSETS_CONFIRMED",
  "SCENARIO_DEFINED",
  "MATERIAL_READY",
] as const;

export type WorkflowStage = (typeof workflowStages)[number];
