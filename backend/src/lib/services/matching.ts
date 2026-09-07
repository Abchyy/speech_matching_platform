import { appConfig, embeddingConfig, retrievalConfig } from "../config";
import { defaultChunkRepository, type ChunkRepository } from "../corpus";
import {
  defaultRelevanceForRank,
  matchedProfileIds,
  RERANK_DEGRADED_REASON,
} from "../domain/xi-speech/ranking-policy";
import {
  buildXiSpeechRetrievalIntent,
  intentToRetrievalQuery,
} from "../domain/xi-speech/query";
import { DashScopeEmbeddingClient, type EmbeddingClient } from "../embedding";
import { FileIndexRegistry, IndexError, type IndexRegistry } from "../index";
import {
  applySpeechDiversity,
  ExactPhraseRetriever,
  LexicalRetriever,
  runRetrievalPipeline,
  VectorRetriever,
} from "../retrieval";
import type { EnterpriseProfile, SpeechRecommendation } from "../schemas";
import { ReadOnlyVectorStore, type VectorStore } from "../vector";
import { resolveQuoteFromChunk, toFullChunkEvidenceRef } from "./evidence";
import { collectProfileItems } from "./profile";
import {
  applyRerank,
  DeepSeekReranker,
  type RerankCandidate,
  type Reranker,
} from "./rerank";
import { assertReadableIndex } from "./retrieval";

export type RecommendSpeechesOptions = {
  chunkRepository?: ChunkRepository;
  embeddingClient?: EmbeddingClient;
  vectorStore?: VectorStore;
  reranker?: Reranker | null;
  indexRegistry?: IndexRegistry;
  retrievalMode?: "dense" | "hybrid";
  enableQueryHints?: boolean;
  enableRerank?: boolean;
};

export type RecommendSpeechesResult = {
  recommendations: SpeechRecommendation[];
  diagnostics: {
    retrievalMode: "dense" | "hybrid";
    channels: string[];
    indexVersion?: string;
    rerankDegraded: boolean;
    profileSnapshotRef: string;
    queryPreview: string;
    intent: {
      confirmedFactCount: number;
      hintCount: number;
      hintVersion?: string;
    };
  };
};

let defaultEmbeddingClient: EmbeddingClient | undefined;
let defaultReranker: Reranker | undefined;
let defaultIndexRegistry: IndexRegistry | undefined;

function getDefaultEmbeddingClient(): EmbeddingClient {
  return (defaultEmbeddingClient ??= new DashScopeEmbeddingClient());
}

function getDefaultReranker(): Reranker {
  return (defaultReranker ??= new DeepSeekReranker());
}

function getDefaultIndexRegistry(): IndexRegistry {
  return (defaultIndexRegistry ??= new FileIndexRegistry());
}

async function resolveQueryVectorStore(
  options: RecommendSpeechesOptions,
  chunkRepository: ChunkRepository,
  embeddingClient: EmbeddingClient,
): Promise<{ vectorStore: VectorStore; indexVersion?: string }> {
  if (options.vectorStore) {
    await assertReadableIndex(chunkRepository, options.vectorStore);
    return { vectorStore: new ReadOnlyVectorStore(options.vectorStore) };
  }

  const snapshot = chunkRepository.getSnapshot?.();
  if (!snapshot) {
    throw new IndexError("当前 ChunkRepository 缺少 corpus snapshot，无法校验索引", "INDEX_NOT_READY");
  }
  const active = await (options.indexRegistry ?? getDefaultIndexRegistry()).assertReadyForQuery(
    snapshot,
    {
      provider: "dashscope",
      model: embeddingClient.model,
      dimensions: embeddingConfig.dimensions,
    },
    chunkRepository.listAll().map((chunk) => chunk.chunkId),
  );
  return { vectorStore: active.vectorStore, indexVersion: active.manifest.indexVersion };
}

export async function recommendSpeechesWithDiagnostics(
  profile: EnterpriseProfile,
  options: RecommendSpeechesOptions = {},
): Promise<RecommendSpeechesResult> {
  const chunkRepository = options.chunkRepository ?? defaultChunkRepository;
  const embeddingClient = options.embeddingClient ?? getDefaultEmbeddingClient();
  const { vectorStore, indexVersion } = await resolveQueryVectorStore(
    options,
    chunkRepository,
    embeddingClient,
  );

  const includeHints = options.enableQueryHints ?? retrievalConfig.enableQueryHints;
  const intent = buildXiSpeechRetrievalIntent(profile, { includeHints });
  const retrievalMode = options.retrievalMode ?? retrievalConfig.mode;
  const query = intentToRetrievalQuery(intent, appConfig.retrievalTopK);

  const retrievers = [
    new VectorRetriever(embeddingClient, vectorStore, chunkRepository),
    ...(retrievalMode === "hybrid" && retrievalConfig.enableLexical
      ? [new LexicalRetriever(chunkRepository)]
      : []),
    ...(retrievalMode === "hybrid" && retrievalConfig.enableExact
      ? [new ExactPhraseRetriever(chunkRepository)]
      : []),
  ];

  const pipeline = await runRetrievalPipeline(query, {
    mode: retrievalMode,
    retrievers,
  });
  const diversified = retrievalConfig.enableDiversity
    ? applySpeechDiversity(pipeline.candidates, appConfig.maxChunksPerSpeech)
    : pipeline.candidates;

  const items = collectProfileItems(profile);
  const rerankCandidates: RerankCandidate[] = diversified.map((entry) => ({
    chunk: entry.chunk,
    retrievalScore: entry.scores.fusion ?? entry.scores.dense ?? 0,
  }));

  const enableRerank = options.enableRerank ?? retrievalConfig.enableRerank;
  const reranker = options.reranker === null ? null : options.reranker ?? getDefaultReranker();
  let rerankDegraded = false;
  let ranked = diversified.map((entry, index) => ({
    chunk: entry.chunk,
    retrievalScore: entry.scores.fusion ?? entry.scores.dense ?? 0,
    relevance: defaultRelevanceForRank(index),
    reason: "该候选由检索融合排序得到。引用原文由程序按 EvidenceRef 回填。",
    profileEvidenceIds: [] as string[],
    scores: entry.scores,
  }));

  if (enableRerank && reranker && rerankCandidates.length > 0) {
    try {
      const rerankResult = await reranker.rerank({ profile, candidates: rerankCandidates });
      const applied = applyRerank(
        rerankCandidates,
        rerankResult,
        new Set(items.map((item) => item.id)),
      );
      const scoreById = new Map(diversified.map((entry) => [entry.chunk.chunkId, entry.scores]));
      ranked = applied.map((entry) => ({
        ...entry,
        scores: scoreById.get(entry.chunk.chunkId) ?? {},
      }));
    } catch {
      rerankDegraded = true;
      ranked = ranked.map((entry) => ({
        ...entry,
        reason: RERANK_DEGRADED_REASON,
      }));
    }
  }

  const preferred = ranked.filter((entry) => entry.relevance !== "irrelevant");
  const selected = (preferred.length > 0 ? preferred : ranked).slice(
    0,
    appConfig.recommendationLimit,
  );

  const recommendations = selected.map((entry) => {
    const evidenceRef = toFullChunkEvidenceRef(entry.chunk, {
      snapshot: chunkRepository.getSnapshot?.(),
    });
    const quote = resolveQuoteFromChunk(entry.chunk, evidenceRef, chunkRepository);
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
      retrievalScores: entry.scores,
      rerankDegraded: rerankDegraded || undefined,
    };
  });

  return {
    recommendations,
    diagnostics: {
      retrievalMode: pipeline.mode,
      channels: pipeline.channels,
      indexVersion,
      rerankDegraded,
      profileSnapshotRef: intent.profileSnapshotRef,
      queryPreview: intent.queryText.slice(0, 240),
      intent: {
        confirmedFactCount: intent.confirmedFacts.length,
        hintCount: intent.retrievalHints.length,
        hintVersion: intent.retrievalHints[0]?.version,
      },
    },
  };
}

export async function recommendSpeeches(
  profile: EnterpriseProfile,
  options: RecommendSpeechesOptions = {},
): Promise<SpeechRecommendation[]> {
  const result = await recommendSpeechesWithDiagnostics(profile, options);
  return result.recommendations;
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
