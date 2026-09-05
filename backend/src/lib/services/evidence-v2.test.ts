import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CORPUS_VERSION, XI_SPEECH_DOMAIN } from "../domain/xi-speech/constants";
import { defaultChunkRepository, hashCanonicalText, InMemoryChunkRepository } from "../corpus";
import type { SpeechChunk } from "../schemas";
import {
  EvidenceError,
  parseEvidenceRef,
  resolveQuoteFromChunk,
  resolveQuoteFromEvidenceRef,
  toFullChunkEvidenceRef,
} from "./evidence";

function stubChunk(overrides: Partial<SpeechChunk> = {}): SpeechChunk {
  const text = "【演示占位文本，非总书记讲话原文】完整 Chunk 正文。";
  return {
    chunkId: "stub_c000",
    speechId: "stub_speech",
    chunkIndex: 0,
    title: "[STUB]",
    date: "2024-01-01",
    source: "STUB",
    text,
    keywords: [],
    embeddingText: text,
    charStart: 0,
    charEnd: text.length,
    contentHash: hashCanonicalText(text),
    documentContentHash: hashCanonicalText(`doc:${text}`),
    isDemoPlaceholder: true,
    ...overrides,
  };
}

describe("EvidenceRef v1/v2 compatibility", () => {
  const chunk = stubChunk();
  const repository = new InMemoryChunkRepository([chunk]);

  it("完整 Chunk 回填，并忽略客户端传入的 quote", () => {
    const v1 = {
      speechId: chunk.speechId,
      chunkId: chunk.chunkId,
      startIndex: 0,
      endIndex: chunk.text.length,
      quote: "伪造引用，不得使用",
    };
    const parsed = parseEvidenceRef(v1);
    assert.equal("quote" in parsed, false);
    assert.equal(resolveQuoteFromEvidenceRef(parsed, repository), chunk.text);
  });

  it("兼容层可以解析当前 v1 EvidenceRef", () => {
    const quote = resolveQuoteFromChunk(chunk, {
      speechId: chunk.speechId,
      chunkId: chunk.chunkId,
      startIndex: 0,
      endIndex: chunk.text.length,
    });
    assert.equal(quote, chunk.text);
  });

  it("新生成 Evidence 使用 version=2 并绑定 hash", () => {
    const ref = toFullChunkEvidenceRef(chunk);
    assert.equal(ref.version, 2);
    assert.equal(ref.domain, XI_SPEECH_DOMAIN);
    assert.equal(ref.corpusVersion, CORPUS_VERSION);
    assert.equal(ref.documentId, chunk.speechId);
    assert.equal(ref.chunkContentHash, chunk.contentHash);
    assert.equal(resolveQuoteFromChunk(chunk, ref, repository), chunk.text);
  });

  it("错误版本失败关闭", () => {
    assert.throws(
      () =>
        parseEvidenceRef({
          speechId: chunk.speechId,
          chunkId: chunk.chunkId,
          startIndex: 0,
          endIndex: chunk.text.length,
          version: 3,
        }),
      /不支持的 Evidence 版本/,
    );
  });

  it("错误哈希失败关闭", () => {
    const ref = toFullChunkEvidenceRef(chunk);
    assert.throws(
      () =>
        resolveQuoteFromChunk(
          chunk,
          { ...ref, chunkContentHash: "0".repeat(64) },
          repository,
        ),
      EvidenceError,
    );
  });

  it("跨语料引用失败关闭", () => {
    const ref = toFullChunkEvidenceRef(chunk);
    assert.throws(
      () =>
        resolveQuoteFromChunk(
          chunk,
          { ...ref, domain: "marx-engels" },
          repository,
        ),
      /跨语料/,
    );
    assert.throws(
      () =>
        resolveQuoteFromChunk(
          chunk,
          { ...ref, corpusVersion: "other-corpus-v1" },
          repository,
        ),
      /跨语料/,
    );
  });

  it("只有 version=2、部分 hash、部分 corpus 字段均被拒绝", () => {
    const base = {
      speechId: chunk.speechId,
      chunkId: chunk.chunkId,
      startIndex: 0,
      endIndex: chunk.text.length,
      version: 2 as const,
    };
    const incomplete = [
      { ...base },
      { ...base, domain: XI_SPEECH_DOMAIN, corpusVersion: CORPUS_VERSION },
      {
        ...base,
        domain: XI_SPEECH_DOMAIN,
        corpusVersion: CORPUS_VERSION,
        documentId: chunk.speechId,
        chunkContentHash: chunk.contentHash,
      },
      {
        ...base,
        domain: XI_SPEECH_DOMAIN,
        documentId: chunk.speechId,
        documentContentHash: chunk.documentContentHash,
        chunkContentHash: chunk.contentHash,
      },
      {
        ...base,
        corpusVersion: CORPUS_VERSION,
        documentId: chunk.speechId,
        documentContentHash: chunk.documentContentHash,
        chunkContentHash: chunk.contentHash,
      },
    ];
    for (const ref of incomplete) {
      assert.throws(
        () => parseEvidenceRef(ref),
        (error: unknown) =>
          error instanceof EvidenceError &&
          (error.code === "EVIDENCE_V2_INCOMPLETE" || /缺少必要绑定字段/.test(error.message)),
      );
      assert.throws(() => resolveQuoteFromChunk(chunk, ref as never, repository), EvidenceError);
    }
  });

  it("运行时 Canonical Chunk 可用 v2 Evidence 完整回填", () => {
    const real = defaultChunkRepository.listAll()[0];
    assert.ok(real);
    const ref = toFullChunkEvidenceRef(real, {
      snapshot: defaultChunkRepository.getSnapshot?.(),
    });
    assert.equal(ref.version, 2);
    assert.equal(resolveQuoteFromEvidenceRef(ref), real.text);
    assert.equal(real.contentHash, hashCanonicalText(real.text));
  });
});
