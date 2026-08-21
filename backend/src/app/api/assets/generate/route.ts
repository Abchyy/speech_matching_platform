import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { generateAssetsRequestSchema } from "@/lib/schemas";
import { generateDiscourseAssets } from "@/lib/services/assets";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, generateAssetsRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const assets = await generateDiscourseAssets(
      parsed.data.confirmedProfile,
      parsed.data.selectedEvidenceRefs,
    );
    return jsonOk({
      assets,
      next: {
        material: "POST /api/material/generate",
        note: "产品流程要求用户确认话语资产后再生成场景材料。",
      },
    });
  } catch (error) {
    return jsonError(
      "assets_generation_failed",
      error instanceof Error ? error.message : "话语资产生成失败",
      400,
    );
  }
}
