import { z } from "zod";
import { DeepSeekChatClient } from "../llm";
import type { EnterpriseProfile, ProfileItem, Relevance, SpeechChunk } from "../schemas";
import { relevanceSchema } from "../schemas";
import { collectProfileItems } from "./profile";

export class RerankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RerankError";
  }
}

export const rerankItemSchema = z.object({
  chunkId: z.string().min(1),
  relevance: relevanceSchema,
  reason: z.string().min(1),
  profileEvidenceIds: z.array(z.string()).default([]),
});

export const rerankResultSchema = z.object({
  results: z.array(rerankItemSchema).min(1),
});

export type RerankItem = z.infer<typeof rerankItemSchema>;
export type RerankResult = z.infer<typeof rerankResultSchema>;

export type RerankCandidate = {
  chunk: SpeechChunk;
  retrievalScore: number;
};

export interface Reranker {
  rerank(input: {
    profile: EnterpriseProfile;
    candidates: RerankCandidate[];
  }): Promise<RerankResult>;
}

const SYSTEM_PROMPT = `你是讲话匹配系统的 Reranker。你只对企业画像与候选讲话 Chunk 做相关性判断、排序，并给出可解释理由。

硬约束：
1. 不得生成、改写、复述、润色或替代总书记讲话原文。
2. 不得输出 quote、原文摘录或任何可被当作引用的讲话文本。
3. 只能输出 JSON，字段仅限 results[].chunkId、relevance、reason、profileEvidenceIds。
4. chunkId 必须来自候选列表，且必须覆盖全部候选。
5. profileEvidenceIds 只能使用用户提供的画像条目 id。
6. reason 只解释“为何相关或不相关”，不得粘贴候选正文，也不得摘录其中任意连续原文片段。
7. 具体、真实关联优先于泛化政治表达；不得为了增强战略感而夸大企业与讲话的关系。

relevance 只能是 strong、medium、weak、irrelevant 之一。
results 必须按相关性从高到低排序，无关项放在最后。`;

export type RankedCandidate = {
  chunk: SpeechChunk;
  retrievalScore: number;
  relevance: Relevance;
  reason: string;
  profileEvidenceIds: string[];
};

/** 连续 4 字及以上的 Canonical 子串视为原文片段；更短的共用字不按摘录处理。 */
export const MIN_CANONICAL_FRAGMENT_CHARS = 4;

const FALLBACK_REASON =
  "该候选与企业画像存在关联。引用原文由程序按 EvidenceRef 回填，不由模型生成。";

function longestCanonicalFragment(haystack: string, canonical: string): string {
  let best = "";
  let previous = Array.from({ length: canonical.length + 1 }, () => 0);

  for (let i = 0; i < haystack.length; i += 1) {
    const current = Array.from({ length: canonical.length + 1 }, () => 0);
    for (let j = 0; j < canonical.length; j += 1) {
      if (haystack[i] !== canonical[j]) {
        continue;
      }
      const size = (previous[j] ?? 0) + 1;
      current[j + 1] = size;
      if (size > best.length) {
        best = haystack.slice(i - size + 1, i + 1);
      }
    }
    previous = current;
  }

  return best;
}

export function containsCanonicalFragment(
  reason: string,
  canonical: string,
  minLength = MIN_CANONICAL_FRAGMENT_CHARS,
): boolean {
  if (!reason || !canonical) {
    return false;
  }
  if (reason.includes(canonical)) {
    return true;
  }
  return longestCanonicalFragment(reason, canonical).length >= minLength;
}

function isBlankReason(text: string): boolean {
  return text.replace(/[\s，。；、：,.!！？?\-—（）()「」“”'"]/g, "").length === 0;
}

export function sanitizeReason(reason: string, chunk: SpeechChunk): string {
  let cleaned = reason.trim().replace(/\s+/g, " ");
  const canonical = chunk.text;

  while (containsCanonicalFragment(cleaned, canonical)) {
    const fragment = cleaned.includes(canonical)
      ? canonical
      : longestCanonicalFragment(cleaned, canonical);
    cleaned = cleaned.split(fragment).join(" ").replace(/\s+/g, " ").trim();
  }

  if (isBlankReason(cleaned)) {
    return FALLBACK_REASON;
  }
  return cleaned;
}

export function applyRerank(
  candidates: RerankCandidate[],
  rerankResult: RerankResult,
  allowedProfileIds: Set<string>,
): RankedCandidate[] {
  const byId = new Map(candidates.map((entry) => [entry.chunk.chunkId, entry]));
  const used = new Set<string>();
  const ranked: RankedCandidate[] = [];

  for (const item of rerankResult.results) {
    const candidate = byId.get(item.chunkId);
    if (!candidate || used.has(item.chunkId)) {
      continue;
    }
    used.add(item.chunkId);
    ranked.push({
      chunk: candidate.chunk,
      retrievalScore: candidate.retrievalScore,
      relevance: item.relevance,
      reason: sanitizeReason(item.reason, candidate.chunk),
      profileEvidenceIds: item.profileEvidenceIds.filter((id) => allowedProfileIds.has(id)),
    });
  }

  for (const candidate of candidates) {
    if (used.has(candidate.chunk.chunkId)) {
      continue;
    }
    ranked.push({
      chunk: candidate.chunk,
      retrievalScore: candidate.retrievalScore,
      relevance: "weak",
      reason: "Rerank 未返回该候选，已保留向量召回顺序。引用原文由程序按 EvidenceRef 回填。",
      profileEvidenceIds: [],
    });
  }

  return ranked;
}

function serializeProfile(profile: EnterpriseProfile): Array<{
  id: string;
  value: string;
  origin: ProfileItem["origin"];
}> {
  return collectProfileItems(profile).map((item) => ({
    id: item.id,
    value: item.value,
    origin: item.origin,
  }));
}

export class DeepSeekReranker implements Reranker {
  constructor(private readonly client = new DeepSeekChatClient()) {}

  async rerank(input: {
    profile: EnterpriseProfile;
    candidates: RerankCandidate[];
  }): Promise<RerankResult> {
    if (input.candidates.length === 0) {
      throw new RerankError("没有可供 Rerank 的候选 Chunk");
    }

    const payload = {
      profileItems: serializeProfile(input.profile),
      candidates: input.candidates.map((entry) => ({
        chunkId: entry.chunk.chunkId,
        title: entry.chunk.title,
        date: entry.chunk.date,
        keywords: entry.chunk.keywords,
        textForJudgementOnly: entry.chunk.text,
        retrievalScore: Number(entry.retrievalScore.toFixed(4)),
      })),
    };

    const userPrompt = `请对以下候选 Chunk 重排。候选正文仅供判断，禁止写入输出。\n${JSON.stringify(payload)}`;
    const parsed = rerankResultSchema.safeParse(await this.client.completeJson(SYSTEM_PROMPT, userPrompt));
    if (!parsed.success) {
      throw new RerankError("DeepSeek Rerank 输出未通过 Schema 校验");
    }
    return parsed.data;
  }
}

/** 测试用：保持召回顺序，生成可解释但不调用模型的理由。 */
export class IdentityReranker implements Reranker {
  async rerank(input: {
    profile: EnterpriseProfile;
    candidates: RerankCandidate[];
  }): Promise<RerankResult> {
    const allowed = new Set(collectProfileItems(input.profile).map((item) => item.id));
    return {
      results: input.candidates.map((entry, index) => ({
        chunkId: entry.chunk.chunkId,
        relevance: index === 0 ? "strong" : "medium",
        reason: `测试 Rerank：该候选与企业画像存在主题关联，排序位置 ${index + 1}。`,
        profileEvidenceIds: collectProfileItems(input.profile)
          .filter((item) => allowed.has(item.id) && entry.chunk.text.includes(item.value))
          .map((item) => item.id),
      })),
    };
  }
}

/** 测试用：反转召回顺序，证明最终排序来自 Rerank。 */
export class ReverseReranker implements Reranker {
  async rerank(input: {
    profile: EnterpriseProfile;
    candidates: RerankCandidate[];
  }): Promise<RerankResult> {
    return {
      results: [...input.candidates].reverse().map((entry, index) => ({
        chunkId: entry.chunk.chunkId,
        relevance: index === 0 ? "strong" : "medium",
        reason: `测试反转重排：${entry.chunk.chunkId}`,
        profileEvidenceIds: [],
      })),
    };
  }
}
