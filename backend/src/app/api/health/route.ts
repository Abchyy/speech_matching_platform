import { jsonOk } from "@/lib/http";
import { appConfig, workflowStages } from "@/lib/config";

export async function GET() {
  return jsonOk({
    status: "ok",
    mockMode: appConfig.mockMode,
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
