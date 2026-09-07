import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateEnterpriseProfile } from "../../services/profile";
import { HINT_RULE_VERSION } from "./constants";
import { buildXiSpeechRetrievalIntent } from "./query";

describe("Xi Speech retrieval intent", () => {
  it("confirmed facts 进入查询，hints 可追溯且不伪装成企业事实", () => {
    const profile = generateEnterpriseProfile({
      rawCompanyDescription:
        "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
      companyName: "示例智造",
      industry: "汽车制造",
      techDomains: ["工业具身智能", "人工智能"],
    });
    const intent = buildXiSpeechRetrievalIntent(profile, { includeHints: true });
    assert.ok(intent.confirmedFacts.some((fact) => fact.text === "工业具身智能"));
    assert.ok(intent.retrievalHints.some((hint) => hint.text === "科技创新"));
    for (const hint of intent.retrievalHints) {
      assert.equal(hint.source, "deterministic_rule");
      assert.equal(hint.version, HINT_RULE_VERSION);
      assert.ok(hint.fromFactIds.length > 0);
      assert.equal(intent.confirmedFacts.some((fact) => fact.text === hint.text), false);
    }
    assert.equal(intent.profileSnapshotRef.length, 16);
    assert.match(intent.queryText, /检索提示/);
  });
});
