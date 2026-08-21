import path from "node:path";
import { findProjectRoot } from "../corpus";
import {
  VectorStoreError,
  type VectorRecord,
  type VectorSearchHit,
  type VectorStore,
} from "./vector-store";

const TABLE_NAME = "speech_chunks";

export function defaultLanceDbUri(): string {
  return path.join(findProjectRoot(), "data", "lancedb");
}

export class LanceDbVectorStore implements VectorStore {
  constructor(private readonly uri = defaultLanceDbUri()) {}

  async upsert(records: VectorRecord[]): Promise<void> {
    if (records.length === 0) {
      throw new VectorStoreError("不能写入空的向量记录");
    }
    const lancedb = await import("@lancedb/lancedb");
    const db = await lancedb.connect(this.uri);
    const rows = records.map((record) => ({
      chunkId: record.chunkId,
      speechId: record.speechId,
      vector: record.vector,
    }));
    await db.createTable(TABLE_NAME, rows, { mode: "overwrite" });
  }

  async search(vector: number[], topK: number): Promise<VectorSearchHit[]> {
    const table = await this.openTable();
    const rows = await table.vectorSearch(vector).limit(topK).distanceType("cosine").toArray();
    return rows.map((row) => {
      const chunkId = String(row.chunkId ?? "");
      const distance = typeof row._distance === "number" ? row._distance : 1;
      return {
        chunkId,
        score: 1 - distance,
      };
    });
  }

  async listChunkIds(): Promise<string[]> {
    const names = await this.tableNames();
    if (!names.includes(TABLE_NAME)) {
      return [];
    }
    const table = await this.openTable();
    const rows = await table.query().select(["chunkId"]).toArray();
    return rows.map((row) => String(row.chunkId ?? "")).filter(Boolean);
  }

  private async tableNames(): Promise<string[]> {
    const lancedb = await import("@lancedb/lancedb");
    const db = await lancedb.connect(this.uri);
    return db.tableNames();
  }

  private async openTable() {
    const lancedb = await import("@lancedb/lancedb");
    const db = await lancedb.connect(this.uri);
    const names = await db.tableNames();
    if (!names.includes(TABLE_NAME)) {
      throw new VectorStoreError(`LanceDB 中不存在表 ${TABLE_NAME}，请先为 Canonical Chunk 建库`);
    }
    return db.openTable(TABLE_NAME);
  }
}
