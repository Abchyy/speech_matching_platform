import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { defaultChunkRepository, InMemoryChunkRepository } from "../corpus";
import { HashEmbeddingClient } from "../embedding";
import { InMemoryVectorStore, LanceDbVectorStore } from "../vector";
import { resolveQuoteFromEvidenceRef, toFullChunkEvidenceRef } from "./evidence";
import { ensureChunkIndex, retrieveRelevantChunks } from "./retrieval";

describe("vector retrieval pipeline", () => {
  it("可以从 Canonical Chunk 生成 embedding、写入向量库并按查询召回", async () => {
    const chunks = defaultChunkRepository.listAll();
    assert.ok(chunks.length > 0);

    const embeddingClient = new HashEmbeddingClient();
    const vectorStore = new InMemoryVectorStore();
    const chunkRepository = new InMemoryChunkRepository(chunks);

    await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);
    const indexed = await vectorStore.listChunkIds();
    assert.equal(indexed.length, chunks.length);

    const [sampleVector] = await embeddingClient.embed([chunks[0]!.embeddingText], "document");
    assert.ok(sampleVector);
    assert.ok(sampleVector.length > 0);

    const retrieved = await retrieveRelevantChunks(
      "工业具身智能、人工智能与汽车制造场景",
      {
        topK: 5,
        embeddingClient,
        vectorStore,
        chunkRepository,
      },
    );

    assert.ok(retrieved.length > 0);
    const top = retrieved[0];
    assert.ok(top);
    const canonical = chunkRepository.getByChunkId(top.chunk.chunkId);
    assert.ok(canonical);
    assert.equal(top.chunk.text, canonical.text);

    const evidenceRef = toFullChunkEvidenceRef(top.chunk);
    assert.equal(evidenceRef.startIndex, 0);
    assert.equal(evidenceRef.endIndex, canonical.text.length);
    assert.equal(resolveQuoteFromEvidenceRef(evidenceRef, chunkRepository), canonical.text);
    assert.match(top.chunk.text, /【演示占位文本，非总书记讲话原文】/);
  });

  it("第二次 ensureChunkIndex 在 Chunk 未变化时跳过重建", async () => {
    const chunks = defaultChunkRepository.listAll();
    const embeddingClient = new HashEmbeddingClient();
    const vectorStore = new InMemoryVectorStore();
    const chunkRepository = new InMemoryChunkRepository(chunks);

    await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);
    await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);
    assert.equal((await vectorStore.listChunkIds()).length, chunks.length);
  });

  it("LanceDB 可以保存并查询向量，命中结果回溯到 Canonical Chunk", async () => {
    const chunks = defaultChunkRepository.listAll().slice(0, 2);
    const embeddingClient = new HashEmbeddingClient();
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "speech-lancedb-"));
    const vectorStore = new LanceDbVectorStore(tempDir);
    const chunkRepository = new InMemoryChunkRepository(chunks);

    try {
      await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);
      const retrieved = await retrieveRelevantChunks(chunks[0]!.text, {
        topK: 1,
        embeddingClient,
        vectorStore,
        chunkRepository,
      });
      assert.equal(retrieved[0]?.chunk.chunkId, chunks[0]?.chunkId);
      assert.equal(retrieved[0]?.chunk.text, chunks[0]?.text);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
