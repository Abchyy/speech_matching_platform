import { defaultChunkRepository, type ChunkRepository } from "../corpus";
import { HashEmbeddingClient, type EmbeddingClient } from "../embedding";
import { InMemoryChunkRepository } from "../corpus";
import type { IndexRegistry } from "../index";
import { IdentityReranker, type Reranker } from "../services/rerank";
import { ensureChunkIndex } from "../services/retrieval";
import {
  recommendSpeechesWithDiagnostics,
  type RecommendSpeechesOptions,
} from "../services/matching";
import { resolveQuoteFromEvidenceRef } from "../services/evidence";
import { InMemoryVectorStore } from "../vector";
import { EVAL_CASES, type EvalCase } from "./cases";
import { aggregateMetrics, scoreCase, type AggregateMetrics, type CaseMetrics } from "./metrics";

export type ExperimentConfig = {
  name: string;
  retrievalMode: "dense" | "hybrid";
  enableQueryHints: boolean;
  enableRerank: boolean;
  changedVariable: string;
};

export type ExperimentReport = {
  name: string;
  changedVariable: string;
  config: ExperimentConfig;
  goldKind: "provisional";
  humanReview: "PENDING HUMAN REVIEW";
  corpusVersion?: string;
  chunkFingerprint?: string;
  embeddingModel: string;
  cases: CaseMetrics[];
  aggregate: AggregateMetrics;
  decision?: "KEEP" | "REJECT";
  decisionReason?: string;
};

export async function runExperiment(options: {
  config: ExperimentConfig;
  chunkRepository?: ChunkRepository;
  embeddingClient?: EmbeddingClient;
  reranker?: Reranker | null;
  cases?: EvalCase[];
}): Promise<ExperimentReport> {
  const chunkRepository =
    options.chunkRepository ?? new InMemoryChunkRepository(defaultChunkRepository.listAll());
  const embeddingClient = options.embeddingClient ?? new HashEmbeddingClient();
  const vectorStore = new InMemoryVectorStore();
  await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);
  const cases = options.cases ?? EVAL_CASES;
  const scored: CaseMetrics[] = [];
  const recommendOptions: RecommendSpeechesOptions = {
    chunkRepository,
    embeddingClient,
    vectorStore,
    retrievalMode: options.config.retrievalMode,
    enableQueryHints: options.config.enableQueryHints,
    enableRerank: options.config.enableRerank,
    reranker: options.config.enableRerank ? options.reranker ?? new IdentityReranker() : null,
  };

  for (const evalCase of cases) {
    const started = Date.now();
    const callsBefore = embeddingClient instanceof HashEmbeddingClient ? embeddingClient.callCount : 0;
    const result = await recommendSpeechesWithDiagnostics(evalCase.profile, recommendOptions);
    let quoteOk = 0;
    for (const item of result.recommendations) {
      const quote = resolveQuoteFromEvidenceRef(item.evidenceRef, chunkRepository);
      if (quote === item.quote) quoteOk += 1;
    }
    const metrics = scoreCase(evalCase, result.recommendations, {
      latencyMs: Date.now() - started,
      providerCalls:
        embeddingClient instanceof HashEmbeddingClient
          ? embeddingClient.callCount - callsBefore
          : 0,
    });
    metrics.canonicalQuoteConsistency =
      result.recommendations.length === 0 ? 1 : quoteOk / result.recommendations.length;
    scored.push(metrics);
  }

  return {
    name: options.config.name,
    changedVariable: options.config.changedVariable,
    config: options.config,
    goldKind: "provisional",
    humanReview: "PENDING HUMAN REVIEW",
    corpusVersion: chunkRepository.getSnapshot?.()?.corpusVersion,
    chunkFingerprint: chunkRepository.getSnapshot?.()?.chunkFingerprint,
    embeddingModel: embeddingClient.model,
    cases: scored,
    aggregate: aggregateMetrics(scored),
  };
}

export function decideKeepReject(
  baseline: ExperimentReport,
  candidate: ExperimentReport,
): ExperimentReport {
  const machineRegressed =
    candidate.aggregate.evidenceResolvableRate + 1e-9 < baseline.aggregate.evidenceResolvableRate ||
    candidate.aggregate.canonicalQuoteConsistency + 1e-9 < baseline.aggregate.canonicalQuoteConsistency ||
    candidate.aggregate.zeroRecall > baseline.aggregate.zeroRecall + 1e-9;
  const declaredQualityRegressed =
    candidate.aggregate.mrr + 1e-9 < baseline.aggregate.mrr ||
    candidate.aggregate.ndcgAtK + 1e-9 < baseline.aggregate.ndcgAtK ||
    candidate.aggregate.obviousErrorAt5 > baseline.aggregate.obviousErrorAt5 + 1e-9;
  const keep = !machineRegressed && !declaredQualityRegressed;
  return {
    ...candidate,
    decision: keep ? "KEEP" : "REJECT",
    decisionReason: machineRegressed
      ? "machine-verifiable metrics regressed versus baseline"
      : declaredQualityRegressed
        ? "declared primary metrics (MRR/nDCG/obviousErrorAt5) regressed versus baseline; provisional keyword hit is not true Recall"
        : "machine-verifiable and declared primary metrics held; provisional keyword/theme metrics are PENDING HUMAN REVIEW",
  };
}

export type { IndexRegistry };
