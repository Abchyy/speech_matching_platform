import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { generateProfileRequestSchema } from "@/lib/schemas";
import { recommendSpeeches, toEvidenceList } from "@/lib/services/matching";
import { generateEnterpriseProfile } from "@/lib/services/profile";

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
    const profile = generateEnterpriseProfile(parsed.data);
    const recommendations = await recommendSpeeches(profile);

    return jsonOk({
      profile,
      profileConfirmed: false,
      recommendations,
      evidence: toEvidenceList(recommendations),
      generation: {
        assets: {
          method: "POST",
          path: "/api/assets/generate",
          status: "placeholder",
          required: ["confirmedProfile", "selectedEvidenceRefs"],
        },
        material: {
          method: "POST",
          path: "/api/material/generate",
          status: "placeholder",
          required: [
            "confirmedProfile",
            "selectedEvidenceRefs",
            "confirmedAssets",
            "scenario",
          ],
        },
      },
      notes: [
        "当前匹配已接入 Embedding + 向量检索 + DeepSeek Rerank；画像与生成仍为 mock/占位。",
        "返回的 quote 由程序按 EvidenceRef 从 Demo Chunk 切片回填，不是模型生成。",
        "Demo 语料明确标注为占位文本，不是总书记讲话原文。",
        "产品流程仍要求画像确认后再匹配；本接口仅用于打通后端链路。",
      ],
    });
  } catch (error) {
    return jsonError(
      "match_failed",
      error instanceof Error ? error.message : "匹配流程失败",
      500,
    );
  }
}
