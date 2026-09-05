import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultChunkRepository, InMemoryChunkRepository } from "../corpus";
import { EVAL_CASES } from "./cases";
import { decideKeepReject, runExperiment } from "./harness";

describe("retrieval evaluation harness", () => {
  it("在同一语料上跑通 Happy Path 与十类画像，并比较 dense/hybrid", async () => {
    const chunkRepository = new InMemoryChunkRepository(defaultChunkRepository.listAll());
    const cases = EVAL_CASES;
    assert.equal(cases.length, 11);

    const dense = await runExperiment({
      chunkRepository,
      cases,
      config: {
        name: "dense-baseline",
        retrievalMode: "dense",
        enableQueryHints: false,
        enableRerank: false,
        changedVariable: "channel=dense",
      },
    });
    const hybrid = await runExperiment({
      chunkRepository,
      cases,
      config: {
        name: "hybrid-fusion",
        retrievalMode: "hybrid",
        enableQueryHints: false,
        enableRerank: false,
        changedVariable: "channel=dense+lexical+exact+rrf",
      },
    });
    const decided = decideKeepReject(dense, hybrid);
    assert.equal(dense.aggregate.canonicalQuoteConsistency, 1);
    assert.equal(hybrid.aggregate.canonicalQuoteConsistency, 1);
    assert.equal(dense.aggregate.evidenceResolvableRate, 1);
    assert.equal(hybrid.aggregate.evidenceResolvableRate, 1);
    assert.equal(decided.humanReview, "PENDING HUMAN REVIEW");
    assert.ok(decided.decision === "KEEP" || decided.decision === "REJECT");
    assert.match(decided.decisionReason ?? "", /PENDING HUMAN REVIEW|regressed|provisional/);
    assert.equal("provisionalKeywordHitAtK" in dense.aggregate, true);
    assert.equal("recallAtK" in dense.aggregate, false);
  });

  it("KEEP/REJECT 在 MRR/nDCG/obviousErrorAt5 回退时拒绝", () => {
    const baseline = {
      name: "dense-baseline",
      changedVariable: "channel=dense",
      config: {
        name: "dense-baseline",
        retrievalMode: "dense" as const,
        enableQueryHints: false,
        enableRerank: false,
        changedVariable: "channel=dense",
      },
      goldKind: "provisional" as const,
      humanReview: "PENDING HUMAN REVIEW" as const,
      embeddingModel: "hash-embedding-test",
      cases: [],
      aggregate: {
        provisionalKeywordHitAtK: 1,
        mrr: 0.9,
        ndcgAtK: 0.9,
        themeHitAt3: 1,
        obviousErrorAt5: 0,
        zeroRecall: 0,
        sameSpeechRatio: 0.1,
        evidenceResolvableRate: 1,
        canonicalQuoteConsistency: 1,
        p50LatencyMs: 1,
        p95LatencyMs: 2,
        providerCalls: 11,
      },
    };
    const worseMrr = decideKeepReject(baseline, {
      ...baseline,
      name: "worse",
      aggregate: { ...baseline.aggregate, mrr: 0.5, themeHitAt3: 1 },
    });
    assert.equal(worseMrr.decision, "REJECT");
    assert.match(worseMrr.decisionReason ?? "", /MRR|nDCG|obviousErrorAt5/);
  });
});
