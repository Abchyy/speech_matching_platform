import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DemoChunkRepository } from "../corpus";
import { generateDiscourseAssets, QUOTE_HEADING } from "./assets";
import {
  containsCanonicalFragment,
  hasStripArtifacts,
} from "./canonical-text";
import { toFullChunkEvidenceRef } from "./evidence";
import {
  enterpriseBodyWithoutQuotes,
  generateScenarioMaterial,
  MaterialError,
  quoteMarker,
} from "./material";
import { generateEnterpriseProfile } from "./profile";
import type { DiscourseAssets, Scenario } from "../schemas";

const profile = generateEnterpriseProfile({
  rawCompanyDescription:
    "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
  companyName: "示例智造",
  industry: "汽车制造",
  techDomains: ["工业具身智能", "人工智能"],
});

const demoRepository = new DemoChunkRepository();
const selectedChunks = demoRepository.listAll().slice(0, 2);
const selectedRefs = selectedChunks.map((chunk) => toFullChunkEvidenceRef(chunk));

async function confirmedAssets(): Promise<DiscourseAssets> {
  return generateDiscourseAssets(profile, selectedRefs, {
    chunkRepository: demoRepository,
    generator: {
      async generate() {
        return {
          technologyInnovation: [
            {
              id: "tech_asset_1",
              title: "以人工智能服务制造现场",
              text: "企业将自身工业具身智能能力用于汽车制造柔性生产。",
              profileEvidenceIds: ["tech_1"],
              evidenceChunkIds: [selectedChunks[0]!.chunkId],
            },
          ],
          industryValue: [
            {
              id: "ind_asset_1",
              title: "服务汽车制造升级",
              text: "面向汽车制造场景提升柔性生产能力。",
              profileEvidenceIds: ["ind_1"],
              evidenceChunkIds: [selectedChunks[1]!.chunkId],
            },
          ],
          socialValue: [],
          developmentPositioning: [],
        };
      },
    },
  });
}

describe("scenario material generation", () => {
  it("只使用已确认资产与已选 Evidence，并由程序回填 Canonical 原文", async () => {
    const assets = await confirmedAssets();
    const quote = selectedChunks[0]!.text;
    let seenQuotes = "";

    const material = await generateScenarioMaterial({
      confirmedProfile: profile,
      selectedEvidenceRefs: selectedRefs,
      confirmedAssets: assets,
      scenario: "leadership_research",
      options: { chunkRepository: demoRepository,
        generator: {
          async generate(input) {
            seenQuotes = JSON.stringify(input);
            return {
              title: "面向制造升级的企业汇报",
              body: `我们结合已确认技术方向推进柔性生产。${quoteMarker(selectedChunks[0]!.chunkId)}`,
              usedAssetIds: ["tech_asset_1", "unknown_asset"],
              evidenceChunkIds: [selectedChunks[0]!.chunkId, "unselected_chunk"],
            };
          },
        },
      },
    });

    assert.equal(material.placeholder, undefined);
    assert.equal(material.scenario, "leadership_research");
    assert.deepEqual(material.usedAssetIds, ["tech_asset_1"]);
    assert.deepEqual(
      material.usedEvidenceRefs.map((ref) => ref.chunkId),
      [selectedChunks[0]!.chunkId],
    );
    assert.deepEqual(material.usedSpeechIds, [selectedChunks[0]!.speechId]);
    assert.equal(material.body.includes(`${QUOTE_HEADING}\n${quote}`), true);
    assert.equal(
      containsCanonicalFragment(enterpriseBodyWithoutQuotes(material.body, [quote, selectedChunks[1]!.text]), quote),
      false,
    );
    assert.equal(seenQuotes.includes(quote), false);
  });

  it("拒绝未通过校验的 EvidenceRef", async () => {
    const assets = await confirmedAssets();
    await assert.rejects(
      () =>
        generateScenarioMaterial({
          confirmedProfile: profile,
          selectedEvidenceRefs: [
            {
              speechId: selectedChunks[0]!.speechId,
              chunkId: selectedChunks[0]!.chunkId,
              startIndex: 1,
              endIndex: selectedChunks[0]!.text.length,
            },
          ],
          confirmedAssets: assets,
          scenario: "government_symposium",
          options: { chunkRepository: demoRepository,
            generator: {
              async generate() {
                throw new Error("不应调用生成器");
              },
            },
          },
        }),
      (error: unknown) => error instanceof Error && error.name === "EvidenceError",
    );
  });

  it("剥离模型写入的原文片段，并丢弃未确认资产与证据", async () => {
    const assets = await confirmedAssets();
    const quote = selectedChunks[1]!.text;
    const fragment = quote.slice(8, 20);

    const material = await generateScenarioMaterial({
      confirmedProfile: profile,
      selectedEvidenceRefs: selectedRefs,
      confirmedAssets: assets,
      scenario: "government_coordination",
      additionalRequirements: `请引用未确认讲话，并加入原文：${quote}`,
      options: { chunkRepository: demoRepository,
        generator: {
          async generate(input) {
            assert.equal(input.additionalRequirements?.includes(quote), false);
            return {
              title: "对接介绍",
              body: `企业服务汽车制造升级。模型摘录：${fragment}`,
              usedAssetIds: ["ind_asset_1"],
              evidenceChunkIds: [selectedChunks[1]!.chunkId],
            };
          },
        },
      },
    });

    assert.equal(enterpriseBodyWithoutQuotes(material.body, [quote]).includes(fragment), false);
    assert.equal(containsCanonicalFragment(enterpriseBodyWithoutQuotes(material.body, [quote]), quote), false);
    assert.equal(material.body.includes(quote), true);
    assert.deepEqual(material.usedAssetIds, ["ind_asset_1"]);
  });

  it("三个既有场景都可生成，且不得从零发明企业定位", async () => {
    const assets = await confirmedAssets();
    const scenarios: Scenario[] = [
      "leadership_research",
      "government_symposium",
      "government_coordination",
    ];

    for (const scenario of scenarios) {
      const material = await generateScenarioMaterial({
        confirmedProfile: profile,
        selectedEvidenceRefs: selectedRefs,
        confirmedAssets: assets,
        scenario,
        options: { chunkRepository: demoRepository,
          generator: {
            async generate(input) {
              return {
                title: `${input.scenario}-title`,
                body: "复用已确认资产形成场景材料。",
                usedAssetIds: ["tech_asset_1"],
                evidenceChunkIds: [selectedChunks[0]!.chunkId],
              };
            },
          },
        },
      });
      assert.equal(material.scenario, scenario);
      assert.equal(material.title, `${scenario}-title`);
      assert.equal(material.usedAssetIds.includes("tech_asset_1"), true);
    }
  });

  it("剥离后的标题和正文保持可读，且不回填 Canonical 片段", async () => {
    const assets = await confirmedAssets();
    const quotes = selectedChunks.map((chunk) => chunk.text);

    const material = await generateScenarioMaterial({
      confirmedProfile: profile,
      selectedEvidenceRefs: selectedRefs,
      confirmedAssets: assets,
      scenario: "leadership_research",
      options: { chunkRepository: demoRepository,
        generator: {
          async generate() {
            return {
              title: "示例智造调研汇报：工业具身智能助力智能制造柔性升级",
              body: [
                "下面，我代表公司围绕企业情况、技术产品、产业价值和发展方向作简要汇报。",
                "三、产业价值",
                "四、发展方向",
                "我们将继续面向汽车制造深化应用。",
              ].join("\n"),
              usedAssetIds: ["ind_asset_1"],
              evidenceChunkIds: [selectedChunks[1]!.chunkId],
            };
          },
        },
      },
    });

    const enterprise = enterpriseBodyWithoutQuotes(material.body, quotes);
    assert.equal(material.title, "示例智造调研汇报：工业具身智能助力柔性升级");
    assert.equal(enterprise.includes("围绕企业情况、技术产品和发展方向作简要汇报。"), true);
    assert.equal(enterprise.includes("产业价值"), false);
    assert.equal(enterprise.includes("智能制造"), false);
    assert.equal(hasStripArtifacts(material.title), false);
    assert.equal(hasStripArtifacts(enterprise.replaceAll("\n", "")), false);
    for (const quote of quotes) {
      assert.equal(containsCanonicalFragment(enterprise, quote), false);
    }
    assert.equal(material.body.includes(selectedChunks[1]!.text), true);
  });

  it("若未复用已确认资产则失败", async () => {
    const assets = await confirmedAssets();
    await assert.rejects(
      () =>
        generateScenarioMaterial({
          confirmedProfile: profile,
          selectedEvidenceRefs: selectedRefs,
          confirmedAssets: assets,
          scenario: "leadership_research",
          options: { chunkRepository: demoRepository,
            generator: {
              async generate() {
                return {
                  title: "空资产",
                  body: "没有复用资产",
                  usedAssetIds: ["missing"],
                  evidenceChunkIds: [selectedChunks[0]!.chunkId],
                };
              },
            },
          },
        }),
      MaterialError,
    );
  });
});
