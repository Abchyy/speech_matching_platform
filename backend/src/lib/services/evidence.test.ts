import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { demoSpeechChunks } from "../corpus/demo-corpus";
import {
  EvidenceError,
  resolveQuoteFromChunk,
  sliceCanonicalQuote,
  toFullChunkEvidenceRef,
} from "./evidence";

describe("EvidenceRef quote backfill", () => {
  const chunk = demoSpeechChunks[0];

  it("MVP 确认整个 Chunk 时偏移为 [0, text.length)", () => {
    const ref = toFullChunkEvidenceRef(chunk);
    assert.equal(ref.speechId, chunk.speechId);
    assert.equal(ref.chunkId, chunk.chunkId);
    assert.equal(ref.startIndex, 0);
    assert.equal(ref.endIndex, chunk.text.length);
  });

  it("程序按 EvidenceRef 切片得到的原文与 Chunk 完全一致", () => {
    const ref = toFullChunkEvidenceRef(chunk);
    const quote = resolveQuoteFromChunk(chunk, ref);
    assert.equal(quote, chunk.text);
    assert.equal(chunk.text.includes(quote), true);
    assert.equal(quote, chunk.text.slice(ref.startIndex, ref.endIndex));
  });

  it("支持按 Chunk 文本切片，而不是改写原文", () => {
    const quote = sliceCanonicalQuote(chunk.text, {
      speechId: chunk.speechId,
      chunkId: chunk.chunkId,
      startIndex: 0,
      endIndex: 8,
    });
    assert.equal(quote, chunk.text.slice(0, 8));
  });

  it("偏移越界时拒绝回填", () => {
    assert.throws(
      () =>
        sliceCanonicalQuote(chunk.text, {
          speechId: chunk.speechId,
          chunkId: chunk.chunkId,
          startIndex: 0,
          endIndex: chunk.text.length + 1,
        }),
      EvidenceError,
    );
  });

  it("speechId / chunkId 不一致时拒绝回填", () => {
    assert.throws(
      () =>
        resolveQuoteFromChunk(chunk, {
          speechId: "other",
          chunkId: chunk.chunkId,
          startIndex: 0,
          endIndex: chunk.text.length,
        }),
      EvidenceError,
    );
  });
});
