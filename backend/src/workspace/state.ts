import type {
  DiscourseAsset,
  DiscourseAssets,
  EnterpriseProfile,
  EvidenceRef,
  GeneratedMaterial,
  ProfileItem,
  Scenario,
  SpeechRecommendation,
} from "../lib/schemas";
import { splitAssetText } from "./api";
import {
  PROFILE_DIMENSION_KEYS,
  type AssetDimensionKey,
  type ProfileDimensionKey,
} from "./labels";

export type StageId = "input" | "profile" | "speeches" | "assets" | "material";

export type PendingKey = "profile" | "recommend" | "assets" | "material" | null;

export type WorkspaceState = {
  description: string;
  profile: EnterpriseProfile | null;
  profileConfirmed: boolean;
  recommendations: SpeechRecommendation[];
  selectedChunkIds: string[];
  assets: DiscourseAssets | null;
  assetsConfirmed: boolean;
  scenario: Scenario | null;
  additionalRequirements: string;
  material: GeneratedMaterial | null;
  pending: PendingKey;
  error: string | null;
  notice: string | null;
  viewing: StageId;
};

export const initialWorkspaceState: WorkspaceState = {
  description: "",
  profile: null,
  profileConfirmed: false,
  recommendations: [],
  selectedChunkIds: [],
  assets: null,
  assetsConfirmed: false,
  scenario: null,
  additionalRequirements: "",
  material: null,
  pending: null,
  error: null,
  notice: null,
  viewing: "input",
};

export type WorkspaceAction =
  | { type: "SET_DESCRIPTION"; value: string }
  | { type: "REQUEST"; key: Exclude<PendingKey, null> }
  | { type: "FAIL"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "CLEAR_NOTICE" }
  | { type: "PROFILE_GENERATED"; profile: EnterpriseProfile }
  | {
      type: "UPDATE_PROFILE_ITEM";
      dimension: ProfileDimensionKey;
      id: string;
      value: string;
    }
  | { type: "ADD_PROFILE_ITEM"; dimension: ProfileDimensionKey }
  | { type: "REMOVE_PROFILE_ITEM"; dimension: ProfileDimensionKey; id: string }
  | { type: "CONFIRM_PROFILE"; profile: EnterpriseProfile }
  | { type: "RECOMMENDATIONS_LOADED"; recommendations: SpeechRecommendation[] }
  | { type: "TOGGLE_EVIDENCE"; chunkId: string }
  | {
      type: "ASSETS_LOADED";
      assets: DiscourseAssets;
      /** 发起请求时的勾选快照，用于丢弃过期响应。 */
      requestChunkIds: string[];
    }
  | {
      type: "UPDATE_ASSET";
      dimension: AssetDimensionKey;
      id: string;
      patch: Partial<Pick<DiscourseAsset, "title" | "text">>;
    }
  | { type: "REMOVE_ASSET"; dimension: AssetDimensionKey; id: string }
  | { type: "CONFIRM_ASSETS"; assets: DiscourseAssets }
  | { type: "SET_SCENARIO"; scenario: Scenario }
  | { type: "SET_REQUIREMENTS"; value: string }
  | { type: "MATERIAL_LOADED"; material: GeneratedMaterial }
  | { type: "SET_VIEWING"; stage: StageId };

const STAGE_ORDER: StageId[] = ["input", "profile", "speeches", "assets", "material"];

export function furthestStage(state: WorkspaceState): StageId {
  if (state.assets && state.assetsConfirmed) return "material";
  if (state.assets) return "assets";
  if (state.recommendations.length > 0) return "speeches";
  if (state.profile) return "profile";
  return "input";
}

export function canViewStage(state: WorkspaceState, stage: StageId): boolean {
  return STAGE_ORDER.indexOf(stage) <= STAGE_ORDER.indexOf(furthestStage(state));
}

export function getSelectedEvidenceRefs(state: WorkspaceState): EvidenceRef[] {
  return state.recommendations
    .filter((item) => state.selectedChunkIds.includes(item.chunkId))
    .map((item) => item.evidenceRef);
}

function newItemId(): string {
  return `user_${Math.random().toString(36).slice(2, 10)}`;
}

function clearFromRecommendations() {
  return {
    recommendations: [] as SpeechRecommendation[],
    selectedChunkIds: [] as string[],
    assets: null,
    assetsConfirmed: false,
    material: null,
  };
}

function clearFromAssets() {
  return {
    assets: null,
    assetsConfirmed: false,
    material: null,
  };
}

function clearMaterial() {
  return { material: null };
}

/**
 * 上游失效机制（技术架构 §22）：
 * 画像变化 → 推荐 / 勾选 / 资产 / 材料全部作废；
 * 勾选变化 → 资产 / 材料作废；
 * 资产或场景变化 → 材料作废。
 */
function invalidateAfterProfileChange(state: WorkspaceState): WorkspaceState {
  const hadDownstream =
    state.profileConfirmed ||
    state.recommendations.length > 0 ||
    state.selectedChunkIds.length > 0 ||
    state.assets !== null;
  return {
    ...state,
    profileConfirmed: false,
    ...clearFromRecommendations(),
    viewing: "profile",
    notice: hadDownstream
      ? "画像已修改：讲话推荐、证据勾选与话语资产已失效，请重新确认画像。"
      : state.notice,
    error: null,
  };
}

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "SET_DESCRIPTION":
      return { ...state, description: action.value, error: null };
    case "REQUEST":
      return { ...state, pending: action.key, error: null };
    case "FAIL":
      return { ...state, pending: null, error: action.message };
    case "CLEAR_ERROR":
      return { ...state, error: null };
    case "CLEAR_NOTICE":
      return { ...state, notice: null };
    case "PROFILE_GENERATED":
      return {
        ...state,
        pending: null,
        profile: action.profile,
        profileConfirmed: false,
        ...clearFromRecommendations(),
        viewing: "profile",
        notice: null,
        error: null,
      };
    case "UPDATE_PROFILE_ITEM": {
      if (!state.profile) return state;
      const items = state.profile[action.dimension].map((item) =>
        item.id === action.id
          ? {
              ...item,
              value: action.value,
              origin: "explicit" as const,
              confidence: "high" as const,
            }
          : item,
      );
      return invalidateAfterProfileChange({
        ...state,
        profile: { ...state.profile, [action.dimension]: items },
      });
    }
    case "ADD_PROFILE_ITEM": {
      if (!state.profile) return state;
      const item: ProfileItem = {
        id: newItemId(),
        value: "",
        origin: "explicit",
        confidence: "high",
      };
      return invalidateAfterProfileChange({
        ...state,
        profile: {
          ...state.profile,
          [action.dimension]: [...state.profile[action.dimension], item],
        },
      });
    }
    case "REMOVE_PROFILE_ITEM": {
      if (!state.profile) return state;
      return invalidateAfterProfileChange({
        ...state,
        profile: {
          ...state.profile,
          [action.dimension]: state.profile[action.dimension].filter(
            (item) => item.id !== action.id,
          ),
        },
      });
    }
    case "CONFIRM_PROFILE": {
      const hasItems = PROFILE_DIMENSION_KEYS.some(
        (key) => action.profile[key].length > 0,
      );
      if (!hasItems) {
        return {
          ...state,
          error: "画像内容为空：请至少保留一条有效条目后再确认。",
        };
      }
      return {
        ...state,
        profile: action.profile,
        profileConfirmed: true,
        notice: null,
        error: null,
      };
    }
    case "RECOMMENDATIONS_LOADED":
      return {
        ...state,
        pending: null,
        recommendations: action.recommendations,
        selectedChunkIds: [],
        ...clearFromAssets(),
        viewing: "speeches",
        notice: null,
        error: null,
      };
    case "TOGGLE_EVIDENCE": {
      const selected = state.selectedChunkIds.includes(action.chunkId)
        ? state.selectedChunkIds.filter((id) => id !== action.chunkId)
        : [...state.selectedChunkIds, action.chunkId];
      const hadAssets = state.assets !== null || state.material !== null;
      const next: WorkspaceState = {
        ...state,
        selectedChunkIds: selected,
        ...clearFromAssets(),
        error: null,
        notice: hadAssets
          ? "证据勾选已变化：话语资产与场景材料已失效，请重新生成话语资产。"
          : state.notice,
      };
      if (
        selected.length === 0 ||
        ((state.viewing === "assets" || state.viewing === "material") && hadAssets)
      ) {
        if (next.viewing === "assets" || next.viewing === "material") {
          next.viewing = "speeches";
        }
      }
      return next;
    }
    case "ASSETS_LOADED": {
      const current = [...state.selectedChunkIds].sort();
      const requested = [...action.requestChunkIds].sort();
      const matches =
        current.length === requested.length &&
        current.every((id, index) => id === requested[index]);
      if (!matches) {
        return {
          ...state,
          pending: null,
          notice: "证据勾选在生成期间已变化，已丢弃过期的资产结果。",
          error: null,
        };
      }
      return {
        ...state,
        pending: null,
        assets: action.assets,
        assetsConfirmed: false,
        ...clearMaterial(),
        viewing: "assets",
        notice: null,
        error: null,
      };
    }
    case "UPDATE_ASSET": {
      if (!state.assets) return state;
      const items = state.assets[action.dimension].map((item) =>
        item.id === action.id ? { ...item, ...action.patch } : item,
      );
      return {
        ...state,
        assets: { ...state.assets, [action.dimension]: items },
        assetsConfirmed: false,
        ...clearMaterial(),
        error: null,
      };
    }
    case "REMOVE_ASSET": {
      if (!state.assets) return state;
      return {
        ...state,
        assets: {
          ...state.assets,
          [action.dimension]: state.assets[action.dimension].filter(
            (item) => item.id !== action.id,
          ),
        },
        assetsConfirmed: false,
        ...clearMaterial(),
        error: null,
      };
    }
    case "CONFIRM_ASSETS": {
      const all = [
        ...action.assets.technologyInnovation,
        ...action.assets.industryValue,
        ...action.assets.socialValue,
        ...action.assets.developmentPositioning,
      ];
      if (all.length === 0) {
        return { ...state, error: "话语资产为空：请至少保留一条资产后再确认。" };
      }
      const hasIncomplete = all.some(
        (asset) =>
          asset.title.trim().length === 0 ||
          splitAssetText(asset.text).enterprise.trim().length === 0,
      );
      if (hasIncomplete) {
        return {
          ...state,
          error: "存在标题或正文为空的资产，请补全或删除后再确认。",
        };
      }
      return {
        ...state,
        assets: action.assets,
        assetsConfirmed: true,
        viewing: "material",
        notice: null,
        error: null,
      };
    }
    case "SET_SCENARIO":
      return {
        ...state,
        scenario: action.scenario,
        ...clearMaterial(),
        error: null,
      };
    case "SET_REQUIREMENTS":
      return {
        ...state,
        additionalRequirements: action.value,
        ...clearMaterial(),
        error: null,
      };
    case "MATERIAL_LOADED":
      return {
        ...state,
        pending: null,
        material: action.material,
        error: null,
      };
    case "SET_VIEWING":
      if (!canViewStage(state, action.stage)) return state;
      return { ...state, viewing: action.stage, error: null };
    default:
      return state;
  }
}
