import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { generateAssetsRequestSchema } from "@/lib/schemas";
import { generateAssetsPlaceholder } from "@/lib/services/assets";
import { resolveQuoteFromEvidenceRef } from "@/lib/services/evidence";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, generateAssetsRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    for (const ref of parsed.data.selectedEvidenceRefs) {
      resolveQuoteFromEvidenceRef(ref);
    }

    return jsonOk({
      placeholder: true,
      message: "话语资产生成尚未接入 LLM。当前仅校验 EvidenceRef 并可按 Chunk 回填原文。",
      assets: generateAssetsPlaceholder(parsed.data.selectedEvidenceRefs),
      next: {
        material: "POST /api/material/generate",
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
