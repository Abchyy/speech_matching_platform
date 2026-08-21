import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultChunkRepository } from "../corpus";
import {
  AssetsError,
  enterprisePortion,
  generateDiscourseAssets,
  MAX_ASSETS_PER_DIMENSION,
  QUOTE_HEADING,
} from "./assets";
import { containsCanonicalFragment } from "./canonical-text";
import { toFullChunkEvidenceRef } from "./evidence";
import { generateEnterpriseProfile } from "./profile";

const profile = generateEnterpriseProfile({
  rawCompanyDescription:
    "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
  companyName: "示例智造",
  industry: "汽车制造",
  techDomains: ["工业具身智能", "人工智能"],
});

const selectedChunks = defaultChunkRepository.listAll().slice(0, 2);
const selectedRefs = selectedChunks.map((chunk) => toFullChunkEvidenceRef(chunk));

describe("discourse asset generation", () => {
  it("只使用已选 EvidenceRef，并由程序回填 Canonical 原文", async () => {
    const quote = selectedChunks[0]!.text;
    const assets = await generateDiscourseAssets(profile, selectedRefs, {
      generator: {
        async generate() {
          return {
            technologyInnovation: [
              {
                title: "以人工智能服务制造现场",
                text: "企业将自身工业具身智能能力用于汽车制造柔性生产。",
                profileEvidenceIds: ["tech_1", "invented_id"],
                evidenceChunkIds: [selectedChunks[0]!.chunkId, "unselected_chunk"],
              },
            ],
            industryValue: [],
            socialValue: [],
            developmentPositioning: [],
          };
        },
      },
    });

    assert.equal(assets.placeholder, undefined);
    assert.equal(assets.technologyInnovation.length, 1);
    assert.equal(assets.industryValue.length, 0);
    assert.equal(assets.socialValue.length, 0);
    assert.equal(assets.developmentPositioning.length, 0);
    const asset = assets.technologyInnovation[0]!;
    assert.deepEqual(
      asset.evidenceRefs.map((ref) => ref.chunkId),
      [selectedChunks[0]!.chunkId],
    );
    assert.equal(asset.evidenceRefs[0]?.startIndex, 0);
    assert.equal(asset.evidenceRefs[0]?.endIndex, quote.length);
    assert.equal(asset.profileEvidenceIds.includes("invented_id"), false);
    assert.equal(asset.profileEvidenceIds.includes("tech_1"), true);
    assert.equal(asset.text.includes(`${QUOTE_HEADING}\n${quote}`), true);
    assert.equal(containsCanonicalFragment(enterprisePortion(asset.text), quote), false);
  });

  it("拒绝未通过校验的 EvidenceRef", async () => {
    await assert.rejects(
      () =>
        generateDiscourseAssets(
          profile,
          [
            {
              speechId: selectedChunks[0]!.speechId,
              chunkId: selectedChunks[0]!.chunkId,
              startIndex: 1,
              endIndex: selectedChunks[0]!.text.length,
            },
          ],
          {
            generator: {
              async generate() {
                throw new Error("不应调用生成器");
              },
            },
          },
        ),
      (error: unknown) => error instanceof Error && error.name === "EvidenceError",
    );
  });

  it("丢弃未引用已选 Evidence 的资产，并剥离模型写入的原文片段", async () => {
    const quote = selectedChunks[1]!.text;
    const fragment = quote.slice(8, 20);
    const assets = await generateDiscourseAssets(profile, selectedRefs, {
      generator: {
        async generate() {
          return {
            technologyInnovation: [
              {
                title: "无效资产",
                text: "未引用已选证据",
                profileEvidenceIds: ["tech_1"],
                evidenceChunkIds: ["not_selected"],
              },
            ],
            industryValue: [
              {
                title: "产业协同",
                text: `企业服务汽车制造升级。模型摘录：${fragment}`,
                profileEvidenceIds: ["ind_1"],
                evidenceRefs: [{ chunkId: selectedChunks[1]!.chunkId }],
              },
            ],
            socialValue: [],
            developmentPositioning: [],
          };
        },
      },
    });

    assert.equal(assets.technologyInnovation.length, 0);
    assert.equal(assets.industryValue.length, 1);
    const asset = assets.industryValue[0]!;
    assert.equal(enterprisePortion(asset.text).includes(fragment), false);
    assert.equal(containsCanonicalFragment(enterprisePortion(asset.text), quote), false);
    assert.equal(asset.text.includes(quote), true);
  });

  it("若模型未引用任何已选 Evidence 则失败", async () => {
    await assert.rejects(
      () =>
        generateDiscourseAssets(profile, selectedRefs, {
          generator: {
            async generate() {
              return {
                technologyInnovation: [
                  {
                    title: "空引用",
                    text: "没有证据",
                    profileEvidenceIds: ["tech_1"],
                    evidenceChunkIds: ["missing"],
                  },
                ],
              };
            },
          },
        }),
      AssetsError,
    );
  });

  it("每个维度最多两条，超出部分丢弃；其他维允许为空", async () => {
    const assets = await generateDiscourseAssets(profile, selectedRefs, {
      generator: {
        async generate() {
          return {
            technologyInnovation: [1, 2, 3].map((index) => ({
              title: `技术创新表达 ${index}`,
              text: `企业基于已确认技术能力形成第 ${index} 条表达。`,
              profileEvidenceIds: ["tech_1"],
              evidenceChunkIds: [selectedChunks[0]!.chunkId],
            })),
            industryValue: [],
            socialValue: [],
            developmentPositioning: [],
          };
        },
      },
    });

    assert.equal(MAX_ASSETS_PER_DIMENSION, 2);
    assert.equal(assets.technologyInnovation.length, MAX_ASSETS_PER_DIMENSION);
    assert.deepEqual(
      assets.technologyInnovation.map((asset) => asset.title),
      ["技术创新表达 1", "技术创新表达 2"],
    );
    assert.equal(assets.industryValue.length, 0);
    assert.equal(assets.socialValue.length, 0);
    assert.equal(assets.developmentPositioning.length, 0);
  });

  it("丢弃未绑定已确认画像条目的资产", async () => {
    await assert.rejects(
      () =>
        generateDiscourseAssets(profile, selectedRefs, {
          generator: {
            async generate() {
              return {
                technologyInnovation: [
                  {
                    title: "无画像依据",
                    text: "未绑定画像条目",
                    profileEvidenceIds: ["invented_id"],
                    evidenceChunkIds: [selectedChunks[0]!.chunkId],
                  },
                ],
              };
            },
          },
        }),
      AssetsError,
    );
  });
});
