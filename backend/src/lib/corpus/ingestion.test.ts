import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CorpusIngestionError,
  createCanonicalDocument,
  hashCanonicalText,
  ingestCanonicalDocuments,
  ingestCanonicalMarkdown,
  ingestDemoCorpus,
  ingestProjectCorpus,
  preflightCanonicalCorpus,
  parseCanonicalMarkdown,
} from "./index";
import { chunkCanonicalDocument } from "./chunker";
import { DemoChunkRepository } from "./demo-chunk-repository";
import { InMemoryChunkRepository } from "./in-memory-chunk-repository";
import {
  resolveQuoteFromEvidenceRef,
  toFullChunkEvidenceRef,
} from "../services/evidence";

const SAMPLE_MARKDOWN = `---
id: demo_speech_sample
title: "[DEMO] 解析样例"
date: 2024-05-01
source: DEMO_PLACEHOLDER
url: https://example.local/demo
isDemoPlaceholder: true
retrieval_keywords:
  - 人工智能
---

# [DEMO] 解析样例

【演示占位文本，非总书记讲话原文】第一段用于验证 Canonical 解析。

第二段应被切成独立 Chunk。
`;

describe("Canonical corpus ingestion", () => {
  it("可以从 Markdown 正确解析 Canonical Document", () => {
    const { document, retrievalKeywords } = parseCanonicalMarkdown(SAMPLE_MARKDOWN);

    assert.equal(document.speechId, "demo_speech_sample");
    assert.equal(document.title, "[DEMO] 解析样例");
    assert.equal(document.date, "2024-05-01");
    assert.equal(document.source, "DEMO_PLACEHOLDER");
    assert.equal(document.url, "https://example.local/demo");
    assert.equal(document.isDemoPlaceholder, true);
    assert.equal(
      document.fullText,
      "【演示占位文本，非总书记讲话原文】第一段用于验证 Canonical 解析。\n\n第二段应被切成独立 Chunk。",
    );
    assert.equal(document.sha256, hashCanonicalText(document.fullText));
    assert.deepEqual(retrievalKeywords, ["人工智能"]);
    assert.throws(() => {
      (document as { fullText: string }).fullText = "被改写";
    }, TypeError);
  });

  it("缺少必要字段时拒绝解析", () => {
    assert.throws(
      () =>
        parseCanonicalMarkdown(`---
title: 缺 id
source: DEMO
---

正文
`),
      CorpusIngestionError,
    );
  });

  it("Chunk 由 Canonical Document 生成，且文本是原文子串", () => {
    const { documents, chunks } = ingestCanonicalMarkdown(SAMPLE_MARKDOWN);
    const document = documents[0];
    assert.ok(document);
    assert.equal(chunks.length, 2);

    for (const chunk of chunks) {
      assert.equal(chunk.speechId, document.speechId);
      assert.equal(document.fullText.includes(chunk.text), true);
      assert.equal(chunk.title, document.title);
      assert.equal(chunk.source, document.source);
      assert.equal(chunk.isDemoPlaceholder, true);
      assert.equal(chunk.embeddingText.includes(chunk.text), true);
    }

    assert.equal(
      chunks[0]?.text,
      "【演示占位文本，非总书记讲话原文】第一段用于验证 Canonical 解析。",
    );
    assert.equal(chunks[1]?.text, "第二段应被切成独立 Chunk。");
  });

  it("可以从 Canonical Document 对象直接生成 Chunk", () => {
    const document = createCanonicalDocument({
      speechId: "manual_doc",
      title: "[DEMO] 手工文档",
      date: null,
      source: "DEMO_PLACEHOLDER",
      fullText: "【演示占位文本，非总书记讲话原文】仅一段正文。",
      isDemoPlaceholder: true,
    });

    const chunks = chunkCanonicalDocument(document);
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0]?.chunkId, "manual_doc_chunk_000");
    assert.equal(chunks[0]?.text, document.fullText);
    assert.equal(document.fullText.includes(chunks[0]!.text), true);

    const ingested = ingestCanonicalDocuments([document]);
    assert.equal(ingested.chunks[0]?.text, document.fullText);
  });

  it("生成的 chunkId 全局唯一", () => {
    const { chunks } = ingestDemoCorpus();
    const ids = chunks.map((chunk) => chunk.chunkId);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes("demo_speech_sci_tech_chunk_000"));
    assert.ok(ids.includes("demo_speech_sci_tech_chunk_001"));
  });

  it("Repository 可以读取 ingestion 生成的 Chunk", () => {
    const { chunks } = ingestDemoCorpus();
    const repository = new InMemoryChunkRepository(chunks);
    const first = chunks[0];
    assert.ok(first);
    assert.equal(repository.getByChunkId(first.chunkId)?.text, first.text);
    assert.equal(repository.listAll().length, chunks.length);

    const demoRepository = new DemoChunkRepository();
    assert.equal(demoRepository.listAll().length, chunks.length);
    assert.ok(demoRepository.getByChunkId("demo_speech_enterprise_chunk_000"));
  });

  it("Evidence 可以引用生成的 Chunk，并遵守完整 Chunk 冻结规则", () => {
    const { chunks } = ingestDemoCorpus();
    const repository = new InMemoryChunkRepository(chunks);
    const chunk = repository.getByChunkId("demo_speech_industry_chunk_000");
    assert.ok(chunk);

    const ref = toFullChunkEvidenceRef(chunk);
    assert.equal(ref.speechId, chunk.speechId);
    assert.equal(ref.chunkId, chunk.chunkId);
    assert.equal(ref.startIndex, 0);
    assert.equal(ref.endIndex, chunk.text.length);
    assert.equal(resolveQuoteFromEvidenceRef(ref, repository), chunk.text);
  });

  it("cleaned Canonical 由当前 Chunker 生成运行时 Chunk，并跳过去重副本", () => {
    const report = preflightCanonicalCorpus();
    assert.ok(report.canonicalDirectory.replaceAll("\\", "/").endsWith("corpus/cleaned"));
    assert.equal(report.sha256Verified, report.documentCount);
    assert.equal(report.uniqueSpeechIds, true);
    assert.equal(report.uniqueChunkIds, true);
    assert.ok(report.chunkCount > 0);
    assert.equal(report.runtimeDocumentCount, report.documentCount - report.droppedCount);

    const { documents, chunks } = ingestProjectCorpus();
    assert.equal(documents.length, report.runtimeDocumentCount);
    assert.equal(chunks.length, report.chunkCount);
    const bySpeechId = new Map(documents.map((document) => [document.speechId, document]));
    const chunkIds = chunks.map((chunk) => chunk.chunkId);
    assert.equal(new Set(chunkIds).size, chunkIds.length);
    for (const chunk of chunks) {
      const document = bySpeechId.get(chunk.speechId);
      assert.ok(document);
      assert.equal(document.fullText.includes(chunk.text), true);
    }
  });
});
