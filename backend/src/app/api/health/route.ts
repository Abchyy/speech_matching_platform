import { jsonOk } from "@/lib/http";
import { appConfig, deepseekConfig, embeddingConfig, workflowStages } from "@/lib/config";

export async function GET() {
  return jsonOk({
    status: "ok",
    mockMode: appConfig.mockMode,
    vectorRetrieval: true,
    reranker: true,
    embeddingModel: embeddingConfig.model,
    rerankerModel: deepseekConfig.model,
    assetsGenerator: true,
    workflowStages,
    endpoints: {
      match: "POST /api/match",
      profile: "POST /api/profile/generate",
      recommend: "POST /api/speeches/recommend",
      assets: "POST /api/assets/generate",
      material: "POST /api/material/generate",
    },
  });
}
