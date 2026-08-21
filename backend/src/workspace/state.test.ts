import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EnterpriseProfile, SpeechRecommendation } from "../lib/schemas";
import {
  canViewStage,
  furthestStage,
  initialWorkspaceState,
  workspaceReducer,
  type WorkspaceState,
} from "./state";

function makeProfile(): EnterpriseProfile {
  const item = (id: string, value: string) => ({
    id,
    value,
    origin: "explicit" as const,
    confidence: "high" as const,
  });
  return {
    companyPositioning: [item("pos_1", "工业具身智能创业公司")],
    technologyAndInnovation: [item("tech_1", "视觉语言模型")],
    productsAndApplications: [item("prod_1", "柔性生产")],
    industryAndMarket: [item("ind_1", "智能制造")],
    valueCreation: [item("val_1", "提升生产效率")],
  };
}

function makeRecommendation(chunkId: string): SpeechRecommendation {
  const quote = `演示占位文本 ${chunkId}`;
  return {
    chunkId,
    speechId: `speech_${chunkId}`,
    title: "演示讲话",
    date: null,
    source: "演示来源",
    keywords: ["演示"],
    quote,
    evidenceRef: {
      speechId: `speech_${chunkId}`,
      chunkId,
      startIndex: 0,
      endIndex: quote.length,
    },
    relevance: "strong",
    reason: "演示推荐理由",
    profileEvidenceIds: [],
    isDemoPlaceholder: true,
  };
}

function confirmedState(): WorkspaceState {
  let state = workspaceReducer(initialWorkspaceState, {
    type: "PROFILE_GENERATED",
    profile: makeProfile(),
  });
  state = workspaceReducer(state, {
    type: "CONFIRM_PROFILE",
    profile: state.profile!,
  });
  return state;
}

function selectedState(): WorkspaceState {
  let state = confirmedState();
  state = workspaceReducer(state, {
    type: "RECOMMENDATIONS_LOADED",
    recommendations: [makeRecommendation("c1"), makeRecommendation("c2")],
  });
  state = workspaceReducer(state, { type: "TOGGLE_EVIDENCE", chunkId: "c1" });
  return state;
}

describe("workspace 状态机", () => {
  it("画像生成后进入 profile 步骤，下游为空", () => {
    const state = workspaceReducer(initialWorkspaceState, {
      type: "PROFILE_GENERATED",
      profile: makeProfile(),
    });
    assert.equal(state.viewing, "profile");
    assert.equal(state.profileConfirmed, false);
    assert.equal(state.recommendations.length, 0);
    assert.equal(furthestStage(state), "profile");
  });

  it("空画像不允许确认", () => {
    const empty: EnterpriseProfile = {
      companyPositioning: [],
      technologyAndInnovation: [],
      productsAndApplications: [],
      industryAndMarket: [],
      valueCreation: [],
    };
    let state = workspaceReducer(initialWorkspaceState, {
      type: "PROFILE_GENERATED",
      profile: empty,
    });
    state = workspaceReducer(state, { type: "CONFIRM_PROFILE", profile: empty });
    assert.equal(state.profileConfirmed, false);
    assert.ok(state.error?.includes("画像内容为空"));
  });

  it("确认画像后修改条目：推荐与勾选失效并提示", () => {
    let state = selectedState();
    assert.equal(state.profileConfirmed, true);
    state = workspaceReducer(state, {
      type: "UPDATE_PROFILE_ITEM",
      dimension: "companyPositioning",
      id: "pos_1",
      value: "修改后的定位",
    });
    assert.equal(state.profileConfirmed, false);
    assert.equal(state.recommendations.length, 0);
    assert.equal(state.selectedChunkIds.length, 0);
    assert.equal(state.viewing, "profile");
    assert.ok(state.notice?.includes("已失效"));
  });

  it("勾选证据后解锁话语资产页，但场景材料保持锁定", () => {
    const state = selectedState();
    assert.equal(furthestStage(state), "assets");
    assert.equal(canViewStage(state, "assets"), true);
    assert.equal(canViewStage(state, "material"), false);
  });

  it("未确认资产不能进入场景材料页", () => {
    let state = selectedState();
    state = workspaceReducer(state, { type: "SET_VIEWING", stage: "assets" });
    assert.equal(state.viewing, "assets");
    state = workspaceReducer(state, { type: "SET_VIEWING", stage: "material" });
    assert.equal(state.viewing, "assets");
  });

  it("取消全部勾选时，若正在资产页则退回讲话推荐页", () => {
    let state = selectedState();
    state = workspaceReducer(state, { type: "SET_VIEWING", stage: "assets" });
    assert.equal(state.viewing, "assets");
    state = workspaceReducer(state, { type: "TOGGLE_EVIDENCE", chunkId: "c1" });
    assert.equal(state.selectedChunkIds.length, 0);
    assert.equal(state.viewing, "speeches");
    assert.equal(canViewStage(state, "assets"), false);
  });

  it("不允许跳转到未解锁步骤", () => {
    const state = workspaceReducer(initialWorkspaceState, {
      type: "SET_VIEWING",
      stage: "material",
    });
    assert.equal(state.viewing, "input");
  });
});
