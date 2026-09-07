import { generateEnterpriseProfile } from "../services/profile";
import type { EnterpriseProfile } from "../schemas";

export type EvalCase = {
  id: string;
  title: string;
  provenance: "provisional-eval-set-v1";
  goldKind: "provisional";
  profile: EnterpriseProfile;
  expectedThemes: string[];
  notes: string;
};

function profile(description: string, extra: Parameters<typeof generateEnterpriseProfile>[0] = { rawCompanyDescription: description }) {
  return generateEnterpriseProfile({ ...extra, rawCompanyDescription: description });
}

export const EVAL_CASES: EvalCase[] = [
  {
    id: "happy-path-embodied-ai",
    title: "工业具身智能 Happy Path",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile(
      "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
      {
        rawCompanyDescription:
          "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
        companyName: "示例智造",
        industry: "汽车制造",
        techDomains: ["工业具身智能", "人工智能"],
      },
    ),
    expectedThemes: ["人工智能", "智能制造", "科技创新", "制造业"],
    notes: "现有演示 Happy Path，保留人工可读检查。",
  },
  {
    id: "case-01-ai-startup",
    title: "AI 科技创业企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("一家人工智能创业公司，研发大模型应用，服务软件与数字产业。", {
      rawCompanyDescription: "一家人工智能创业公司，研发大模型应用，服务软件与数字产业。",
      industry: "人工智能",
      techDomains: ["人工智能", "大模型"],
    }),
    expectedThemes: ["人工智能", "科技创新", "数字经济"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
  {
    id: "case-02-new-energy",
    title: "新能源制造企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("新能源电池制造企业，推进绿色低碳和智能工厂。", {
      rawCompanyDescription: "新能源电池制造企业，推进绿色低碳和智能工厂。",
      industry: "新能源",
      techDomains: ["新能源", "电池"],
    }),
    expectedThemes: ["新能源", "绿色发展", "绿色低碳"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
  {
    id: "case-03-manufacturing-digital",
    title: "传统制造业数字化转型企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("传统制造企业推进数字化转型和产业升级，服务实体经济。", {
      rawCompanyDescription: "传统制造企业推进数字化转型和产业升级，服务实体经济。",
      industry: "制造业",
      techDomains: ["数字化转型"],
    }),
    expectedThemes: ["产业转型升级", "智能制造", "实体经济"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
  {
    id: "case-04-private-sme",
    title: "民营中小企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("民营中小制造企业，希望增强企业信心并改善营商环境。", {
      rawCompanyDescription: "民营中小制造企业，希望增强企业信心并改善营商环境。",
      industry: "民营经济",
    }),
    expectedThemes: ["民营经济", "民营企业", "营商环境"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
  {
    id: "case-05-agri-tech",
    title: "农业科技企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("农业科技企业，用数字化手段服务乡村振兴和农业现代化。", {
      rawCompanyDescription: "农业科技企业，用数字化手段服务乡村振兴和农业现代化。",
      industry: "农业科技",
      techDomains: ["农业科技"],
    }),
    expectedThemes: ["乡村振兴", "农业现代化", "农业科技"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
  {
    id: "case-06-culture-tourism",
    title: "文旅企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("文旅企业，推动文化传承与文旅融合。", {
      rawCompanyDescription: "文旅企业，推动文化传承与文旅融合。",
      industry: "文旅",
    }),
    expectedThemes: ["文化自信", "文化强国", "文旅融合"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
  {
    id: "case-07-edu-tech",
    title: "教育科技企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("教育科技企业，服务人才培养和教育数字化。", {
      rawCompanyDescription: "教育科技企业，服务人才培养和教育数字化。",
      industry: "教育科技",
      techDomains: ["教育科技"],
    }),
    expectedThemes: ["教育强国", "人才强国", "科教融合"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
  {
    id: "case-08-soe",
    title: "国有企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("国有企业，强调党建引领和社会责任。", {
      rawCompanyDescription: "国有企业，强调党建引领和社会责任。",
      industry: "国有企业",
    }),
    expectedThemes: ["国有企业", "党的建设", "社会责任"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
  {
    id: "case-09-trade",
    title: "外贸企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("外贸企业，开展国际合作和一带一路相关业务。", {
      rawCompanyDescription: "外贸企业，开展国际合作和一带一路相关业务。",
      industry: "外贸",
    }),
    expectedThemes: ["对外开放", "国际合作", "一带一路"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
  {
    id: "case-10-conglomerate",
    title: "综合型大型企业",
    provenance: "provisional-eval-set-v1",
    goldKind: "provisional",
    profile: profile("综合型大型企业，覆盖先进制造、科技创新和高质量发展。", {
      rawCompanyDescription: "综合型大型企业，覆盖先进制造、科技创新和高质量发展。",
      industry: "综合制造",
      techDomains: ["科技创新"],
    }),
    expectedThemes: ["高质量发展", "中国式现代化", "科技创新"],
    notes: "provisional theme keywords，不是人工 gold。",
  },
];
