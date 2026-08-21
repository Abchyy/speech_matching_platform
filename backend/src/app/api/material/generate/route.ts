import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { generateMaterialRequestSchema } from "@/lib/schemas";
import { resolveQuoteFromEvidenceRef } from "@/lib/services/evidence";
import { generateMaterialPlaceholder } from "@/lib/services/material";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, generateMaterialRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    for (const ref of parsed.data.selectedEvidenceRefs) {
      resolveQuoteFromEvidenceRef(ref);
    }

    return jsonOk({
      placeholder: true,
      message: "场景材料生成尚未接入 LLM。当前仅保留接口契约，并校验 EvidenceRef。",
      material: generateMaterialPlaceholder({
        selectedEvidenceRefs: parsed.data.selectedEvidenceRefs,
        confirmedAssets: parsed.data.confirmedAssets,
        scenario: parsed.data.scenario,
      }),
    });
  } catch (error) {
    return jsonError(
      "material_generation_failed",
      error instanceof Error ? error.message : "场景材料生成失败",
      400,
    );
  }
}
