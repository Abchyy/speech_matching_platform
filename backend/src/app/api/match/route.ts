import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { IndexError } from "@/lib/index";
import { generateProfileRequestSchema } from "@/lib/schemas";
import { recommendSpeechesWithDiagnostics, toEvidenceList } from "@/lib/services/matching";
import { generateProfileUseCase } from "@/lib/services/profile-llm";

export async function GET() {
  return jsonOk({
    description: "Vertical Slice 入口：企业信息 → 画像结构化 → 向量检索 → Rerank → Evidence 列表。",
    method: "POST",
    input: {
      rawCompanyDescription: "string",
      companyName: "string?",
      industry: "string?",
      techDomains: "string[]?",
      developmentNeeds: "string?",
    },
  });
}

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, generateProfileRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const generated = await generateProfileUseCase(parsed.data, { allowRulesFallback: true });
    const result = await recommendSpeechesWithDiagnostics(generated.profile);

    return jsonOk({
      profile: generated.profile,
      profileConfirmed: false,
      generator: generated.generator,
      fallback: generated.fallback,
      recommendations: result.recommendations,
      evidence: toEvidenceList(result.recommendations),
      diagnostics: result.diagnostics,
      generation: {
        assets: {
          method: "POST",
          path: "/api/assets/generate",
          status: "ready",
          required: ["confirmedProfile", "selectedEvidenceRefs"],
        },
        material: {
          method: "POST",
          path: "/api/material/generate",
          status: "ready",
          required: [
            "confirmedProfile",
            "selectedEvidenceRefs",
            "confirmedAssets",
            "scenario",
          ],
        },
      },
      notes: [
        "当前匹配已接入已发布索引上的混合检索与 DeepSeek Rerank；话语资产与场景材料已接入 DeepSeek。",
        "返回的 quote 由程序按 EvidenceRef 从 Canonical Chunk 回填，不是模型生成。",
        "产品流程仍要求画像确认后再匹配；本接口仅用于打通后端链路。",
      ],
    }, 200, parsed.requestId);
  } catch (error) {
    const unavailable = error instanceof IndexError;
    return jsonError(
      unavailable ? error.code : "match_failed",
      error instanceof Error ? error.message : "匹配流程失败",
      unavailable ? 503 : 500,
      undefined,
      parsed.requestId,
    );
  }
}
