import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ProviderError, type LlmProvider } from "../providers";
import {
  enforceFactBoundary,
  generateEnterpriseProfileFallback,
  generateEnterpriseProfileWithLlm,
  generateProfileUseCase,
  ProfileGenerationError,
} from "./profile-llm";

const input = {
  rawCompanyDescription: "我们是一家做工业具身智能的创业公司，面向汽车制造。",
  companyName: "示例智造",
  industry: "智能制造",
  techDomains: ["工业具身智能"],
};

function provider(data: unknown): LlmProvider {
  return {
    provider: "deepseek",
    model: "test-model",
    async completeJson() {
      return data;
    },
  };
}

describe("LLM enterprise profile generation", () => {
  it("正常输出通过 Zod 并区分 explicit/inferred", async () => {
    const result = await generateEnterpriseProfileWithLlm(input, {
      provider: provider({
        companyPositioning: [
          { id: "pos_1", value: "示例智造", origin: "explicit", confidence: "high" },
        ],
        technologyAndInnovation: [
          { id: "tech_1", value: "工业具身智能", origin: "explicit", confidence: "high" },
        ],
        productsAndApplications: [
          { id: "prod_1", value: "面向汽车制造", origin: "inferred", confidence: "medium" },
        ],
        industryAndMarket: [
          { id: "ind_1", value: "智能制造", origin: "explicit", confidence: "high" },
        ],
        valueCreation: [
          { id: "val_1", value: "用户未提供足够信息", origin: "inferred", confidence: "low" },
        ],
      }),
    });
    assert.equal(result.fallback, false);
    assert.equal(result.generator, "deepseek");
    assert.equal(result.profile.companyPositioning[0]?.origin, "explicit");
    assert.equal(result.profile.productsAndApplications[0]?.origin, "inferred");
  });

  it("非法 JSON / Schema 错误失败关闭", async () => {
    await assert.rejects(
      () =>
        generateEnterpriseProfileWithLlm(input, {
          provider: {
            provider: "deepseek",
            model: "test",
            async completeJson() {
              throw new ProviderError("not json", {
                code: "PROVIDER_INVALID_JSON",
                retryable: false,
              });
            },
          },
        }),
      (error: unknown) =>
        error instanceof ProfileGenerationError && error.code === "PROVIDER_INVALID_JSON",
    );
    await assert.rejects(
      () => generateEnterpriseProfileWithLlm(input, { provider: provider({ nope: true }) }),
      (error: unknown) => error instanceof ProfileGenerationError && error.code === "PROVIDER_SCHEMA",
    );
  });

  it("模型超时失败关闭", async () => {
    await assert.rejects(
      () =>
        generateEnterpriseProfileWithLlm(input, {
          provider: {
            provider: "deepseek",
            model: "test",
            async completeJson() {
              throw new ProviderError("timeout", {
                code: "PROVIDER_TIMEOUT",
                retryable: true,
              });
            },
          },
        }),
      (error: unknown) => error instanceof ProfileGenerationError && error.code === "PROVIDER_TIMEOUT",
    );
  });

  it("虚构融资等事实会被边界检查丢掉", async () => {
    const result = await generateEnterpriseProfileWithLlm(input, {
      provider: provider({
        companyPositioning: [
          { id: "pos_1", value: "示例智造", origin: "explicit", confidence: "high" },
        ],
        technologyAndInnovation: [
          { id: "tech_1", value: "工业具身智能", origin: "explicit", confidence: "high" },
        ],
        productsAndApplications: [
          { id: "prod_1", value: "已获B轮融资2亿", origin: "inferred", confidence: "high" },
        ],
        industryAndMarket: [
          { id: "ind_1", value: "智能制造", origin: "explicit", confidence: "high" },
        ],
        valueCreation: [
          { id: "val_1", value: "用户未提供足够信息", origin: "inferred", confidence: "low" },
        ],
      }),
    });
    assert.equal(
      result.profile.productsAndApplications.some((item) => item.value.includes("融资")),
      false,
    );
  });

  it("与输入无关的量子芯片、亿元营收、行业第一、头部客户不得因 low 置信度放行", async () => {
    const adversarial = {
      companyPositioning: [
        { id: "pos_1", value: "行业第一", origin: "inferred" as const, confidence: "low" as const },
      ],
      technologyAndInnovation: [
        { id: "tech_1", value: "量子芯片核心专利", origin: "inferred" as const, confidence: "low" as const },
      ],
      productsAndApplications: [
        { id: "prod_1", value: "头部客户覆盖全国", origin: "inferred" as const, confidence: "low" as const },
      ],
      industryAndMarket: [
        { id: "ind_1", value: "亿元营收", origin: "explicit" as const, confidence: "high" as const },
      ],
      valueCreation: [
        { id: "val_1", value: "用户未提供足够信息", origin: "inferred" as const, confidence: "low" as const },
      ],
    };
    const bounded = enforceFactBoundary(adversarial, input);
    const joined = [
      ...bounded.companyPositioning,
      ...bounded.technologyAndInnovation,
      ...bounded.productsAndApplications,
      ...bounded.industryAndMarket,
      ...bounded.valueCreation,
    ]
      .map((item) => item.value)
      .join("\n");
    assert.equal(joined.includes("量子芯片"), false);
    assert.equal(joined.includes("核心专利"), false);
    assert.equal(joined.includes("亿元营收"), false);
    assert.equal(joined.includes("行业第一"), false);
    assert.equal(joined.includes("头部客户"), false);

    const result = await generateEnterpriseProfileWithLlm(input, { provider: provider(adversarial) });
    const values = [
      ...result.profile.companyPositioning,
      ...result.profile.technologyAndInnovation,
      ...result.profile.productsAndApplications,
      ...result.profile.industryAndMarket,
    ].map((item) => item.value);
    assert.equal(values.some((value) => /量子芯片|亿元营收|行业第一|头部客户/.test(value)), false);
  });

  it("规则 fallback 必须显式标记，不能冒充真实模型", () => {
    const result = generateEnterpriseProfileFallback(input);
    assert.equal(result.generator, "rules-fallback");
    assert.equal(result.fallback, true);
  });

  it("无凭据时走 fallback，且不允许时失败", async () => {
    const fallback = await generateProfileUseCase(input, { hasLlmCredentials: false });
    assert.equal(fallback.generator, "rules-fallback");
    await assert.rejects(
      () => generateProfileUseCase(input, { hasLlmCredentials: false, allowRulesFallback: false }),
      ProfileGenerationError,
    );
  });
});
