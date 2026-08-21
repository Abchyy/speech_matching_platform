import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { generateMaterialRequestSchema } from "@/lib/schemas";
import { generateScenarioMaterial } from "@/lib/services/material";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, generateMaterialRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const material = await generateScenarioMaterial({
      confirmedProfile: parsed.data.confirmedProfile,
      selectedEvidenceRefs: parsed.data.selectedEvidenceRefs,
      confirmedAssets: parsed.data.confirmedAssets,
      scenario: parsed.data.scenario,
      additionalRequirements: parsed.data.additionalRequirements,
    });
    return jsonOk({ material });
  } catch (error) {
    return jsonError(
      "material_generation_failed",
      error instanceof Error ? error.message : "场景材料生成失败",
      400,
    );
  }
}
