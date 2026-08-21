import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SpeechChunk } from "../schemas";
import { generateEnterpriseProfile } from "./profile";
import {
  applyRerank,
  containsCanonicalFragment,
  IdentityReranker,
  ReverseReranker,
  sanitizeReason,
  type RerankCandidate,
} from "./rerank";

const chunkA: SpeechChunk = {
  chunkId: "chunk_a",
  speechId: "speech_a",
  chunkIndex: 0,
  title: "[DEMO] A",
  date: "2024-01-01",
  source: "DEMO",
  text: "【演示占位文本，非总书记讲话原文】人工智能与柔性制造。",
  keywords: ["人工智能"],
  embeddingText: "人工智能与柔性制造。",
  isDemoPlaceholder: true,
};

const chunkB: SpeechChunk = {
  chunkId: "chunk_b",
  speechId: "speech_b",
  chunkIndex: 0,
  title: "[DEMO] B",
  date: "2024-01-02",
  source: "DEMO",
  text: "【演示占位文本，非总书记讲话原文】乡村振兴主题占位。",
  keywords: ["乡村振兴"],
  embeddingText: "乡村振兴主题占位。",
  isDemoPlaceholder: true,
};

const candidates: RerankCandidate[] = [
  { chunk: chunkA, retrievalScore: 0.9 },
  { chunk: chunkB, retrievalScore: 0.4 },
];

describe("DeepSeek Rerank boundary", () => {
  it("按 Rerank 顺序重排，并丢弃未知 chunkId", async () => {
    const ranked = applyRerank(
      candidates,
      {
        results: [
          {
            chunkId: "unknown",
            relevance: "strong",
            reason: "不应出现",
            profileEvidenceIds: [],
          },
          {
            chunkId: "chunk_b",
            relevance: "medium",
            reason: "产业主题弱相关",
            profileEvidenceIds: ["missing_id", "tech_1"],
          },
          {
            chunkId: "chunk_a",
            relevance: "strong",
            reason: "技术主题强相关",
            profileEvidenceIds: ["tech_1"],
          },
        ],
      },
      new Set(["tech_1"]),
    );

    assert.deepEqual(
      ranked.map((entry) => entry.chunk.chunkId),
      ["chunk_b", "chunk_a"],
    );
    assert.deepEqual(ranked[0]?.profileEvidenceIds, ["tech_1"]);
    assert.equal(ranked[0]?.relevance, "medium");
  });

  it("sanitizeReason 会去掉完整 Canonical 正文", () => {
    const copied = sanitizeReason(`相关。${chunkA.text}因此可引用。`, chunkA);
    assert.equal(containsCanonicalFragment(copied, chunkA.text), false);
    assert.match(copied, /相关/);
  });

  it("sanitizeReason 会去掉 Canonical Chunk 的连续原文片段", () => {
    const fragment = "人工智能与柔性制造";
    assert.equal(chunkA.text.includes(fragment), true);
    assert.ok(fragment.length >= 4);

    const cleaned = sanitizeReason(
      `该候选提到${fragment}，因此与企业柔性生产能力相关。`,
      chunkA,
    );

    assert.equal(cleaned.includes(fragment), false);
    assert.equal(containsCanonicalFragment(cleaned, chunkA.text), false);
    assert.match(cleaned, /与企业柔性生产能力相关/);
  });

  it("sanitizeReason 在理由只剩原文片段时回退到安全说明", () => {
    const fragment = chunkA.text.slice(10, 18);
    assert.ok(fragment.length >= 4);
    assert.equal(chunkA.text.includes(fragment), true);

    const cleaned = sanitizeReason(fragment, chunkA);
    assert.equal(containsCanonicalFragment(cleaned, chunkA.text), false);
    assert.match(cleaned, /EvidenceRef 回填/);
  });

  it("applyRerank 输出的 reason 不含完整原文或连续片段", () => {
    const fragment = "乡村振兴主题占位";
    const ranked = applyRerank(
      candidates,
      {
        results: [
          {
            chunkId: "chunk_b",
            relevance: "medium",
            reason: `模型摘录了「${fragment}」作为理由。`,
            profileEvidenceIds: [],
          },
        ],
      },
      new Set(),
    );

    assert.equal(ranked[0]?.chunk.chunkId, "chunk_b");
    assert.equal(ranked[0]?.reason.includes(fragment), false);
    assert.equal(containsCanonicalFragment(ranked[0]?.reason ?? "", chunkB.text), false);
    assert.equal(ranked[0]?.reason.includes(chunkB.text), false);
  });

  it("Identity / Reverse Reranker 不调用外部模型", async () => {
    const profile = generateEnterpriseProfile({
      rawCompanyDescription: "一家人工智能公司。",
      techDomains: ["人工智能"],
    });
    const identity = await new IdentityReranker().rerank({ profile, candidates });
    const reversed = await new ReverseReranker().rerank({ profile, candidates });
    assert.equal(identity.results[0]?.chunkId, "chunk_a");
    assert.equal(reversed.results[0]?.chunkId, "chunk_b");
  });
});
