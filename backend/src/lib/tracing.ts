import { randomUUID } from "node:crypto";

export const REQUEST_ID_HEADER = "x-request-id";

export function createRequestId(): string {
  return randomUUID();
}

export function readRequestId(request: Request): string {
  const header = request.headers.get(REQUEST_ID_HEADER)?.trim();
  return header && header.length > 0 ? header : createRequestId();
}
