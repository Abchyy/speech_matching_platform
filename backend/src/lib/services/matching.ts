import { appConfig } from "../config";
import { defaultChunkRepository, type ChunkRepository } from "../corpus";
import { DashScopeEmbeddingClient, type EmbeddingClient } from "../embedding";
import type {
  EnterpriseProfile,
  ProfileItem,
  SpeechChunk,
  SpeechRecommendation,
} from "../schemas";
import { LanceDbVectorStore, type VectorStore } from "../vector";
import { resolveQuoteFromChunk, toFullChunkEvidenceRef } from "./evidence";
import { buildRetrievalText, collectProfileItems } from "./profile";
import {
  applyRerank,
  DeepSeekReranker,
  type RerankCandidate,
  type Reranker,
} from "./rerank";
import { ensureChunkIndex, retrieveRelevantChunks } from "./retrieval";

type ScoredChunk = {
  chunk: SpeechChunk;
  score: number;
};

export type RecommendSpeechesOptions = {
  chunkRepository?: ChunkRepository;
  embeddingClient?: EmbeddingClient;
  vectorStore?: VectorStore;
  reranker?: Reranker;
};

let defaultEmbeddingClient: EmbeddingClient | undefined;
let defaultVectorStore: VectorStore | undefined;
let defaultReranker: Reranker | undefined;

function getDefaultEmbeddingClient(): EmbeddingClient {
  return (defaultEmbeddingClient ??= new DashScopeEmbeddingClient());
}

function getDefaultVectorStore(): VectorStore {
  return (defaultVectorStore ??= new LanceDbVectorStore());
}

function getDefaultReranker(): Reranker {
  return (defaultReranker ??= new DeepSeekReranker());
}

function matchedProfileIds(items: ProfileItem[], chunk: SpeechChunk): string[] {
  return items
    .filter((entry) => {
      if (chunk.text.includes(entry.value)) return true;
      return chunk.keywords.some(
        (keyword) => entry.value.includes(keyword) || keyword.includes(entry.value),
      );
    })
    .map((entry) => entry.id);
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

export async function recommendSpeeches(
  profile: EnterpriseProfile,
  options: RecommendSpeechesOptions = {},
): Promise<SpeechRecommendation[]> {
  const chunkRepository = options.chunkRepository ?? defaultChunkRepository;
  const embeddingClient = options.embeddingClient ?? getDefaultEmbeddingClient();
  const vectorStore = options.vectorStore ?? getDefaultVectorStore();
  const reranker = options.reranker ?? getDefaultReranker();

  await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);

  const retrievalText = buildRetrievalText(profile);
  const items = collectProfileItems(profile);
  const retrieved = await retrieveRelevantChunks(retrievalText, {
    topK: appConfig.retrievalTopK,
    embeddingClient,
    vectorStore,
    chunkRepository,
  });

  const deduped = dedupeBySpeech(
    retrieved.map((entry) => ({
      chunk: entry.chunk,
      score: entry.score,
    })),
  );

  const candidates: RerankCandidate[] = deduped.map((entry) => ({
    chunk: entry.chunk,
    retrievalScore: entry.score,
  }));

  const rerankResult = await reranker.rerank({ profile, candidates });
  const ranked = applyRerank(
    candidates,
    rerankResult,
    new Set(items.map((item) => item.id)),
  );

  const preferred = ranked.filter((entry) => entry.relevance !== "irrelevant");
  const selected = (preferred.length > 0 ? preferred : ranked).slice(
    0,
    appConfig.recommendationLimit,
  );

  return selected.map((entry) => {
    const evidenceRef = toFullChunkEvidenceRef(entry.chunk);
    const quote = resolveQuoteFromChunk(entry.chunk, evidenceRef);
    const profileEvidenceIds =
      entry.profileEvidenceIds.length > 0
        ? entry.profileEvidenceIds
        : matchedProfileIds(items, entry.chunk);

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
      relevance: entry.relevance,
      reason: entry.reason,
      profileEvidenceIds,
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
