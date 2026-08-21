import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultChunkRepository } from "../corpus";
import { recommendSpeeches } from "./matching";
import { generateEnterpriseProfile } from "./profile";

describe("mock matching pipeline", () => {
  it("从企业画像返回带完整 Chunk EvidenceRef 的结构化推荐", () => {
    const profile = generateEnterpriseProfile({
      rawCompanyDescription:
        "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
      industry: "汽车制造",
      techDomains: ["工业具身智能", "人工智能"],
    });

    const recommendations = recommendSpeeches(profile);
    assert.ok(recommendations.length > 0);

    for (const item of recommendations) {
      const chunk = defaultChunkRepository.getByChunkId(item.chunkId);
      assert.ok(chunk);
      assert.equal(item.evidenceRef.speechId, item.speechId);
      assert.equal(item.evidenceRef.chunkId, item.chunkId);
      assert.equal(item.evidenceRef.startIndex, 0);
      assert.equal(item.evidenceRef.endIndex, chunk.text.length);
      assert.equal(item.quote, chunk.text);
      assert.equal(item.isDemoPlaceholder, true);
      assert.match(item.quote, /【演示占位文本，非总书记讲话原文】/);
    }
  });
});
