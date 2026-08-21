import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultChunkRepository } from "../corpus";
import {
  EvidenceError,
  resolveQuoteFromChunk,
  toFullChunkEvidenceRef,
} from "./evidence";

describe("Chunk-level EvidenceRef", () => {
  const chunk = defaultChunkRepository.listAll()[0];
  assert.ok(chunk);

  it("完整 Chunk Evidence 通过", () => {
    const ref = toFullChunkEvidenceRef(chunk);
    assert.equal(ref.startIndex, 0);
    assert.equal(ref.endIndex, chunk.text.length);

    const quote = resolveQuoteFromChunk(chunk, ref);
    assert.equal(quote, chunk.text);
    assert.equal(quote, chunk.text.slice(0, chunk.text.length));
  });

  it("拒绝 startIndex > 0", () => {
    assert.throws(
      () =>
        resolveQuoteFromChunk(chunk, {
          speechId: chunk.speechId,
          chunkId: chunk.chunkId,
          startIndex: 1,
          endIndex: chunk.text.length,
        }),
      EvidenceError,
    );
  });

  it("拒绝 endIndex < chunk.text.length", () => {
    assert.throws(
      () =>
        resolveQuoteFromChunk(chunk, {
          speechId: chunk.speechId,
          chunkId: chunk.chunkId,
          startIndex: 0,
          endIndex: chunk.text.length - 1,
        }),
      EvidenceError,
    );
  });

  it("拒绝任意局部切片请求", () => {
    assert.throws(
      () =>
        resolveQuoteFromChunk(chunk, {
          speechId: chunk.speechId,
          chunkId: chunk.chunkId,
          startIndex: 2,
          endIndex: 10,
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
