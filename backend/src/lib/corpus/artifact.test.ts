import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  EXPECTED_RUNTIME_CHUNK_COUNT,
  EXPECTED_RUNTIME_DOCUMENT_COUNT,
} from "../domain/xi-speech/constants";
import { CorpusIngestionError, createCanonicalDocument, hashCanonicalText } from "./canonical-document";
import { loadPublishedChunkArtifacts } from "./artifact";
import { ingestProjectCorpus } from "./ingestion";

function documentFixture(speechId: string, fullText: string) {
  return createCanonicalDocument({
    speechId,
    title: `[TEST] ${speechId}`,
    date: "2024-01-01",
    source: "TEST",
    fullText,
    isDemoPlaceholder: true,
  });
}

async function writeChunks(dir: string, speechId: string, chunks: unknown[]) {
  await writeFile(path.join(dir, `${speechId}.json`), `${JSON.stringify(chunks, null, 2)}\n`, "utf8");
}

describe("published chunk artifact validation", () => {
  it("运行时加载已发布 Artifact，文档 63、Chunk 447，且 ID/offset/hash 一致", () => {
    const loaded = ingestProjectCorpus();
    assert.equal(loaded.documents.length, EXPECTED_RUNTIME_DOCUMENT_COUNT);
    assert.equal(loaded.chunks.length, EXPECTED_RUNTIME_CHUNK_COUNT);
    assert.equal(loaded.snapshot?.documentCount, EXPECTED_RUNTIME_DOCUMENT_COUNT);
    assert.equal(loaded.snapshot?.chunkCount, EXPECTED_RUNTIME_CHUNK_COUNT);

    const byId = new Map(loaded.documents.map((document) => [document.speechId, document]));
    const chunkIds = loaded.chunks.map((chunk) => chunk.chunkId);
    assert.equal(new Set(chunkIds).size, chunkIds.length);
    assert.match(chunkIds[0] ?? "", /_c\d{3}$/);

    for (const chunk of loaded.chunks) {
      const document = byId.get(chunk.speechId);
      assert.ok(document);
      assert.equal(typeof chunk.charStart, "number");
      assert.equal(typeof chunk.charEnd, "number");
      assert.equal(document.fullText.slice(chunk.charStart ?? 0, chunk.charEnd ?? 0), chunk.text);
      assert.equal(chunk.contentHash, hashCanonicalText(chunk.text));
      assert.equal(chunk.documentContentHash, document.sha256);
    }
  });

  it("拒绝重复 ID、未知文档、越界 offset、错误正文、错误哈希和 dedup 泄漏", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "chunk-artifact-"));
    const fullText = "第一段正文。\n\n第二段正文。";
    const document = documentFixture("speech_keep", fullText);
    const dropped = documentFixture("speech_drop", fullText);
    const base = {
      chunkId: "speech_keep_c000",
      speechId: "speech_keep",
      chunkIndex: 0,
      title: document.title,
      date: document.date,
      source: document.source,
      text: "第一段正文。",
      charStart: 0,
      charEnd: "第一段正文。".length,
      charCount: "第一段正文。".length,
    };

    try {
      await writeChunks(tempDir, "dup", [base, { ...base }]);
      assert.throws(
        () =>
          loadPublishedChunkArtifacts({
            documents: [document],
            droppedIds: new Set(),
            keywordsBySpeechId: new Map(),
            chunkDirectory: tempDir,
            expectedDocumentCount: 1,
            expectedChunkCount: 1,
          }),
        /重复的 chunkId/,
      );

      await writeChunks(tempDir, "dup", [{ ...base, speechId: "missing", chunkId: "missing_c000" }]);
      assert.throws(
        () =>
          loadPublishedChunkArtifacts({
            documents: [document],
            droppedIds: new Set(),
            keywordsBySpeechId: new Map(),
            chunkDirectory: tempDir,
            expectedDocumentCount: 1,
            expectedChunkCount: 1,
          }),
        CorpusIngestionError,
      );

      await writeChunks(tempDir, "dup", [{ ...base, charEnd: 9999 }]);
      assert.throws(
        () =>
          loadPublishedChunkArtifacts({
            documents: [document],
            droppedIds: new Set(),
            keywordsBySpeechId: new Map(),
            chunkDirectory: tempDir,
            expectedDocumentCount: 1,
            expectedChunkCount: 1,
          }),
        /越界 offset/,
      );

      await writeChunks(tempDir, "dup", [{ ...base, text: "被改写的正文。" }]);
      assert.throws(
        () =>
          loadPublishedChunkArtifacts({
            documents: [document],
            droppedIds: new Set(),
            keywordsBySpeechId: new Map(),
            chunkDirectory: tempDir,
            expectedDocumentCount: 1,
            expectedChunkCount: 1,
          }),
        /Canonical slice 不一致/,
      );

      await writeChunks(tempDir, "dup", [
        {
          ...base,
          chunkId: "speech_drop_c000",
          speechId: "speech_drop",
        },
      ]);
      assert.throws(
        () =>
          loadPublishedChunkArtifacts({
            documents: [document, dropped],
            droppedIds: new Set(["speech_drop"]),
            keywordsBySpeechId: new Map(),
            chunkDirectory: tempDir,
            expectedDocumentCount: 1,
            expectedChunkCount: 1,
          }),
        /dedup 泄漏/,
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
