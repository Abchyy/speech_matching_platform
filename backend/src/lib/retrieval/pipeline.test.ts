import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { InMemoryChunkRepository } from "../corpus";
import { HashEmbeddingClient } from "../embedding";
import type { SpeechChunk } from "../schemas";
import { InMemoryVectorStore } from "../vector";
import { ExactPhraseRetriever } from "./exact-retriever";
import { LexicalRetriever } from "./lexical-retriever";
import { runRetrievalPipeline } from "./pipeline";
import { VectorRetriever } from "./vector-retriever";

function chunk(id: string, speechId: string, text: string, keywords: string[]): SpeechChunk {
  return {
    chunkId: id,
    speechId,
    chunkIndex: 0,
    title: text.slice(0, 12),
    date: "2024-01-01",
    source: "TEST",
    text,
    keywords,
    embeddingText: text,
    isDemoPlaceholder: true,
  };
}

describe("hybrid retrieval pipeline", () => {
  it("Dense/lexical/exact 走统一 Retriever，RRF 融合可解释分数", async () => {
    const chunks = [
      chunk("a_c000", "speech_a", "工业具身智能与汽车制造柔性生产。", ["人工智能"]),
      chunk("b_c000", "speech_b", "乡村振兴与农业现代化。", ["乡村振兴"]),
      chunk("c_c000", "speech_c", "绿色发展与新能源。", ["新能源"]),
    ];
    const repository = new InMemoryChunkRepository(chunks);
    const embedding = new HashEmbeddingClient();
    const store = new InMemoryVectorStore();
    const vectors = await embedding.embed(chunks.map((item) => item.embeddingText), "document");
    await store.upsert(
      chunks.map((item, index) => ({
        chunkId: item.chunkId,
        speechId: item.speechId,
        vector: vectors[index] ?? [],
      })),
    );

    const query = {
      text: "工业具身智能 汽车制造",
      lexicalTerms: ["工业", "具身", "智能", "汽车"],
      exactPhrases: ["工业具身智能"],
      topK: 3,
    };
    const result = await runRetrievalPipeline(query, {
      mode: "hybrid",
      retrievers: [
        new VectorRetriever(embedding, store, repository),
        new LexicalRetriever(repository),
        new ExactPhraseRetriever(repository),
      ],
    });
    assert.ok(result.candidates.length > 0);
    assert.ok(result.candidates[0]?.scores.fusion != null);
    assert.ok(result.channels.includes("dense"));
    assert.ok(result.channels.includes("lexical"));
    assert.ok(result.channels.includes("exact"));
    const exactHit = result.candidates.find((item) => item.chunk.chunkId === "a_c000");
    assert.ok(exactHit);
    assert.equal(exactHit.channels.includes("exact"), true);
  });
});
