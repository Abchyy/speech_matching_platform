import type {
  EnterpriseProfile,
  ProfileItem,
  SpeechRecommendation,
} from "../lib/schemas";
import { PROFILE_DIMENSION_KEYS, type ProfileDimensionKey } from "./labels";

export type StageId = "input" | "profile" | "speeches" | "assets" | "material";

export type PendingKey = "profile" | "recommend" | null;

export type WorkspaceState = {
  description: string;
  profile: EnterpriseProfile | null;
  profileConfirmed: boolean;
  recommendations: SpeechRecommendation[];
  selectedChunkIds: string[];
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
  | { type: "SET_VIEWING"; stage: StageId };

const STAGE_ORDER: StageId[] = ["input", "profile", "speeches", "assets", "material"];

export function furthestStage(state: WorkspaceState): StageId {
  // B + 2b：勾选证据最远解锁到话语资产待接入页；
  // 场景材料在资产确认（闸门 3，待后端接口接入）之前保持锁定。
  if (state.selectedChunkIds.length > 0) return "assets";
  if (state.recommendations.length > 0) return "speeches";
  if (state.profile) return "profile";
  return "input";
}

export function canViewStage(state: WorkspaceState, stage: StageId): boolean {
  return STAGE_ORDER.indexOf(stage) <= STAGE_ORDER.indexOf(furthestStage(state));
}

function newItemId(): string {
  return `user_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 上游失效机制（对应技术架构 §22）：画像被修改后，
 * 讲话推荐、证据勾选全部作废，必须重新确认画像后再次检索。
 */
function invalidateDownstream(state: WorkspaceState): WorkspaceState {
  const hadDownstream =
    state.profileConfirmed ||
    state.recommendations.length > 0 ||
    state.selectedChunkIds.length > 0;
  return {
    ...state,
    profileConfirmed: false,
    recommendations: [],
    selectedChunkIds: [],
    viewing: "profile",
    notice: hadDownstream
      ? "画像已修改：讲话推荐与证据勾选已失效，请重新确认画像。"
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
        recommendations: [],
        selectedChunkIds: [],
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
      return invalidateDownstream({
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
      return invalidateDownstream({
        ...state,
        profile: {
          ...state.profile,
          [action.dimension]: [...state.profile[action.dimension], item],
        },
      });
    }
    case "REMOVE_PROFILE_ITEM": {
      if (!state.profile) return state;
      return invalidateDownstream({
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
        viewing: "speeches",
        notice: null,
        error: null,
      };
    case "TOGGLE_EVIDENCE": {
      const selected = state.selectedChunkIds.includes(action.chunkId)
        ? state.selectedChunkIds.filter((id) => id !== action.chunkId)
        : [...state.selectedChunkIds, action.chunkId];
      const viewing =
        selected.length === 0 &&
        (state.viewing === "assets" || state.viewing === "material")
          ? "speeches"
          : state.viewing;
      return { ...state, selectedChunkIds: selected, viewing, error: null };
    }
    case "SET_VIEWING":
      if (!canViewStage(state, action.stage)) return state;
      return { ...state, viewing: action.stage, error: null };
    default:
      return state;
  }
}
