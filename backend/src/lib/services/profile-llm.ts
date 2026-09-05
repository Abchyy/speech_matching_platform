import { z } from "zod";
import { PROFILE_PROMPT_VERSION } from "../domain/xi-speech/constants";
import { DeepSeekChatClient } from "../llm";
import { ProviderError, type LlmProvider } from "../providers";
import {
  enterpriseProfileSchema,
  profileItemSchema,
  type EnterpriseInput,
  type EnterpriseProfile,
  type ProfileItem,
} from "../schemas";
import { generateEnterpriseProfile } from "./profile";

export class ProfileGenerationError extends Error {
  readonly code: string;
  constructor(message: string, code = "PROFILE_FAILED") {
    super(message);
    this.name = "ProfileGenerationError";
    this.code = code;
  }
}

export type ProfileGeneratorKind = "deepseek" | "rules-fallback" | "test";

export type GeneratedProfileResult = {
  profile: EnterpriseProfile;
  generator: ProfileGeneratorKind;
  fallback: boolean;
  promptVersion?: string;
};

const UNSUPPORTED_CLAIM_RE =
  /量子芯片|核心专利|亿元|营收|融资|估值|独角兽|行业第一|国内第一|世界领先|头部客户|专精特新|高新技术企业资质|员工\d+人|已上市|[AB]轮/;

const MISSING_PLACEHOLDER = "用户未提供足够信息";

const llmProfileSchema = z
  .object({
    companyPositioning: z.array(profileItemSchema),
    technologyAndInnovation: z.array(profileItemSchema),
    productsAndApplications: z.array(profileItemSchema),
    industryAndMarket: z.array(profileItemSchema),
    valueCreation: z.array(profileItemSchema),
  })
  .passthrough();

export const PROFILE_SYSTEM_PROMPT = `你是企业画像结构化器。只根据用户提供的企业介绍提取或保守归纳五维画像。

硬约束：
1. 只使用用户明确提供的信息；不得虚构客户、融资、规模、资质、市场地位、技术指标或成果。
2. 用户原文中明确出现的事实标记 origin=explicit、confidence=high。
3. 仅在用户表述上进行保守归纳的内容标记 origin=inferred，并给出 medium 或 low 置信度。
4. 信息不足时使用低置信度或明确写“用户未提供足够信息”，不得补造。
5. 只输出 JSON，字段为 companyPositioning、technologyAndInnovation、productsAndApplications、industryAndMarket、valueCreation。
6. 每项包含 id、value、origin、confidence。`;

function compact(text: string): string {
  return text.replace(/\s+/g, "");
}

function sourceText(input: EnterpriseInput): string {
  return [
    input.rawCompanyDescription,
    input.companyName ?? "",
    input.industry ?? "",
    ...(input.techDomains ?? []),
    input.developmentNeeds ?? "",
  ]
    .filter((part) => part.trim().length > 0)
    .join("\n");
}

function introducesUnsupportedClaim(value: string, source: string): boolean {
  const matches = value.match(new RegExp(UNSUPPORTED_CLAIM_RE.source, "g")) ?? [];
  return matches.some((token) => !source.includes(token));
}

function isExplicitGrounded(value: string, input: EnterpriseInput, source: string): boolean {
  const compactValue = compact(value);
  if (!compactValue) {
    return false;
  }
  if (compact(source).includes(compactValue) || source.includes(value.trim())) {
    return true;
  }
  const structured = [
    input.companyName,
    input.industry,
    ...(input.techDomains ?? []),
    input.developmentNeeds,
  ].filter((field): field is string => Boolean(field));
  return structured.some((field) => compact(field) === compactValue || field.trim() === value.trim());
}

function isConservativeInference(value: string, source: string): boolean {
  if (value.trim() === MISSING_PLACEHOLDER) {
    return true;
  }
  if (introducesUnsupportedClaim(value, source)) {
    return false;
  }
  const compactValue = compact(value);
  const compactSource = compact(source);
  if (!compactValue || compactValue.length < 4) {
    return false;
  }
  return compactSource.includes(compactValue);
}

export function enforceFactBoundary(profile: EnterpriseProfile, input: EnterpriseInput): EnterpriseProfile {
  const source = sourceText(input);

  const clean = (items: ProfileItem[], prefix: string): ProfileItem[] => {
    const kept = items.filter((item) => {
      if (introducesUnsupportedClaim(item.value, source)) {
        return false;
      }
      if (item.origin === "explicit") {
        return isExplicitGrounded(item.value, input, source);
      }
      return isConservativeInference(item.value, source);
    });
    if (kept.length > 0) {
      return kept;
    }
    return [
      {
        id: `${prefix}_missing`,
        value: MISSING_PLACEHOLDER,
        origin: "inferred",
        confidence: "low",
      },
    ];
  };

  return {
    companyPositioning: clean(profile.companyPositioning, "pos"),
    technologyAndInnovation: clean(profile.technologyAndInnovation, "tech"),
    productsAndApplications: clean(profile.productsAndApplications, "prod"),
    industryAndMarket: clean(profile.industryAndMarket, "ind"),
    valueCreation: clean(profile.valueCreation, "val"),
  };
}

export async function generateEnterpriseProfileWithLlm(
  input: EnterpriseInput,
  options: { provider?: LlmProvider; timeoutMs?: number } = {},
): Promise<GeneratedProfileResult> {
  const provider = options.provider ?? new DeepSeekChatClient();
  let raw: unknown;
  try {
    raw = await provider.completeJson(
      PROFILE_SYSTEM_PROMPT,
      `请从以下企业输入生成五维画像 JSON。\n${JSON.stringify(input)}`,
      { timeoutMs: options.timeoutMs, promptVersion: PROFILE_PROMPT_VERSION },
    );
  } catch (error) {
    if (error instanceof ProviderError) {
      throw new ProfileGenerationError(error.message, error.code);
    }
    throw new ProfileGenerationError(
      error instanceof Error ? error.message : "画像生成失败",
      "PROFILE_FAILED",
    );
  }

  const parsed = llmProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ProfileGenerationError("画像模型输出未通过 Schema 校验", "PROVIDER_SCHEMA");
  }
  const checked = enterpriseProfileSchema.safeParse(enforceFactBoundary(parsed.data, input));
  if (!checked.success) {
    throw new ProfileGenerationError("画像最终结构未通过 Schema 校验", "PROVIDER_SCHEMA");
  }
  return {
    profile: checked.data,
    generator: provider.provider === "deepseek" ? "deepseek" : "test",
    fallback: false,
    promptVersion: PROFILE_PROMPT_VERSION,
  };
}

export function generateEnterpriseProfileFallback(input: EnterpriseInput): GeneratedProfileResult {
  return {
    profile: generateEnterpriseProfile(input),
    generator: "rules-fallback",
    fallback: true,
  };
}

export async function generateProfileUseCase(
  input: EnterpriseInput,
  options: {
    provider?: LlmProvider;
    allowRulesFallback?: boolean;
    hasLlmCredentials?: boolean;
  } = {},
): Promise<GeneratedProfileResult> {
  const hasCredentials = options.hasLlmCredentials ?? Boolean(process.env.DEEPSEEK_API_KEY || process.env.DASHSCOPE_API_KEY);
  if (options.provider) {
    return generateEnterpriseProfileWithLlm(input, { provider: options.provider });
  }
  if (!hasCredentials) {
    if (options.allowRulesFallback === false) {
      throw new ProfileGenerationError("LLM Provider 不可用", "PROVIDER_UNAVAILABLE");
    }
    return generateEnterpriseProfileFallback(input);
  }
  return generateEnterpriseProfileWithLlm(input);
}
