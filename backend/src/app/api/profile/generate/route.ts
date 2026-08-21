import { jsonError, jsonOk, parseJsonRequest } from "@/lib/http";
import { generateProfileRequestSchema } from "@/lib/schemas";
import { generateEnterpriseProfile } from "@/lib/services/profile";

export async function POST(request: Request) {
  const parsed = await parseJsonRequest(request, generateProfileRequestSchema);
  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const profile = generateEnterpriseProfile(parsed.data);
    return jsonOk({
      profile,
      profileConfirmed: false,
      next: {
        recommend: "POST /api/speeches/recommend",
        note: "产品流程要求用户确认画像后再进入讲话匹配。",
      },
    });
  } catch (error) {
    return jsonError(
      "profile_generation_failed",
      error instanceof Error ? error.message : "企业画像生成失败",
      500,
    );
  }
}
