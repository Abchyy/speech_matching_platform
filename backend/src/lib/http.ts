import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json({ error: code, message, details }, { status });
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: ZodSchema<T>,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false as const,
      response: jsonError("invalid_json", "请求体必须是合法 JSON", 400),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      response: jsonError(
        "invalid_request",
        "请求体未通过 Schema 校验",
        400,
        parsed.error.flatten(),
      ),
    };
  }

  return { ok: true as const, data: parsed.data };
}
