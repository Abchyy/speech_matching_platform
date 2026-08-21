import type { EnterpriseProfile, SpeechRecommendation } from "../lib/schemas";
import { PROFILE_DIMENSION_KEYS } from "./labels";

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
