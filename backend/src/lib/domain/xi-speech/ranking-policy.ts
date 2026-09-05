import type { EnterpriseProfile, ProfileItem, Relevance, SpeechChunk } from "../../schemas";
import { collectProfileItems } from "./query";
import {
  containsCanonicalFragment,
  isBlankCanonicalSafeText,
  stripCanonicalFragments,
} from "../../services/canonical-text";

export const FALLBACK_REASON =
  "该候选与企业画像存在关联。引用原文由程序按 EvidenceRef 回填，不由模型生成。";

export const MISSING_CANDIDATE_REASON =
  "Rerank 未返回该候选，已保留融合召回顺序。引用原文由程序按 EvidenceRef 回填。";

export const RERANK_DEGRADED_REASON =
  "Rerank Provider 失败，已降级到融合召回顺序。引用原文由程序按 EvidenceRef 回填。";

export function sanitizeRecommendationReason(reason: string, chunk: SpeechChunk): string {
  const cleaned = stripCanonicalFragments(reason, chunk.text);
  if (isBlankCanonicalSafeText(cleaned) || containsCanonicalFragment(cleaned, chunk.text)) {
    return FALLBACK_REASON;
  }
  return cleaned;
}

export function filterProfileEvidenceIds(
  ids: string[],
  profile: EnterpriseProfile,
): string[] {
  const allowed = new Set(collectProfileItems(profile).map((item) => item.id));
  return ids.filter((id) => allowed.has(id));
}

export function matchedProfileIds(items: ProfileItem[], chunk: SpeechChunk): string[] {
  return items
    .filter((entry) => {
      if (chunk.text.includes(entry.value)) return true;
      return chunk.keywords.some(
        (keyword) => entry.value.includes(keyword) || keyword.includes(entry.value),
      );
    })
    .map((entry) => entry.id);
}

export function defaultRelevanceForRank(rank: number): Relevance {
  if (rank === 0) return "strong";
  if (rank < 3) return "medium";
  return "weak";
}
