import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateEnterpriseProfile } from "./profile";

describe("mock enterprise profile", () => {
  it("把明确提供的行业和技术领域标为 explicit", () => {
    const profile = generateEnterpriseProfile({
      rawCompanyDescription:
        "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
      companyName: "示例智造",
      industry: "智能制造",
      techDomains: ["工业具身智能", "机器人控制"],
      developmentNeeds: "希望准确对接产业升级相关表述",
    });

    assert.equal(profile.companyPositioning[0]?.value, "示例智造");
    assert.equal(profile.companyPositioning[0]?.origin, "explicit");
    assert.ok(
      profile.technologyAndInnovation.some(
        (item) => item.value === "工业具身智能" && item.origin === "explicit",
      ),
    );
    assert.equal(profile.industryAndMarket[0]?.value, "智能制造");
    assert.equal(profile.industryAndMarket[0]?.origin, "explicit");
    assert.equal(profile.valueCreation[0]?.origin, "explicit");
  });

  it("画像结构保持五维且可继续扩展", () => {
    const profile = generateEnterpriseProfile({
      rawCompanyDescription: "一家人工智能创业公司。",
    });

    assert.ok(Array.isArray(profile.companyPositioning));
    assert.ok(Array.isArray(profile.technologyAndInnovation));
    assert.ok(Array.isArray(profile.productsAndApplications));
    assert.ok(Array.isArray(profile.industryAndMarket));
    assert.ok(Array.isArray(profile.valueCreation));
  });
});
