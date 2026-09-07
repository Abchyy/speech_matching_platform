import type { SpeechRecommendation } from "../schemas";
import type { EvalCase } from "./cases";

export type CaseMetrics = {
  caseId: string;
  title: string;
  k: number;
  hitAtK: boolean;
  mrr: number;
  ndcgAtK: number;
  themeHitAt3: boolean;
  obviousErrorAt5: boolean;
  zeroRecall: boolean;
  sameSpeechRatio: number;
  evidenceResolvableRate: number;
  canonicalQuoteConsistency: number;
  latencyMs: number;
  providerCalls: number;
  goldKind: "provisional";
};

export type AggregateMetrics = {
  /** provisional keyword overlap，不是人工 gold 上的真实 Recall。 */
  provisionalKeywordHitAtK: number;
  mrr: number;
  ndcgAtK: number;
  themeHitAt3: number;
  obviousErrorAt5: number;
  zeroRecall: number;
  sameSpeechRatio: number;
  evidenceResolvableRate: number;
  canonicalQuoteConsistency: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  providerCalls: number;
};

function relevanceGain(item: SpeechRecommendation, themes: string[]): number {
  const haystack = `${item.title}\n${item.keywords.join(" ")}\n${item.quote}`;
  return themes.some((theme) => haystack.includes(theme)) ? 1 : 0;
}

function dcg(gains: number[]): number {
  return gains.reduce((sum, gain, index) => sum + gain / Math.log2(index + 2), 0);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

export function scoreCase(
  evalCase: EvalCase,
  recommendations: SpeechRecommendation[],
  options: { latencyMs: number; providerCalls: number; k?: number },
): CaseMetrics {
  const k = options.k ?? 5;
  const top = recommendations.slice(0, k);
  const gains = top.map((item) => relevanceGain(item, evalCase.expectedThemes));
  const hitAtK = gains.some((gain) => gain > 0);
  const firstHit = gains.findIndex((gain) => gain > 0);
  const ideal = [...gains].sort((left, right) => right - left);
  const ndcgAtK = dcg(ideal) === 0 ? 0 : dcg(gains) / dcg(ideal);
  const themeHitAt3 = recommendations
    .slice(0, 3)
    .some((item) => relevanceGain(item, evalCase.expectedThemes) > 0);
  const obviousErrorAt5 =
    recommendations.slice(0, 5).length > 0 &&
    recommendations.slice(0, 5).every((item) => relevanceGain(item, evalCase.expectedThemes) === 0);
  const speechIds = top.map((item) => item.speechId);
  const uniqueSpeeches = new Set(speechIds).size;
  const sameSpeechRatio = speechIds.length === 0 ? 0 : 1 - uniqueSpeeches / speechIds.length;
  const resolvable = top.filter((item) => item.quote.length > 0 && item.evidenceRef.chunkId === item.chunkId);
  const quoteOk = top.filter((item) => item.quote === item.quote.slice());

  return {
    caseId: evalCase.id,
    title: evalCase.title,
    k,
    hitAtK,
    mrr: firstHit >= 0 ? 1 / (firstHit + 1) : 0,
    ndcgAtK,
    themeHitAt3,
    obviousErrorAt5,
    zeroRecall: top.length === 0,
    sameSpeechRatio,
    evidenceResolvableRate: top.length === 0 ? 1 : resolvable.length / top.length,
    canonicalQuoteConsistency: top.length === 0 ? 1 : quoteOk.length / top.length,
    latencyMs: options.latencyMs,
    providerCalls: options.providerCalls,
    goldKind: "provisional",
  };
}

export function aggregateMetrics(cases: CaseMetrics[]): AggregateMetrics {
  const n = Math.max(1, cases.length);
  const latencies = cases.map((item) => item.latencyMs);
  return {
    provisionalKeywordHitAtK: cases.filter((item) => item.hitAtK).length / n,
    mrr: cases.reduce((sum, item) => sum + item.mrr, 0) / n,
    ndcgAtK: cases.reduce((sum, item) => sum + item.ndcgAtK, 0) / n,
    themeHitAt3: cases.filter((item) => item.themeHitAt3).length / n,
    obviousErrorAt5: cases.filter((item) => item.obviousErrorAt5).length / n,
    zeroRecall: cases.filter((item) => item.zeroRecall).length / n,
    sameSpeechRatio: cases.reduce((sum, item) => sum + item.sameSpeechRatio, 0) / n,
    evidenceResolvableRate: cases.reduce((sum, item) => sum + item.evidenceResolvableRate, 0) / n,
    canonicalQuoteConsistency: cases.reduce((sum, item) => sum + item.canonicalQuoteConsistency, 0) / n,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    providerCalls: cases.reduce((sum, item) => sum + item.providerCalls, 0),
  };
}
