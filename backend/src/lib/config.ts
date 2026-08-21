import fs from "node:fs";
import path from "node:path";

function parseEnvLine(line: string): [string, string] | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return undefined;
  }
  const separator = trimmed.indexOf("=");
  if (separator <= 0) {
    return undefined;
  }
  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadLocalEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "backend/.env.local"),
    path.resolve(process.cwd(), "backend/.env"),
    path.resolve(process.cwd(), "../.env.local"),
    path.resolve(process.cwd(), "../.env"),
  ];
  for (const filePath of candidates) {
    loadEnvFile(filePath);
  }
}

loadLocalEnv();

function optionalNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const appConfig = {
  name: "speech-matching-platform",
  mockMode: true,
  /** 工程默认值，产品侧推荐数量尚未冻结。 */
  recommendationLimit: 5,
  /** 工程默认值，Vector Top-K 尚未冻结。 */
  retrievalTopK: 20,
  /** 工程默认值，同一讲话保留几个 Chunk 尚未冻结。 */
  maxChunksPerSpeech: 2,
} as const;

export const embeddingConfig = {
  apiKey: process.env.DASHSCOPE_API_KEY ?? "",
  baseUrl:
    process.env.DASHSCOPE_BASE_URL ??
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: process.env.EMBEDDING_MODEL ?? "qwen3.7-text-embedding",
  dimensions: optionalNumber(process.env.EMBEDDING_DIMENSIONS, 1024),
};

export function requireDashscopeApiKey(): string {
  if (!embeddingConfig.apiKey.trim()) {
    throw new Error("未配置 DASHSCOPE_API_KEY，请在 backend/.env.local 中设置。");
  }
  return embeddingConfig.apiKey;
}

export const deepseekConfig = {
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.DASHSCOPE_API_KEY || "",
  baseUrl:
    process.env.DEEPSEEK_BASE_URL ??
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
  model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash-0731",
};

export function requireDeepseekApiKey(): string {
  if (!deepseekConfig.apiKey.trim()) {
    throw new Error(
      "未配置 DEEPSEEK_API_KEY（或可复用的 DASHSCOPE_API_KEY），请在 backend/.env.local 中设置。",
    );
  }
  return deepseekConfig.apiKey;
}

export const workflowStages = [
  "PROFILE_DRAFT",
  "PROFILE_CONFIRMED",
  "RECOMMENDATIONS_READY",
  "SPEECHES_SELECTED",
  "ASSETS_DRAFT",
  "ASSETS_CONFIRMED",
  "SCENARIO_DEFINED",
  "MATERIAL_READY",
] as const;

export type WorkflowStage = (typeof workflowStages)[number];
