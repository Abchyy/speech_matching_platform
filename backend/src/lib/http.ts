import { NextResponse } from "next/server";
import type { ZodSchema } from "zod";
import { REQUEST_ID_HEADER, createRequestId, readRequestId } from "./tracing";

export { createRequestId, readRequestId, REQUEST_ID_HEADER };

export function jsonOk<T>(data: T, status = 200, requestId = createRequestId()) {
  return NextResponse.json(
    { ...data, requestId },
    { status, headers: { [REQUEST_ID_HEADER]: requestId } },
  );
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
  requestId = createRequestId(),
) {
  return NextResponse.json(
    { error: code, message, details, requestId },
    { status, headers: { [REQUEST_ID_HEADER]: requestId } },
  );
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: ZodSchema<T>,
  requestId = readRequestId(request),
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false as const,
      requestId,
      response: jsonError("invalid_json", "请求体必须是合法 JSON", 400, undefined, requestId),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false as const,
      requestId,
      response: jsonError(
        "invalid_request",
        "请求体未通过 Schema 校验",
        400,
        parsed.error.flatten(),
        requestId,
      ),
    };
  }

  return { ok: true as const, requestId, data: parsed.data };
}
