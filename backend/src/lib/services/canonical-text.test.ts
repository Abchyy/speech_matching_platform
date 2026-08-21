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
});
