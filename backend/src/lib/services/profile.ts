import type { EnterpriseInput, EnterpriseProfile, ProfileItem } from "../schemas";

const TECH_TERMS = [
  "工业具身智能",
  "具身智能",
  "视觉语言模型",
  "机器人控制",
  "人工智能",
  "多模态大模型",
  "大模型",
  "AI Agent",
  "工业视觉",
  "智能制造",
  "生物计算",
  "AI for Science",
];

function item(
  prefix: string,
  index: number,
  value: string,
  origin: ProfileItem["origin"],
  confidence: ProfileItem["confidence"],
): ProfileItem {
  return {
    id: `${prefix}_${index}`,
    value,
    origin,
    confidence,
  };
}

function firstSentence(text: string): string {
  const match = text.trim().split(/[。！？\n]/).find((part) => part.trim().length > 0);
  return (match ?? text).trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractTechTerms(description: string): string[] {
  return TECH_TERMS.filter((term) => description.includes(term));
}

export function generateEnterpriseProfile(input: EnterpriseInput): EnterpriseProfile {
  const description = input.rawCompanyDescription.trim();
  const explicitTechs = unique(input.techDomains ?? []);
  const inferredTechs = extractTechTerms(description).filter(
    (term) => !explicitTechs.includes(term),
  );

  const companyPositioning: ProfileItem[] = [];
  if (input.companyName) {
    companyPositioning.push(item("pos", 1, input.companyName, "explicit", "high"));
  }
  companyPositioning.push(
    item("pos", companyPositioning.length + 1, firstSentence(description), "inferred", "medium"),
  );

  const technologyAndInnovation: ProfileItem[] = [
    ...explicitTechs.map((term, index) => item("tech", index + 1, term, "explicit", "high")),
    ...inferredTechs.map((term, index) =>
      item("tech", explicitTechs.length + index + 1, term, "inferred", "medium"),
    ),
  ];
  if (technologyAndInnovation.length === 0) {
    technologyAndInnovation.push(
      item("tech", 1, "用户未提供足够的技术领域信息", "inferred", "low"),
    );
  }

  const productsAndApplications: ProfileItem[] = [];
  if (description.includes("汽车")) {
    productsAndApplications.push(
      item("prod", 1, "面向汽车制造相关应用场景", "inferred", "medium"),
    );
  }
  if (description.includes("柔性生产") || description.includes("柔性制造")) {
    productsAndApplications.push(
      item("prod", productsAndApplications.length + 1, "提升柔性生产能力", "inferred", "medium"),
    );
  }
  if (productsAndApplications.length === 0) {
    productsAndApplications.push(
      item("prod", 1, firstSentence(description), "inferred", "low"),
    );
  }

  const industryAndMarket: ProfileItem[] = [];
  if (input.industry) {
    industryAndMarket.push(item("ind", 1, input.industry, "explicit", "high"));
  } else if (description.includes("汽车制造")) {
    industryAndMarket.push(item("ind", 1, "汽车制造", "inferred", "medium"));
  } else if (description.includes("制造")) {
    industryAndMarket.push(item("ind", 1, "制造业", "inferred", "medium"));
  } else {
    industryAndMarket.push(item("ind", 1, "用户未明确行业方向", "inferred", "low"));
  }

  const valueCreation: ProfileItem[] = [];
  if (input.developmentNeeds) {
    valueCreation.push(item("val", 1, input.developmentNeeds, "explicit", "high"));
  }
  if (description.includes("柔性")) {
    valueCreation.push(
      item("val", valueCreation.length + 1, "以智能技术提升制造柔性与生产效率", "inferred", "medium"),
    );
  }
  if (valueCreation.length === 0) {
    valueCreation.push(
      item("val", 1, "将技术能力转化为可对外表达的产业与社会价值", "inferred", "low"),
    );
  }

  return {
    companyPositioning,
    technologyAndInnovation,
    productsAndApplications,
    industryAndMarket,
    valueCreation,
  };
}

export function buildRetrievalText(profile: EnterpriseProfile): string {
  const join = (items: ProfileItem[]) => items.map((entry) => entry.value).join("；");
  return [
    `企业定位：${join(profile.companyPositioning)}`,
    `核心技术：${join(profile.technologyAndInnovation)}`,
    `核心产品：${join(profile.productsAndApplications)}`,
    `应用场景：${join(profile.productsAndApplications)}`,
    `产业定位：${join(profile.industryAndMarket)}`,
    `价值创造：${join(profile.valueCreation)}`,
  ].join("\n");
}

export function collectProfileItems(profile: EnterpriseProfile): ProfileItem[] {
  return [
    ...profile.companyPositioning,
    ...profile.technologyAndInnovation,
    ...profile.productsAndApplications,
    ...profile.industryAndMarket,
    ...profile.valueCreation,
  ];
}
