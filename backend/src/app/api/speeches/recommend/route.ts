import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { IndexError } from "@/lib/index";
import { recommendSpeechesRequestSchema } from "@/lib/schemas";
import { recommendSpeechesWithDiagnostics, toEvidenceList } from "@/lib/services/matching";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, recommendSpeechesRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const result = await recommendSpeechesWithDiagnostics(parsed.data.confirmedProfile);
    return jsonOk(
      {
        recommendations: result.recommendations,
        evidence: toEvidenceList(result.recommendations),
        diagnostics: result.diagnostics,
        next: {
          assets: "POST /api/assets/generate",
          note: "产品流程要求用户勾选 EvidenceRef 后再生成话语资产。",
        },
      },
      200,
      parsed.requestId,
    );
  } catch (error) {
    const unavailable = error instanceof IndexError;
    return jsonError(
      unavailable ? error.code : "recommendation_failed",
      error instanceof Error ? error.message : "讲话推荐失败",
      unavailable ? 503 : 500,
      undefined,
      parsed.requestId,
    );
  }
}
