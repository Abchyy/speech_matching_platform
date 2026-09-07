import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fingerprintChunks, fingerprintDocuments, type CorpusSnapshot } from "../corpus";
import { CHUNK_POLICY_VERSION, CORPUS_VERSION, XI_SPEECH_DOMAIN } from "../domain/xi-speech/constants";
import { HashEmbeddingClient } from "../embedding";
import type { SpeechChunk } from "../schemas";
import { InMemoryVectorStore, ReadOnlyVectorStore } from "../vector";
import { buildAndPublishIndex } from "./builder";
import { IndexError } from "./manifest";
import { FileIndexRegistry, MemoryIndexRegistry } from "./registry";

function chunk(id: string, text: string): SpeechChunk {
  return {
    chunkId: id,
    speechId: "speech_a",
    chunkIndex: 0,
    title: "[TEST]",
    date: "2024-01-01",
    source: "TEST",
    text,
    keywords: ["人工智能"],
    embeddingText: text,
    isDemoPlaceholder: true,
  };
}

function snapshotFor(chunks: SpeechChunk[]): CorpusSnapshot {
  return {
    domain: XI_SPEECH_DOMAIN,
    corpusVersion: CORPUS_VERSION,
    corpusFingerprint: fingerprintDocuments([]),
    chunkFingerprint: fingerprintChunks(chunks),
    chunkPolicyVersion: CHUNK_POLICY_VERSION,
    documentCount: 1,
    chunkCount: chunks.length,
  };
}

describe("versioned index registry", () => {
  it("成功发布后查询读取 active，构建失败不破坏已有 active", async () => {
    const chunks = [chunk("a_c000", "人工智能赋能制造业。")];
    const snapshot = snapshotFor(chunks);
    const embeddingClient = new HashEmbeddingClient();
    const registry = new MemoryIndexRegistry();
    const firstStore = new InMemoryVectorStore();

    const first = await buildAndPublishIndex({
      chunks,
      snapshot,
      embeddingClient,
      embeddingProvider: "test",
      dimensions: 64,
      registry,
      vectorStoreFactory: () => firstStore,
    });
    assert.equal(first.buildStatus, "published");
    const active = await registry.getActive();
    assert.ok(active);
    assert.equal(active.manifest.indexVersion, first.indexVersion);
    assert.equal(active.vectorStore instanceof ReadOnlyVectorStore, true);
    await assert.rejects(() => active.vectorStore.upsert([]), /INDEX_WRITE_FORBIDDEN/);

    const failingClient = {
      model: "hash-embedding-test",
      async embed(): Promise<number[][]> {
        throw new Error("boom");
      },
    };
    await assert.rejects(
      () =>
        buildAndPublishIndex({
          chunks,
          snapshot,
          embeddingClient: failingClient,
          embeddingProvider: "test",
          dimensions: 64,
          registry,
          vectorStoreFactory: () => new InMemoryVectorStore(),
        }),
      /boom/,
    );
    const stillActive = await registry.getActive();
    assert.equal(stillActive?.manifest.indexVersion, first.indexVersion);
  });

  it("发布新版本后保留旧版本，并可 rollback", async () => {
    const firstChunks = [chunk("a_c000", "第一版索引。")];
    const secondChunks = [chunk("a_c000", "第二版索引。")];
    const registry = new MemoryIndexRegistry();
    const embeddingClient = new HashEmbeddingClient();
    const first = await buildAndPublishIndex({
      chunks: firstChunks,
      snapshot: snapshotFor(firstChunks),
      embeddingClient,
      embeddingProvider: "test",
      dimensions: 64,
      registry,
      vectorStoreFactory: () => new InMemoryVectorStore(),
    });
    const second = await buildAndPublishIndex({
      chunks: secondChunks,
      snapshot: snapshotFor(secondChunks),
      embeddingClient,
      embeddingProvider: "test",
      dimensions: 64,
      registry,
      vectorStoreFactory: () => new InMemoryVectorStore(),
    });
    assert.notEqual(first.indexVersion, second.indexVersion);
    const previous = await registry.getPrevious();
    assert.equal(previous?.indexVersion, first.indexVersion);
    const rolled = await registry.rollback();
    assert.equal(rolled.indexVersion, first.indexVersion);
    const active = await registry.getActive();
    assert.equal(active?.manifest.indexVersion, first.indexVersion);
  });

  it("缺失或过期 index 拒绝查询，且不静默使用旧索引", async () => {
    const chunks = [chunk("a_c000", "人工智能。")];
    const snapshot = snapshotFor(chunks);
    const registry = new MemoryIndexRegistry();
    const embedding = { provider: "test", model: "hash-embedding-test", dimensions: 64 };

    await assert.rejects(
      () => registry.assertReadyForQuery(snapshot, embedding, ["a_c000"]),
      (error: unknown) => error instanceof IndexError && error.code === "INDEX_NOT_READY",
    );

    await buildAndPublishIndex({
      chunks,
      snapshot,
      embeddingClient: new HashEmbeddingClient(),
      embeddingProvider: "test",
      dimensions: 64,
      registry,
      vectorStoreFactory: () => new InMemoryVectorStore(),
    });

    const stale: CorpusSnapshot = { ...snapshot, chunkFingerprint: "stale" };
    await assert.rejects(
      () => registry.assertReadyForQuery(stale, embedding, ["a_c000"]),
      (error: unknown) => error instanceof IndexError && error.code === "INDEX_STALE",
    );
  });

  it("FileIndexRegistry 发布指针切换不覆盖失败构建的 active", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "index-reg-"));
    const chunks = [chunk("a_c000", "人工智能。")];
    const snapshot = snapshotFor(chunks);
    const registry = new FileIndexRegistry(tempDir);
    try {
      const published = await buildAndPublishIndex({
        chunks,
        snapshot,
        embeddingClient: new HashEmbeddingClient(),
        embeddingProvider: "test",
        dimensions: 64,
        registry,
        indexRoot: tempDir,
        vectorStoreFactory: () => new InMemoryVectorStore(),
      });
      const activeRaw = JSON.parse(await readFile(path.join(tempDir, "active.json"), "utf8")) as {
        indexVersion: string;
      };
      assert.equal(activeRaw.indexVersion, published.indexVersion);

      await assert.rejects(
        () =>
          buildAndPublishIndex({
            chunks,
            snapshot,
            embeddingClient: {
              model: "hash-embedding-test",
              async embed() {
                throw new Error("staging fail");
              },
            },
            embeddingProvider: "test",
            dimensions: 64,
            registry,
            indexRoot: tempDir,
            vectorStoreFactory: () => new InMemoryVectorStore(),
          }),
        /staging fail/,
      );
      const still = JSON.parse(await readFile(path.join(tempDir, "active.json"), "utf8")) as {
        indexVersion: string;
      };
      assert.equal(still.indexVersion, published.indexVersion);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("同一 snapshot 快速连续构建，第二次失败后 getActive 仍可读第一个 published index", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "index-same-sec-"));
    const chunks = [chunk("a_c000", "人工智能。")];
    const snapshot = snapshotFor(chunks);
    const registry = new FileIndexRegistry(tempDir);
    const embeddingClient = new HashEmbeddingClient();
    try {
      const first = await buildAndPublishIndex({
        chunks,
        snapshot,
        embeddingClient,
        embeddingProvider: "test",
        dimensions: 64,
        registry,
        indexRoot: tempDir,
        vectorStoreFactory: () => new InMemoryVectorStore(),
      });
      const firstActive = await registry.getActive();
      assert.equal(firstActive?.manifest.indexVersion, first.indexVersion);
      assert.equal(firstActive?.manifest.buildStatus, "published");

      await assert.rejects(
        () =>
          buildAndPublishIndex({
            chunks,
            snapshot,
            embeddingClient: {
              model: "hash-embedding-test",
              async embed() {
                throw new Error("same-second staging fail");
              },
            },
            embeddingProvider: "test",
            dimensions: 64,
            registry,
            indexRoot: tempDir,
            vectorStoreFactory: () => new InMemoryVectorStore(),
          }),
        /same-second staging fail/,
      );

      const stillActive = await registry.getActive();
      assert.ok(stillActive);
      assert.equal(stillActive.manifest.indexVersion, first.indexVersion);
      assert.equal(stillActive.manifest.buildStatus, "published");
      assert.notEqual(stillActive.directory, path.join(tempDir, "versions", first.indexVersion) + "-missing");
      const versions = await (await import("node:fs/promises")).readdir(path.join(tempDir, "versions"));
      assert.ok(versions.length >= 2);
      assert.equal(new Set(versions).size, versions.length);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("provider mismatch 和同数量错误 Chunk ID 集合被拒绝", async () => {
    const chunks = [chunk("a_c000", "人工智能。")];
    const snapshot = snapshotFor(chunks);
    const embeddingClient = new HashEmbeddingClient();
    const memory = new MemoryIndexRegistry();
    await buildAndPublishIndex({
      chunks,
      snapshot,
      embeddingClient,
      embeddingProvider: "test",
      dimensions: 64,
      registry: memory,
      vectorStoreFactory: () => new InMemoryVectorStore(),
    });
    const ready = {
      provider: "test",
      model: "hash-embedding-test",
      dimensions: 64,
    };
    await memory.assertReadyForQuery(snapshot, ready, ["a_c000"]);
    await assert.rejects(
      () =>
        memory.assertReadyForQuery(
          snapshot,
          { ...ready, provider: "dashscope" },
          ["a_c000"],
        ),
      (error: unknown) => error instanceof IndexError && error.code === "INDEX_STALE",
    );
    await assert.rejects(
      () => memory.assertReadyForQuery(snapshot, ready, ["b_c000"]),
      (error: unknown) =>
        error instanceof IndexError &&
        error.code === "INDEX_STALE" &&
        /Chunk ID 集合/.test(error.message),
    );

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "index-ids-"));
    const files = new FileIndexRegistry(tempDir);
    try {
      await buildAndPublishIndex({
        chunks,
        snapshot,
        embeddingClient,
        embeddingProvider: "test",
        dimensions: 64,
        registry: files,
        indexRoot: tempDir,
        vectorStoreFactory: () => new InMemoryVectorStore(),
      });
      await assert.rejects(
        () =>
          files.assertReadyForQuery(
            snapshot,
            { ...ready, provider: "dashscope" },
            ["a_c000"],
          ),
        (error: unknown) => error instanceof IndexError && error.code === "INDEX_STALE",
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    const lanceDir = await mkdtemp(path.join(os.tmpdir(), "index-lance-ids-"));
    const lanceRegistry = new FileIndexRegistry(lanceDir);
    try {
      await buildAndPublishIndex({
        chunks,
        snapshot,
        embeddingClient,
        embeddingProvider: "test",
        dimensions: 64,
        registry: lanceRegistry,
        indexRoot: lanceDir,
      });
      await lanceRegistry.assertReadyForQuery(snapshot, ready, ["a_c000"]);
      await assert.rejects(
        () => lanceRegistry.assertReadyForQuery(snapshot, ready, ["b_c000"]),
        (error: unknown) =>
          error instanceof IndexError &&
          error.code === "INDEX_STALE" &&
          /Chunk ID 集合/.test(error.message),
      );
    } finally {
      await rm(lanceDir, { recursive: true, force: true });
    }
  });
});
