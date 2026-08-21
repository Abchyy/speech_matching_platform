import { appConfig } from "../config";
import { defaultChunkRepository, type ChunkRepository } from "../corpus";
import type {
  EnterpriseProfile,
  ProfileItem,
  Relevance,
  SpeechChunk,
  SpeechRecommendation,
} from "../schemas";
import { resolveQuoteFromChunk, toFullChunkEvidenceRef } from "./evidence";
import { buildRetrievalText, collectProfileItems } from "./profile";

type ScoredChunk = {
  chunk: SpeechChunk;
  score: number;
  matchedKeywords: string[];
  profileEvidenceIds: string[];
};

function relevanceFromScore(score: number): Relevance {
  if (score >= 3) return "strong";
  if (score >= 2) return "medium";
  if (score >= 1) return "weak";
  return "irrelevant";
}

function matchedProfileIds(items: ProfileItem[], keywords: string[]): string[] {
  return items
    .filter((entry) => keywords.some((keyword) => entry.value.includes(keyword)))
    .map((entry) => entry.id);
}

function scoreChunk(retrievalText: string, items: ProfileItem[], chunk: SpeechChunk): ScoredChunk {
  const matchedKeywords = chunk.keywords.filter((keyword) => retrievalText.includes(keyword));
  return {
    chunk,
    score: matchedKeywords.length,
    matchedKeywords,
    profileEvidenceIds: matchedProfileIds(items, matchedKeywords),
  };
}

function dedupeBySpeech(scored: ScoredChunk[]): ScoredChunk[] {
  const seen = new Map<string, number>();
  return scored.filter((entry) => {
    const count = seen.get(entry.chunk.speechId) ?? 0;
    if (count >= appConfig.maxChunksPerSpeech) {
      return false;
    }
    seen.set(entry.chunk.speechId, count + 1);
    return true;
  });
}

function buildReason(entry: ScoredChunk): string {
  if (entry.matchedKeywords.length === 0) {
    return "演示匹配：当前为 mock 检索，该占位语料未与企业画像形成关键词重叠。正式环境将由向量检索与 Rerank 生成推荐理由。";
  }

  return `演示匹配：占位语料关键词「${entry.matchedKeywords.join("、")}」与企业画像存在主题重叠。正式环境将由向量检索与 Rerank 生成推荐理由，且不得由模型生成原文。`;
}

export function recommendSpeeches(
  profile: EnterpriseProfile,
  repository: ChunkRepository = defaultChunkRepository,
): SpeechRecommendation[] {
  const retrievalText = buildRetrievalText(profile);
  const items = collectProfileItems(profile);

  const ranked = repository
    .listAll()
    .map((chunk) => scoreChunk(retrievalText, items, chunk))
    .sort((left, right) => right.score - left.score);

  const selected = dedupeBySpeech(ranked)
    .slice(0, appConfig.recommendationLimit)
    .filter((entry) => entry.score > 0);

  const fallback = selected.length > 0 ? selected : dedupeBySpeech(ranked).slice(0, 3);

  return fallback.map((entry) => {
    const evidenceRef = toFullChunkEvidenceRef(entry.chunk);
    const quote = resolveQuoteFromChunk(entry.chunk, evidenceRef);

    return {
      chunkId: entry.chunk.chunkId,
      speechId: entry.chunk.speechId,
      title: entry.chunk.title,
      date: entry.chunk.date,
      source: entry.chunk.source,
      url: entry.chunk.url,
      keywords: entry.chunk.keywords,
      quote,
      evidenceRef,
      relevance: relevanceFromScore(entry.score),
      reason: buildReason(entry),
      profileEvidenceIds: entry.profileEvidenceIds,
      isDemoPlaceholder: entry.chunk.isDemoPlaceholder,
    };
  });
}

export function toEvidenceList(recommendations: SpeechRecommendation[]) {
  return recommendations.map((item) => ({
    evidenceRef: item.evidenceRef,
    quote: item.quote,
    title: item.title,
    date: item.date,
    source: item.source,
    keywords: item.keywords,
    isDemoPlaceholder: item.isDemoPlaceholder ?? true,
  }));
}
