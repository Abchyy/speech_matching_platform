import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  containsCanonicalFragment,
  hasStripArtifacts,
  stripAgainstCanonicalTexts,
  stripCanonicalFragments,
} from "./canonical-text";

const quote =
  "【演示占位文本，非总书记讲话原文】发展新质生产力，需要把原创技术与应用场景结合起来，支持智能制造和工业升级。";

describe("canonical fragment strip readability", () => {
  it("剥离后仍检测不到 Canonical 连续片段", () => {
    const text = "我们围绕智能制造推进柔性生产，并把应用场景做实。";
    const cleaned = stripCanonicalFragments(text, quote);
    assert.equal(containsCanonicalFragment(cleaned, quote), false);
    assert.equal(cleaned.includes("智能制造"), false);
    assert.equal(cleaned.includes("应用场景"), false);
  });

  it("顿号加连词挖空会修成自然句子，且不回填原文", () => {
    const text = "下面围绕企业情况、技术产品、产业价值和发展方向作简要汇报。";
    const industryQuote =
      "【演示占位文本，非总书记讲话原文】支持科技型中小企业把自身技术能力转化为产业价值，在创新创业中服务实体经济。";
    const cleaned = stripAgainstCanonicalTexts(text, [industryQuote, quote]);
    assert.equal(cleaned, "下面围绕企业情况、技术产品和发展方向作简要汇报。");
    assert.equal(hasStripArtifacts(cleaned), false);
    assert.equal(containsCanonicalFragment(cleaned, industryQuote), false);
    assert.equal(cleaned.includes("产业价值"), false);
  });

  it("中文夹空格挖空会拼回可读短语，且不回填原文", () => {
    const text = "工业具身智能助力智能制造柔性升级";
    const cleaned = stripCanonicalFragments(text, quote);
    assert.equal(cleaned, "工业具身智能助力柔性升级");
    assert.equal(hasStripArtifacts(cleaned), false);
    assert.equal(containsCanonicalFragment(cleaned, quote), false);
    assert.equal(cleaned.includes("智能制造"), false);
  });

  it("小节标题不会粘进上一句，掏空后的标题连词可去掉", () => {
    const industryQuote =
      "【演示占位文本，非总书记讲话原文】支持科技型中小企业把自身技术能力转化为产业价值，在创新创业中服务实体经济。";
    const joined = stripAgainstCanonicalTexts(
      "努力以智能化手段服务传统产业。\n二、技术产品布局",
      [industryQuote],
    );
    assert.match(joined, /\n二、技术产品布局$/);
    assert.equal(joined.includes("产二、"), false);

    const glued = stripAgainstCanonicalTexts(
      "服务传统产业价值二、技术产品布局",
      [industryQuote],
    );
    assert.equal(glued.includes("产二、"), false);
    assert.match(glued, /\n二、技术产品布局/);

    const heading = stripAgainstCanonicalTexts("三、产业价值与实践", [industryQuote]);
    assert.equal(heading, "三、实践");
    assert.equal(heading.includes("三与实践"), false);
    assert.equal(containsCanonicalFragment(heading, industryQuote), false);

    const emptyHeading = stripAgainstCanonicalTexts(
      "三、产业价值\n我们继续面向汽车制造深化应用。",
      [industryQuote],
    );
    assert.doesNotMatch(emptyHeading, /^三、\s*$/m);
    assert.match(emptyHeading, /我们继续面向汽车制造深化应用。/);

    const locative = stripCanonicalFragments("我们在应用场景层面推进柔性生产。", quote);
    assert.equal(locative.includes("在层面"), false);
    assert.equal(containsCanonicalFragment(locative, quote), false);
  });

  it("保留换行，并去掉被掏空的小节标题", () => {
    const text = [
      "一、企业情况",
      "示例智造持续投入技术研发。",
      "三、产业价值",
      "四、发展方向",
      "公司将继续深耕汽车制造。",
    ].join("\n");
    const industryQuote =
      "【演示占位文本，非总书记讲话原文】支持科技型中小企业把自身技术能力转化为产业价值，在创新创业中服务实体经济。";
    const cleaned = stripAgainstCanonicalTexts(text, [industryQuote]);
    assert.equal(cleaned.includes("产业价值"), false);
    assert.equal(containsCanonicalFragment(cleaned, industryQuote), false);
    assert.equal(hasStripArtifacts(cleaned.replaceAll("\n", "")), false);
    assert.match(cleaned, /一、企业情况/);
    assert.match(cleaned, /四、发展方向/);
    assert.doesNotMatch(cleaned, /三、四、/);
    assert.doesNotMatch(cleaned, /^三、\s*$/m);
    assert.match(cleaned, /\n/);
  });

  it("掏空双宾语后删除整句，不留下将与融合", () => {
    const policyQuote =
      "加快发展数字经济，促进实体经济转型升级，推动数字化转型和产业融合。";
    const text = "公司明确将数字经济与实体经济融合。我们继续深耕汽车制造。";
    const cleaned = stripAgainstCanonicalTexts(text, [policyQuote]);

    assert.equal(cleaned.includes("数字经济"), false);
    assert.equal(cleaned.includes("实体经济"), false);
    assert.equal(cleaned.includes("将与融合"), false);
    assert.equal(cleaned.includes("明确将与"), false);
    assert.equal(cleaned, "我们继续深耕汽车制造。");
    assert.equal(hasStripArtifacts(cleaned), false);
    assert.equal(containsCanonicalFragment(cleaned, policyQuote), false);
  });

  it("掏空在X的时代背景下后删除整句，不留下在的时代背景下", () => {
    const policyQuote =
      "加快发展数字经济，促进实体经济转型升级，推动数字化转型和产业融合。";
    const text = "在数字化转型的时代背景下加快布局。我们继续深耕汽车制造。";
    const cleaned = stripAgainstCanonicalTexts(text, [policyQuote]);

    assert.equal(cleaned.includes("数字化转型"), false);
    assert.equal(cleaned.includes("在的时代背景下"), false);
    assert.equal(cleaned.includes("在的时代"), false);
    assert.equal(cleaned, "我们继续深耕汽车制造。");
    assert.equal(hasStripArtifacts(cleaned), false);
    assert.equal(containsCanonicalFragment(cleaned, policyQuote), false);
  });

  it("整句只剩语义缺口时删除，完整将与结构不误伤", () => {
    const policyQuote =
      "加快发展数字经济，促进实体经济转型升级，推动数字化转型和产业融合。";
    const emptied = stripAgainstCanonicalTexts(
      "公司明确将数字经济与实体经济融合。",
      [policyQuote],
    );
    assert.equal(emptied, "");
    assert.equal(hasStripArtifacts(emptied), false);

    const intact = stripAgainstCanonicalTexts(
      "企业将与高校共建实验室。现在的市场环境仍然复杂。",
      [policyQuote],
    );
    assert.match(intact, /企业将与高校共建实验室。/);
    assert.match(intact, /现在的市场环境仍然复杂。/);
  });
});
