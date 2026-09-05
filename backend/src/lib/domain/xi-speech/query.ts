import { createHash } from "node:crypto";
import { HINT_RULE_VERSION } from "./constants";
import type { EnterpriseProfile, ProfileItem } from "../../schemas";
import type { RetrievalIntent, RetrievalQuery } from "../../retrieval/types";
import { tokenize } from "../../retrieval/tokenize";

const THEME_HINT_RULES: Array<{ match: string; hint: string }> = [
  { match: "人工智能", hint: "科技创新" },
  { match: "具身智能", hint: "智能制造" },
  { match: "机器人", hint: "制造业" },
  { match: "新能源", hint: "绿色发展" },
  { match: "电池", hint: "绿色低碳" },
  { match: "数字化", hint: "产业转型升级" },
  { match: "民营", hint: "民营经济" },
  { match: "农业", hint: "乡村振兴" },
  { match: "文旅", hint: "文化自信" },
  { match: "教育", hint: "教育强国" },
  { match: "国企", hint: "国有企业" },
  { match: "外贸", hint: "对外开放" },
  { match: "出口", hint: "一带一路" },
];

export function collectProfileItems(profile: EnterpriseProfile): ProfileItem[] {
  return [
    ...profile.companyPositioning,
    ...profile.technologyAndInnovation,
    ...profile.productsAndApplications,
    ...profile.industryAndMarket,
    ...profile.valueCreation,
  ];
}

export function confirmedFactsFromProfile(profile: EnterpriseProfile): RetrievalIntent["confirmedFacts"] {
  return collectProfileItems(profile).map((item) => ({
    id: item.id,
    text: item.value,
    origin: item.origin,
  }));
}

export function buildThemeHints(
  facts: RetrievalIntent["confirmedFacts"],
): RetrievalIntent["retrievalHints"] {
  const hints: RetrievalIntent["retrievalHints"] = [];
  const seen = new Set<string>();
  const factText = facts.map((fact) => fact.text).join("\n");
  for (const rule of THEME_HINT_RULES) {
    const fromFactIds = facts.filter((fact) => fact.text.includes(rule.match)).map((fact) => fact.id);
    if (fromFactIds.length === 0) continue;
    if (factText.includes(rule.hint) || seen.has(rule.hint)) continue;
    seen.add(rule.hint);
    hints.push({
      text: rule.hint,
      source: "deterministic_rule",
      version: HINT_RULE_VERSION,
      fromFactIds,
    });
  }
  return hints;
}

export function profileSnapshotRef(profile: EnterpriseProfile): string {
  const payload = collectProfileItems(profile)
    .map((item) => `${item.id}:${item.origin}:${item.value.length}`)
    .join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}

export function buildRetrievalTextFromFacts(
  facts: RetrievalIntent["confirmedFacts"],
  hints: RetrievalIntent["retrievalHints"] = [],
): string {
  const factLines = [
    `企业定位：${facts.filter((item) => item.id.startsWith("pos")).map((item) => item.text).join("；")}`,
    `核心技术：${facts.filter((item) => item.id.startsWith("tech")).map((item) => item.text).join("；")}`,
    `核心产品：${facts.filter((item) => item.id.startsWith("prod")).map((item) => item.text).join("；")}`,
    `应用场景：${facts.filter((item) => item.id.startsWith("prod")).map((item) => item.text).join("；")}`,
    `产业定位：${facts.filter((item) => item.id.startsWith("ind")).map((item) => item.text).join("；")}`,
    `价值创造：${facts.filter((item) => item.id.startsWith("val")).map((item) => item.text).join("；")}`,
  ];
  if (facts.some((item) => !/^(pos|tech|prod|ind|val)_/.test(item.id))) {
    factLines.push(`已确认事实：${facts.map((item) => item.text).join("；")}`);
  }
  if (hints.length > 0) {
    factLines.push(`检索提示：${hints.map((hint) => hint.text).join("；")}`);
  }
  return factLines.join("\n");
}

export function buildXiSpeechRetrievalIntent(
  profile: EnterpriseProfile,
  options: { includeHints?: boolean } = {},
): RetrievalIntent {
  const confirmedFacts = confirmedFactsFromProfile(profile);
  const retrievalHints = options.includeHints ? buildThemeHints(confirmedFacts) : [];
  return {
    confirmedFacts,
    retrievalHints,
    metadataFilters: {},
    profileSnapshotRef: profileSnapshotRef(profile),
    queryText: buildRetrievalTextFromFacts(confirmedFacts, retrievalHints),
  };
}

export function intentToRetrievalQuery(intent: RetrievalIntent, topK: number): RetrievalQuery {
  const exactPhrases = intent.confirmedFacts
    .map((fact) => fact.text.trim())
    .filter((text) => text.length >= 4 && text.length <= 24);
  const lexicalTerms = tokenize(
    [...intent.confirmedFacts.map((fact) => fact.text), ...intent.retrievalHints.map((hint) => hint.text)].join("\n"),
  );
  return {
    text: intent.queryText,
    lexicalTerms,
    exactPhrases,
    metadataFilters: intent.metadataFilters,
    topK,
  };
}
