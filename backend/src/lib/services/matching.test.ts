import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultChunkRepository, InMemoryChunkRepository } from "../corpus";
import { HashEmbeddingClient } from "../embedding";
import { InMemoryVectorStore } from "../vector";
import { recommendSpeeches } from "./matching";
import { buildRetrievalText, generateEnterpriseProfile } from "./profile";
import { ReverseReranker, containsCanonicalFragment } from "./rerank";
import { ensureChunkIndex, retrieveRelevantChunks } from "./retrieval";

describe("vector matching pipeline with rerank", () => {
  it("从企业画像返回带完整 Chunk EvidenceRef 的结构化推荐，且排序来自 Rerank", async () => {
    const chunks = defaultChunkRepository.listAll();
    const embeddingClient = new HashEmbeddingClient();
    const vectorStore = new InMemoryVectorStore();
    const chunkRepository = new InMemoryChunkRepository(chunks);
    await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);

    const profile = generateEnterpriseProfile({
      rawCompanyDescription:
        "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
      industry: "汽车制造",
      techDomains: ["工业具身智能", "人工智能"],
    });

    const retrieved = await retrieveRelevantChunks(buildRetrievalText(profile), {
      topK: 20,
      embeddingClient,
      vectorStore,
      chunkRepository,
    });
    const retrievalOrder = retrieved.map((entry) => entry.chunk.chunkId);

    const recommendations = await recommendSpeeches(profile, {
      chunkRepository,
      embeddingClient,
      vectorStore,
      reranker: new ReverseReranker(),
    });
    assert.ok(recommendations.length > 0);
    assert.equal(recommendations[0]?.chunkId, retrievalOrder.at(-1));
    assert.equal(recommendations[0]?.relevance, "strong");
    assert.match(recommendations[0]?.reason ?? "", /测试反转重排/);

    for (const item of recommendations) {
      const chunk = chunkRepository.getByChunkId(item.chunkId);
      assert.ok(chunk);
      assert.equal(item.evidenceRef.speechId, item.speechId);
      assert.equal(item.evidenceRef.chunkId, item.chunkId);
      assert.equal(item.evidenceRef.startIndex, 0);
      assert.equal(item.evidenceRef.endIndex, chunk.text.length);
      assert.equal(item.quote, chunk.text);
      assert.equal(item.isDemoPlaceholder, true);
      assert.match(item.quote, /【演示占位文本，非总书记讲话原文】/);
      assert.equal(containsCanonicalFragment(item.reason, chunk.text), false);
    }
  });

  it("即使 Rerank 试图提供原文，quote 仍从 Canonical Chunk 回填", async () => {
    const chunks = defaultChunkRepository.listAll();
    const target = chunks[0];
    assert.ok(target);
    const embeddingClient = new HashEmbeddingClient();
    const vectorStore = new InMemoryVectorStore();
    const chunkRepository = new InMemoryChunkRepository([target]);
    await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);

    const profile = generateEnterpriseProfile({
      rawCompanyDescription: "人工智能仓储企业。",
      techDomains: ["人工智能"],
    });

    const recommendations = await recommendSpeeches(profile, {
      chunkRepository,
      embeddingClient,
      vectorStore,
      reranker: {
        async rerank() {
          return {
            results: [
              {
                chunkId: target.chunkId,
                relevance: "strong",
                reason: `模型试图输出原文：${target.text}`,
                profileEvidenceIds: ["not_a_real_id"],
              },
            ],
          };
        },
      },
    });

    assert.equal(recommendations.length, 1);
    assert.equal(recommendations[0]?.quote, target.text);
    assert.equal(containsCanonicalFragment(recommendations[0]?.reason ?? "", target.text), false);
    assert.equal(recommendations[0]?.profileEvidenceIds.includes("not_a_real_id"), false);
  });

  it("Rerank 局部摘录也不会进入 reason，quote 仍来自 Canonical Chunk", async () => {
    const chunks = defaultChunkRepository.listAll();
    const target = chunks[0];
    assert.ok(target);
    const fragment = target.text.slice(8, 20);
    assert.ok(fragment.length >= 4);
    assert.equal(target.text.includes(fragment), true);

    const embeddingClient = new HashEmbeddingClient();
    const vectorStore = new InMemoryVectorStore();
    const chunkRepository = new InMemoryChunkRepository([target]);
    await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);

    const profile = generateEnterpriseProfile({
      rawCompanyDescription: "人工智能仓储企业。",
      techDomains: ["人工智能"],
    });

    const recommendations = await recommendSpeeches(profile, {
      chunkRepository,
      embeddingClient,
      vectorStore,
      reranker: {
        async rerank() {
          return {
            results: [
              {
                chunkId: target.chunkId,
                relevance: "strong",
                reason: `该讲话提到「${fragment}」，因此值得推荐。`,
                profileEvidenceIds: [],
              },
            ],
          };
        },
      },
    });

    assert.equal(recommendations.length, 1);
    assert.equal(recommendations[0]?.quote, target.text);
    assert.equal(recommendations[0]?.reason.includes(fragment), false);
    assert.equal(containsCanonicalFragment(recommendations[0]?.reason ?? "", target.text), false);
  });
});
