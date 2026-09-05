import fs from "node:fs";
import path from "node:path";
import type { EmbeddingClient } from "../embedding";
import type { SpeechChunk } from "../schemas";
import { InMemoryVectorStore, LanceDbVectorStore, type VectorStore } from "../vector";
import type { CorpusSnapshot } from "../corpus";
import { IndexError, type IndexManifest } from "./manifest";
import {
  FileIndexRegistry,
  MemoryIndexRegistry,
  type IndexRegistry,
  defaultIndexRoot,
} from "./registry";

export type BuildIndexInput = {
  chunks: SpeechChunk[];
  snapshot: CorpusSnapshot;
  embeddingClient: EmbeddingClient;
  embeddingProvider: string;
  dimensions: number;
  registry: IndexRegistry;
  indexRoot?: string;
  vectorStoreFactory?: (directory: string) => VectorStore;
  smokeQueryText?: string;
};

function sameIdSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = [...right].sort();
  return [...left].sort().every((id, index) => id === expected[index]);
}

export function allocateExclusiveIndexDirectory(
  root: string,
  snapshot: CorpusSnapshot,
): { indexVersion: string; directory: string } {
  const versionsRoot = path.join(root, "versions");
  fs.mkdirSync(versionsRoot, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\./g, "");
  const fingerprint = snapshot.chunkFingerprint.slice(0, 12);
  const nonce = process.hrtime.bigint().toString();
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const indexVersion =
      attempt === 0
        ? `idx_${stamp}_${fingerprint}_${nonce}`
        : `idx_${stamp}_${fingerprint}_${nonce}_${attempt}`;
    const directory = path.join(versionsRoot, indexVersion);
    try {
      fs.mkdirSync(directory);
      fs.mkdirSync(path.join(directory, "lancedb"));
      return { indexVersion, directory };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw error;
      }
    }
  }
  throw new IndexError("无法分配唯一 index 版本目录", "INDEX_VERSION_COLLISION");
}

export function createIndexVersion(snapshot: CorpusSnapshot, root?: string): string {
  return allocateExclusiveIndexDirectory(root ?? defaultIndexRoot(), snapshot).indexVersion;
}

export async function buildAndPublishIndex(input: BuildIndexInput): Promise<IndexManifest> {
  if (input.chunks.length === 0) {
    throw new IndexError("没有可索引的 Canonical Chunk", "INDEX_EMPTY");
  }

  const root = input.indexRoot ?? defaultIndexRoot();
  const { indexVersion, directory } = allocateExclusiveIndexDirectory(root, input.snapshot);

  const stagingManifest: IndexManifest = {
    domain: input.snapshot.domain,
    corpusVersion: input.snapshot.corpusVersion,
    corpusFingerprint: input.snapshot.corpusFingerprint,
    chunkFingerprint: input.snapshot.chunkFingerprint,
    chunkPolicyVersion: input.snapshot.chunkPolicyVersion,
    recordCount: input.chunks.length,
    embeddingProvider: input.embeddingProvider,
    embeddingModel: input.embeddingClient.model,
    dimensions: input.dimensions,
    indexVersion,
    buildStatus: "staging",
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    `${JSON.stringify(stagingManifest, null, 2)}\n`,
    "utf8",
  );

  const store =
    input.vectorStoreFactory?.(directory) ??
    new LanceDbVectorStore(path.join(directory, "lancedb"));
  if (input.registry instanceof MemoryIndexRegistry) {
    input.registry.attachWritable(directory, store);
  }

  try {
    const vectors = await input.embeddingClient.embed(
      input.chunks.map((chunk) => chunk.embeddingText),
      "document",
    );
    if (vectors.length !== input.chunks.length) {
      throw new IndexError("Embedding 数量与 Chunk 数量不一致", "INDEX_EMBED_MISMATCH");
    }
    const dimensions = vectors[0]?.length ?? 0;
    if (dimensions !== input.dimensions) {
      throw new IndexError(
        `Embedding 维度不一致: ${dimensions} != ${input.dimensions}`,
        "INDEX_DIMENSION_MISMATCH",
      );
    }
    await store.upsert(
      input.chunks.map((chunk, index) => ({
        chunkId: chunk.chunkId,
        speechId: chunk.speechId,
        vector: vectors[index] ?? [],
      })),
    );
    const indexed = await store.listChunkIds();
    if (!sameIdSet(indexed, input.chunks.map((chunk) => chunk.chunkId))) {
      throw new IndexError("索引记录 ID 与已发布 Chunk 不一致", "INDEX_ID_MISMATCH");
    }

    const smokeText = input.smokeQueryText ?? input.chunks[0]?.embeddingText ?? "人工智能";
    const [queryVector] = await input.embeddingClient.embed([smokeText], "query");
    if (!queryVector) {
      throw new IndexError("索引 smoke 查询未能生成 embedding", "INDEX_SMOKE_FAILED");
    }
    const hits = await store.search(queryVector, 1);
    if (hits.length === 0) {
      throw new IndexError("索引 smoke 查询没有命中", "INDEX_SMOKE_FAILED");
    }

    const published: IndexManifest = {
      ...stagingManifest,
      buildStatus: "published",
      publishedAt: new Date().toISOString(),
      lexicalRecordCount: input.chunks.length,
    };
    fs.writeFileSync(
      path.join(directory, "manifest.json"),
      `${JSON.stringify(published, null, 2)}\n`,
      "utf8",
    );
    return input.registry.publish(published, directory);
  } catch (error) {
    input.registry.markFailed(directory, stagingManifest);
    throw error;
  }
}

export async function buildMemoryIndex(input: {
  chunks: SpeechChunk[];
  snapshot: CorpusSnapshot;
  embeddingClient: EmbeddingClient;
  dimensions: number;
  registry?: MemoryIndexRegistry;
}): Promise<{ registry: MemoryIndexRegistry; manifest: IndexManifest; store: InMemoryVectorStore }> {
  const registry = input.registry ?? new MemoryIndexRegistry();
  const store = new InMemoryVectorStore();
  const manifest = await buildAndPublishIndex({
    chunks: input.chunks,
    snapshot: input.snapshot,
    embeddingClient: input.embeddingClient,
    embeddingProvider: "test",
    dimensions: input.dimensions,
    registry,
    indexRoot: path.join("/tmp", "speech-index-memory"),
    vectorStoreFactory: () => store,
  });
  return { registry, manifest, store };
}

export { FileIndexRegistry, MemoryIndexRegistry };
