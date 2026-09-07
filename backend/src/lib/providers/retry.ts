import { ProviderError } from "./errors";

export type RetryOptions = {
  maxRetries: number;
  timeoutMs: number;
  signal?: AbortSignal;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ProviderError("调用已取消", { code: "PROVIDER_ABORTED", retryable: false }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new ProviderError("调用已取消", { code: "PROVIDER_ABORTED", retryable: false }));
      },
      { once: true },
    );
  });
}

export async function withBoundedRetry<T>(
  operation: (attempt: number, signal: AbortSignal) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const attempts = Math.max(1, options.maxRetries + 1);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const timeout = AbortSignal.timeout(options.timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    try {
      return await operation(attempt, signal);
    } catch (error) {
      lastError = error;
      const timedOut =
        (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) ||
        (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "TimeoutError");
      const retryable = error instanceof ProviderError ? error.retryable : timedOut;
      if (!retryable || attempt === attempts) {
        if (timedOut) {
          throw new ProviderError(`Provider 调用超时（${options.timeoutMs}ms）`, {
            code: "PROVIDER_TIMEOUT",
            retryable: true,
            attempts: attempt,
          });
        }
        if (error instanceof ProviderError) {
          throw new ProviderError(error.message, {
            code: error.code,
            retryable: error.retryable,
            status: error.status,
            provider: error.provider,
            model: error.model,
            durationMs: error.durationMs,
            attempts: error.attempts ?? attempt,
          });
        }
        throw error;
      }
      await sleep(250 * 2 ** (attempt - 1), options.signal);
    }
  }

  throw lastError;
}

export async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError(`Provider 返回了无法解析的响应（HTTP ${response.status}）`, {
      code: "PROVIDER_INVALID_JSON",
      retryable: false,
      status: response.status,
    });
  }
}
