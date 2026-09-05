export type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ProviderCallDiagnostics = {
  provider: string;
  model: string;
  promptVersion?: string;
  durationMs: number;
  attempts: number;
  usage?: TokenUsage;
};

export type LlmCompleteOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  promptVersion?: string;
};

export type LlmCompleteResult = {
  data: unknown;
  diagnostics: ProviderCallDiagnostics;
};

export interface LlmProvider {
  readonly provider: string;
  readonly model: string;
  completeJson(
    systemPrompt: string,
    userPrompt: string,
    options?: LlmCompleteOptions,
  ): Promise<unknown>;
}
