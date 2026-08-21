import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ChunkRepository } from "./chunk-repository";
import { DemoChunkRepository } from "./demo-chunk-repository";
import { defaultChunkRepository } from "./index";
import type { SpeechChunk } from "../schemas";
import {
  EvidenceError,
  resolveQuoteFromEvidenceRef,
  toFullChunkEvidenceRef,
} from "../services/evidence";
import { recommendSpeeches } from "../services/matching";
import { generateEnterpriseProfile } from "../services/profile";

const stubChunk: SpeechChunk = {
  chunkId: "stub_chunk_001",
  speechId: "stub_speech_001",
  chunkIndex: 0,
  title: "[STUB] repository boundary",
  date: "2024-01-01",
  source: "STUB",
  text: "【演示占位文本，非总书记讲话原文】人工智能仓储替换测试。",
  keywords: ["人工智能"],
  embeddingText: "【演示占位文本，非总书记讲话原文】人工智能仓储替换测试。",
  isDemoPlaceholder: true,
};

const stubRepository: ChunkRepository = {
  getByChunkId(chunkId: string) {
    return chunkId === stubChunk.chunkId ? stubChunk : undefined;
  },
  listAll() {
    return [stubChunk];
  },
};

describe("ChunkRepository boundary", () => {
  it("默认实现是 DemoChunkRepository", () => {
    assert.equal(defaultChunkRepository instanceof DemoChunkRepository, true);
    const first = defaultChunkRepository.listAll()[0];
    assert.ok(first);
    assert.ok(defaultChunkRepository.getByChunkId(first.chunkId));
  });

  it("Evidence 回填通过 Repository 取 Chunk，而不是 demo helper", () => {
    const quote = resolveQuoteFromEvidenceRef(
      toFullChunkEvidenceRef(stubChunk),
      stubRepository,
    );
    assert.equal(quote, stubChunk.text);

    assert.throws(
      () =>
        resolveQuoteFromEvidenceRef(
          {
            speechId: "missing",
            chunkId: "missing_chunk",
            startIndex: 0,
            endIndex: 1,
          },
          stubRepository,
        ),
      EvidenceError,
    );
  });

  it("匹配 Service 可通过注入的 Repository 替换语料来源", () => {
    const profile = generateEnterpriseProfile({
      rawCompanyDescription: "一家做人工智能的科技公司。",
      techDomains: ["人工智能"],
    });

    const recommendations = recommendSpeeches(profile, stubRepository);
    assert.equal(recommendations.length, 1);
    assert.equal(recommendations[0]?.chunkId, stubChunk.chunkId);
    assert.equal(recommendations[0]?.evidenceRef.startIndex, 0);
    assert.equal(recommendations[0]?.evidenceRef.endIndex, stubChunk.text.length);
    assert.equal(recommendations[0]?.quote, stubChunk.text);
  });
});
