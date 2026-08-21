import type {
  DiscourseAsset,
  DiscourseAssets,
  EnterpriseProfile,
  EvidenceRef,
  GeneratedMaterial,
  Scenario,
  SpeechRecommendation,
} from "../lib/schemas";
import { ASSET_DIMENSIONS, PROFILE_DIMENSION_KEYS, type AssetDimensionKey } from "./labels";

export class ApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ErrorBody = {
  error?: string;
  message?: string;
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("网络请求失败：请确认本地服务已启动", 0);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorBody = (payload ?? {}) as ErrorBody;
    throw new ApiError(
      errorBody.message ?? `请求失败（HTTP ${response.status}）`,
      response.status,
      errorBody.error,
    );
  }

  return payload as T;
}

export type GenerateProfileResponse = {
  profile: EnterpriseProfile;
};

export type RecommendSpeechesResponse = {
  recommendations: SpeechRecommendation[];
};

export type GenerateAssetsResponse = {
  assets: DiscourseAssets;
};

export type GenerateMaterialResponse = {
  material: GeneratedMaterial;
};

export function generateProfile(rawCompanyDescription: string) {
  return postJson<GenerateProfileResponse>("/api/profile/generate", {
    rawCompanyDescription,
  });
}

export function recommendSpeeches(confirmedProfile: EnterpriseProfile) {
  return postJson<RecommendSpeechesResponse>("/api/speeches/recommend", {
    confirmedProfile,
  });
}

export function generateAssets(
  confirmedProfile: EnterpriseProfile,
  selectedEvidenceRefs: EvidenceRef[],
) {
  return postJson<GenerateAssetsResponse>("/api/assets/generate", {
    confirmedProfile,
    selectedEvidenceRefs,
  });
}

export function generateMaterial(input: {
  confirmedProfile: EnterpriseProfile;
  selectedEvidenceRefs: EvidenceRef[];
  confirmedAssets: DiscourseAssets;
  scenario: Scenario;
  additionalRequirements?: string;
}) {
  return postJson<GenerateMaterialResponse>("/api/material/generate", input);
}

export function sanitizeProfile(profile: EnterpriseProfile): EnterpriseProfile {
  const trimItems = (items: EnterpriseProfile["companyPositioning"]) =>
    items
      .map((item) => ({ ...item, value: item.value.trim() }))
      .filter((item) => item.value.length > 0);

  return {
    ...profile,
    companyPositioning: trimItems(profile.companyPositioning),
    technologyAndInnovation: trimItems(profile.technologyAndInnovation),
    productsAndApplications: trimItems(profile.productsAndApplications),
    industryAndMarket: trimItems(profile.industryAndMarket),
    valueCreation: trimItems(profile.valueCreation),
  };
}

export function profileItemCount(profile: EnterpriseProfile): number {
  return PROFILE_DIMENSION_KEYS.reduce(
    (total, key) => total + profile[key].length,
    0,
  );
}

export function profileHasItems(profile: EnterpriseProfile): boolean {
  return profileItemCount(profile) > 0;
}

/**
 * 后端生成的资产 text = 企业表达 + "\n\n【引用】\n<Canonical Quote>" 回填块。
 * 引用块是总书记原文，前端只允许编辑企业表达部分；引用块原样保留、只读展示。
 */
export const QUOTE_HEADING = "【引用】";

const QUOTE_MARKER = `\n\n${QUOTE_HEADING}`;

export function splitAssetText(text: string): {
  enterprise: string;
  quoteSuffix: string;
} {
  const index = text.indexOf(QUOTE_MARKER);
  if (index < 0) {
    return { enterprise: text, quoteSuffix: "" };
  }
  return {
    enterprise: text.slice(0, index),
    quoteSuffix: text.slice(index),
  };
}

export function joinAssetText(enterprise: string, quoteSuffix: string): string {
  return `${enterprise}${quoteSuffix}`;
}

export function assetEnterpriseText(asset: DiscourseAsset): string {
  return splitAssetText(asset.text).enterprise;
}

export function countAssets(assets: DiscourseAssets): number {
  return ASSET_DIMENSIONS.reduce(
    (total, dimension) => total + assets[dimension.key].length,
    0,
  );
}

export function assetIsComplete(asset: DiscourseAsset): boolean {
  return (
    asset.title.trim().length > 0 &&
    splitAssetText(asset.text).enterprise.trim().length > 0
  );
}

export function assetsAreComplete(assets: DiscourseAssets): boolean {
  if (countAssets(assets) === 0) return false;
  return ASSET_DIMENSIONS.every((dimension) =>
    assets[dimension.key].every(assetIsComplete),
  );
}

/** 提交前规范化：仅 trim 标题与企业表达；引用块逐字节保留后端回填内容。 */
export function normalizeAssetsForSubmit(assets: DiscourseAssets): DiscourseAssets {
  const normalize = (items: DiscourseAsset[]) =>
    items.map((item) => {
      const { enterprise, quoteSuffix } = splitAssetText(item.text);
      return {
        ...item,
        title: item.title.trim(),
        text: joinAssetText(enterprise.trim(), quoteSuffix),
      };
    });

  const normalized = {
    ...assets,
    technologyInnovation: normalize(assets.technologyInnovation),
    industryValue: normalize(assets.industryValue),
    socialValue: normalize(assets.socialValue),
    developmentPositioning: normalize(assets.developmentPositioning),
  };
  delete normalized.placeholder;
  return normalized;
}

export function updateAssetText(
  asset: DiscourseAsset,
  enterprise: string,
): DiscourseAsset {
  const { quoteSuffix } = splitAssetText(asset.text);
  return { ...asset, text: joinAssetText(enterprise, quoteSuffix) };
}

export function emptyAssets(): DiscourseAssets {
  return {
    technologyInnovation: [],
    industryValue: [],
    socialValue: [],
    developmentPositioning: [],
  };
}

export type { AssetDimensionKey };
