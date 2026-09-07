import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { generateProfileRequestSchema } from "@/lib/schemas";
import { generateProfileUseCase } from "@/lib/services/profile-llm";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, generateProfileRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const generated = await generateProfileUseCase(parsed.data, { allowRulesFallback: true });
    return jsonOk(
      {
        profile: generated.profile,
        profileConfirmed: false,
        generator: generated.generator,
        fallback: generated.fallback,
        next: {
          recommend: "POST /api/speeches/recommend",
          note: "产品流程要求用户确认画像后再进入讲话匹配。",
        },
      },
      200,
      parsed.requestId,
    );
  } catch (error) {
    return jsonError(
      "profile_generation_failed",
      error instanceof Error ? error.message : "企业画像生成失败",
      500,
      undefined,
      parsed.requestId,
    );
  }
}
