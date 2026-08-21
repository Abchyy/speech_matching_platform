import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { recommendSpeechesRequestSchema } from "@/lib/schemas";
import { recommendSpeeches, toEvidenceList } from "@/lib/services/matching";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, recommendSpeechesRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const recommendations = recommendSpeeches(parsed.data.confirmedProfile);
    return jsonOk({
      recommendations,
      evidence: toEvidenceList(recommendations),
      next: {
        assets: "POST /api/assets/generate",
        note: "产品流程要求用户勾选 EvidenceRef 后再生成话语资产。",
      },
    });
  } catch (error) {
    return jsonError(
      "recommendation_failed",
      error instanceof Error ? error.message : "讲话推荐失败",
      500,
    );
  }
}
