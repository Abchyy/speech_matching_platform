import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DeepSeekError, DeepSeekChatClient } from "../llm";
import { DashScopeEmbeddingClient, EmbeddingError } from "../embedding";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ProviderError structured fields", () => {
  it("429 保留 code/retryable/status/provider/model/attempts", async () => {
    globalThis.fetch = async () => jsonResponse(429, { error: { message: "rate limited" } });
    const client = new DeepSeekChatClient("test-key", "https://example.test/compatible-mode/v1");
    await assert.rejects(
      () => client.completeJson("system", "user", { timeoutMs: 2000 }),
      (error: unknown) =>
        error instanceof DeepSeekError &&
        error.code === "PROVIDER_RATE_LIMITED" &&
        error.retryable === true &&
        error.status === 429 &&
        error.provider === "deepseek" &&
        Boolean(error.model) &&
        (error.attempts ?? 0) >= 1,
    );
  });

  it("5xx 保留 code/retryable/status", async () => {
    globalThis.fetch = async () => jsonResponse(503, { error: { message: "unavailable" } });
    const client = new DeepSeekChatClient("test-key", "https://example.test/compatible-mode/v1");
    await assert.rejects(
      () => client.completeJson("system", "user", { timeoutMs: 2000 }),
      (error: unknown) =>
        error instanceof DeepSeekError &&
        error.code === "PROVIDER_UNAVAILABLE" &&
        error.retryable === true &&
        error.status === 503 &&
        error.provider === "deepseek",
    );
  });

  it("timeout 保留 PROVIDER_TIMEOUT 与 attempts", async () => {
    globalThis.fetch = async (_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          const abortError = new Error("The operation was aborted");
          abortError.name = "TimeoutError";
          reject(abortError);
        });
      });
    };
    const client = new DeepSeekChatClient("test-key", "https://example.test/compatible-mode/v1");
    await assert.rejects(
      () => client.completeJson("system", "user", { timeoutMs: 30 }),
      (error: unknown) =>
        error instanceof DeepSeekError &&
        error.code === "PROVIDER_TIMEOUT" &&
        error.retryable === true &&
        (error.attempts ?? 0) >= 1,
    );
  });

  it("Embedding 429 保留结构化字段，不被 EmbeddingError 抹掉", async () => {
    globalThis.fetch = async () => jsonResponse(429, { error: { message: "rate limited" } });
    const client = new DashScopeEmbeddingClient(
      "test-key",
      "https://example.test/compatible-mode/v1",
      8,
      10,
    );
    await assert.rejects(
      () => client.embed(["hello"], "query"),
      (error: unknown) =>
        error instanceof EmbeddingError &&
        error.code === "PROVIDER_RATE_LIMITED" &&
        error.retryable === true &&
        error.status === 429 &&
        error.provider === "dashscope",
    );
  });
});
