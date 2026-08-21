import type { EnterpriseProfile, Scenario } from "../lib/schemas";

export const SAMPLE_COMPANY_DESCRIPTION =
  "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。";

export const DEMO_CORPUS_NOTICE =
  "当前语料为演示占位文本（DEMO_PLACEHOLDER），不是总书记讲话原文，仅用于验证检索与证据链路。";

export const PROFILE_DIMENSIONS = [
  { key: "companyPositioning", label: "企业定位", hint: "我是谁" },
  { key: "technologyAndInnovation", label: "技术与创新", hint: "我掌握什么" },
  { key: "productsAndApplications", label: "产品与应用", hint: "我做什么" },
  { key: "industryAndMarket", label: "产业与市场", hint: "我处于什么产业位置" },
  { key: "valueCreation", label: "价值创造", hint: "我创造什么价值" },
] as const satisfies ReadonlyArray<{
  key: keyof EnterpriseProfile;
  label: string;
  hint: string;
}>;

export type ProfileDimensionKey = (typeof PROFILE_DIMENSIONS)[number]["key"];

export const PROFILE_DIMENSION_KEYS = PROFILE_DIMENSIONS.map(
  (dimension) => dimension.key,
) as ProfileDimensionKey[];

export const ASSET_DIMENSION_LABELS = [
  "技术创新表达",
  "产业价值表达",
  "社会价值表达",
  "发展定位表达",
] as const;

export const SCENARIO_OPTIONS: ReadonlyArray<{
  key: Scenario;
  label: string;
  output: string;
  hint: string;
}> = [
  {
    key: "leadership_research",
    label: "领导调研",
    output: "企业调研汇报稿 / 企业介绍稿",
    hint: "正式、相对完整，介绍企业、技术产品、产业价值和发展方向。",
  },
  {
    key: "government_symposium",
    label: "政企座谈",
    output: "企业代表发言稿",
    hint: "第一人称，适合短时发言，突出核心价值与发展方向。",
  },
  {
    key: "government_coordination",
    label: "部门对接",
    output: "企业及项目沟通介绍材料",
    hint: "务实，强调企业做什么、解决什么产业问题、当前合作方向。",
  },
];

export const STAGES = [
  { id: "input", label: "企业输入", gate: null },
  { id: "profile", label: "企业画像", gate: "确认画像" },
  { id: "speeches", label: "讲话推荐", gate: "勾选证据" },
  { id: "assets", label: "话语资产", gate: "确认资产" },
  { id: "material", label: "场景材料", gate: null },
] as const;

export const ORIGIN_LABEL = {
  explicit: "用户明确提供",
  inferred: "系统保守归纳",
} as const;

export const CONFIDENCE_LABEL = {
  high: "把握较高",
  medium: "把握中等",
  low: "把握较低",
} as const;

export const RELEVANCE_LABEL = {
  strong: "关联较强",
  medium: "关联中等",
  weak: "关联较弱",
  irrelevant: "关联很弱",
} as const;
