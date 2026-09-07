import fs from "node:fs";
import path from "node:path";
import { findProjectRoot, type CorpusSnapshot } from "../corpus";
import { LanceDbVectorStore } from "../vector/lancedb-store";
import {
  ReadOnlyVectorStore,
  type VectorStore,
} from "../vector/vector-store";
import { IndexError, indexManifestSchema, type IndexManifest } from "./manifest";

export type ActiveIndex = {
  manifest: IndexManifest;
  vectorStore: VectorStore;
  directory: string;
};

export type IndexPointer = {
  indexVersion: string;
  directory: string;
};

export type IndexEmbeddingSpec = {
  provider: string;
  model: string;
  dimensions: number;
};

export interface IndexRegistry {
  getActive(): Promise<ActiveIndex | null>;
  getPrevious(): Promise<IndexManifest | null>;
  assertReadyForQuery(
    expected: CorpusSnapshot,
    embedding: IndexEmbeddingSpec,
    expectedChunkIds: string[],
  ): Promise<ActiveIndex>;
  publish(manifest: IndexManifest, directory: string): Promise<IndexManifest>;
  rollback(): Promise<IndexManifest>;
  markFailed(directory: string, manifest: IndexManifest): void;
}

export function sameIdSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = [...right].sort();
  return [...left].sort().every((id, index) => id === expected[index]);
}

export function assertManifestMatchesCorpus(
  manifest: IndexManifest,
  expected: CorpusSnapshot,
  embedding: IndexEmbeddingSpec,
): void {
  if (manifest.domain !== expected.domain) {
    throw new IndexError("active index 的 domain 与当前语料不一致", "INDEX_STALE");
  }
  if (
    manifest.corpusVersion !== expected.corpusVersion ||
    manifest.corpusFingerprint !== expected.corpusFingerprint ||
    manifest.chunkFingerprint !== expected.chunkFingerprint ||
    manifest.chunkPolicyVersion !== expected.chunkPolicyVersion
  ) {
    throw new IndexError("active index 与当前 corpus/chunk fingerprint 不一致", "INDEX_STALE");
  }
  if (manifest.embeddingProvider !== embedding.provider) {
    throw new IndexError("active index 的 embeddingProvider 与当前配置不一致", "INDEX_STALE");
  }
  if (manifest.embeddingModel !== embedding.model) {
    throw new IndexError("active index 的 embeddingModel 与当前配置不一致", "INDEX_STALE");
  }
  if (manifest.dimensions !== embedding.dimensions) {
    throw new IndexError("active index 的 dimensions 与当前配置不一致", "INDEX_STALE");
  }
  if (manifest.recordCount !== expected.chunkCount) {
    throw new IndexError("active index 的 record count 与当前 Chunk 数不一致", "INDEX_STALE");
  }
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function defaultIndexRoot(startDir = process.cwd()): string {
  return path.join(findProjectRoot(startDir), "data", "indexes", "xi-speech");
}

export class FileIndexRegistry implements IndexRegistry {
  constructor(private readonly root = defaultIndexRoot()) {}

  private pointerPath(name: "active" | "previous"): string {
    return path.join(this.root, `${name}.json`);
  }

  private readPointer(name: "active" | "previous"): IndexPointer | null {
    return readJson<IndexPointer>(this.pointerPath(name));
  }

  private readManifest(directory: string): IndexManifest | null {
    const raw = readJson<unknown>(path.join(directory, "manifest.json"));
    if (!raw) return null;
    const parsed = indexManifestSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async getActive(): Promise<ActiveIndex | null> {
    const pointer = this.readPointer("active");
    if (!pointer) return null;
    const manifest = this.readManifest(pointer.directory);
    if (!manifest || manifest.buildStatus !== "published") {
      return null;
    }
    const vectorStore = new ReadOnlyVectorStore(
      new LanceDbVectorStore(path.join(pointer.directory, "lancedb")),
    );
    return { manifest, vectorStore, directory: pointer.directory };
  }

  async getPrevious(): Promise<IndexManifest | null> {
    const pointer = this.readPointer("previous");
    if (!pointer) return null;
    return this.readManifest(pointer.directory);
  }

  async assertReadyForQuery(
    expected: CorpusSnapshot,
    embedding: IndexEmbeddingSpec,
    expectedChunkIds: string[],
  ): Promise<ActiveIndex> {
    const active = await this.getActive();
    if (!active) {
      throw new IndexError("没有已发布的 active index，请先离线构建并发布", "INDEX_NOT_READY");
    }
    assertManifestMatchesCorpus(active.manifest, expected, embedding);
    const indexed = await active.vectorStore.listChunkIds();
    if (indexed.length !== active.manifest.recordCount) {
      throw new IndexError("active index 损坏：记录数与 manifest 不一致", "INDEX_CORRUPT");
    }
    if (!sameIdSet(indexed, expectedChunkIds)) {
      throw new IndexError("active index 的 Chunk ID 集合与当前 Canonical Chunk 不一致", "INDEX_STALE");
    }
    return active;
  }

  async publish(manifest: IndexManifest, directory: string): Promise<IndexManifest> {
    if (manifest.buildStatus !== "published") {
      throw new IndexError("只能发布 buildStatus=published 的索引", "INDEX_PUBLISH_INVALID");
    }
    const current = this.readPointer("active");
    if (current) {
      writeJsonAtomic(this.pointerPath("previous"), current);
    }
    writeJsonAtomic(path.join(directory, "manifest.json"), manifest);
    writeJsonAtomic(this.pointerPath("active"), {
      indexVersion: manifest.indexVersion,
      directory,
    });
    return manifest;
  }

  async rollback(): Promise<IndexManifest> {
    const previous = this.readPointer("previous");
    if (!previous) {
      throw new IndexError("没有可回滚的上一版本", "INDEX_ROLLBACK_UNAVAILABLE");
    }
    const manifest = this.readManifest(previous.directory);
    if (!manifest || manifest.buildStatus !== "published") {
      throw new IndexError("上一版本不可用", "INDEX_ROLLBACK_UNAVAILABLE");
    }
    const current = this.readPointer("active");
    writeJsonAtomic(this.pointerPath("active"), previous);
    if (current) {
      writeJsonAtomic(this.pointerPath("previous"), current);
    }
    return manifest;
  }

  markFailed(directory: string, manifest: IndexManifest): void {
    const active = this.readPointer("active");
    if (active && path.resolve(active.directory) === path.resolve(directory)) {
      return;
    }
    writeJsonAtomic(path.join(directory, "manifest.json"), {
      ...manifest,
      buildStatus: "failed",
    });
  }
}

export class MemoryIndexRegistry implements IndexRegistry {
  private active: ActiveIndex | null = null;
  private previous: { manifest: IndexManifest; directory: string; store: VectorStore } | null = null;
  private writable = new Map<string, VectorStore>();

  attachWritable(directory: string, store: VectorStore): void {
    this.writable.set(directory, store);
  }

  async getActive(): Promise<ActiveIndex | null> {
    return this.active;
  }

  async getPrevious(): Promise<IndexManifest | null> {
    return this.previous?.manifest ?? null;
  }

  async assertReadyForQuery(
    expected: CorpusSnapshot,
    embedding: IndexEmbeddingSpec,
    expectedChunkIds: string[],
  ): Promise<ActiveIndex> {
    const active = this.active;
    if (!active) {
      throw new IndexError("没有已发布的 active index，请先离线构建并发布", "INDEX_NOT_READY");
    }
    assertManifestMatchesCorpus(active.manifest, expected, embedding);
    const indexed = await active.vectorStore.listChunkIds();
    if (indexed.length !== active.manifest.recordCount) {
      throw new IndexError("active index 损坏：记录数与 manifest 不一致", "INDEX_CORRUPT");
    }
    if (!sameIdSet(indexed, expectedChunkIds)) {
      throw new IndexError("active index 的 Chunk ID 集合与当前 Canonical Chunk 不一致", "INDEX_STALE");
    }
    return active;
  }

  async publish(manifest: IndexManifest, directory: string): Promise<IndexManifest> {
    const store = this.writable.get(directory);
    if (!store) {
      throw new IndexError("staging index 不存在", "INDEX_STAGING_MISSING");
    }
    if (this.active) {
      this.previous = {
        manifest: this.active.manifest,
        directory: this.active.directory,
        store: this.active.vectorStore,
      };
    }
    this.active = {
      manifest,
      directory,
      vectorStore: new ReadOnlyVectorStore(store),
    };
    return manifest;
  }

  async rollback(): Promise<IndexManifest> {
    if (!this.previous) {
      throw new IndexError("没有可回滚的上一版本", "INDEX_ROLLBACK_UNAVAILABLE");
    }
    const current = this.active;
    this.active = {
      manifest: this.previous.manifest,
      directory: this.previous.directory,
      vectorStore: this.previous.store,
    };
    if (current) {
      this.previous = {
        manifest: current.manifest,
        directory: current.directory,
        store: current.vectorStore,
      };
    }
    return this.active.manifest;
  }

  markFailed(): void {
    // staging 失败不影响 active
  }
}
