export type ProviderErrorCode =
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_INVALID_JSON"
  | "PROVIDER_SCHEMA"
  | "PROVIDER_ABORTED"
  | "PROVIDER_AUTH"
  | "PROVIDER_UNKNOWN";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly provider?: string;
  readonly model?: string;
  readonly durationMs?: number;
  readonly attempts?: number;

  constructor(
    message: string,
    options: {
      code: ProviderErrorCode;
      retryable: boolean;
      status?: number;
      provider?: string;
      model?: string;
      durationMs?: number;
      attempts?: number;
    },
  ) {
    super(message);
    this.name = "ProviderError";
    this.code = options.code;
    this.retryable = options.retryable;
    this.status = options.status;
    this.provider = options.provider;
    this.model = options.model;
    this.durationMs = options.durationMs;
    this.attempts = options.attempts;
  }
}

export function classifyHttpStatus(status: number): {
  code: ProviderErrorCode;
  retryable: boolean;
} {
  if (status === 408) {
    return { code: "PROVIDER_TIMEOUT", retryable: true };
  }
  if (status === 429) {
    return { code: "PROVIDER_RATE_LIMITED", retryable: true };
  }
  if (status === 401 || status === 403) {
    return { code: "PROVIDER_AUTH", retryable: false };
  }
  if (status >= 500) {
    return { code: "PROVIDER_UNAVAILABLE", retryable: true };
  }
  return { code: "PROVIDER_UNKNOWN", retryable: false };
}

export function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof ProviderError) {
    return error.retryable;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|UND_ERR|aborted|timeout/i.test(message);
}
