import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  DiscourseAssets,
  EnterpriseProfile,
  GeneratedMaterial,
  SpeechRecommendation,
} from "../lib/schemas";
import {
  canViewStage,
  furthestStage,
  getSelectedEvidenceRefs,
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

function makeAssets(): DiscourseAssets {
  const quote = "演示占位文本 c1";
  return {
    technologyInnovation: [
      {
        id: "technologyInnovation_1",
        title: "技术创新表达",
        text: `企业表达正文\n\n【引用】\n${quote}`,
        profileEvidenceIds: ["tech_1"],
        evidenceRefs: [
          { speechId: "speech_c1", chunkId: "c1", startIndex: 0, endIndex: quote.length },
        ],
      },
    ],
    industryValue: [],
    socialValue: [],
    developmentPositioning: [],
  };
}

function emptyAssets(): DiscourseAssets {
  return {
    technologyInnovation: [],
    industryValue: [],
    socialValue: [],
    developmentPositioning: [],
  };
}

function makeMaterial(): GeneratedMaterial {
  return {
    scenario: "government_symposium",
    title: "演示材料",
    body: "正文",
    usedAssetIds: ["technologyInnovation_1"],
    usedSpeechIds: ["speech_c1"],
    usedEvidenceRefs: [
      { speechId: "speech_c1", chunkId: "c1", startIndex: 0, endIndex: 12 },
    ],
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

function assetsState(): WorkspaceState {
  return workspaceReducer(selectedState(), {
    type: "ASSETS_LOADED",
    assets: makeAssets(),
  });
}

function confirmedAssetsState(): WorkspaceState {
  return workspaceReducer(assetsState(), {
    type: "CONFIRM_ASSETS",
    assets: makeAssets(),
  });
}

function materialState(): WorkspaceState {
  let state = confirmedAssetsState();
  state = workspaceReducer(state, {
    type: "SET_SCENARIO",
    scenario: "government_symposium",
  });
  return workspaceReducer(state, {
    type: "MATERIAL_LOADED",
    material: makeMaterial(),
  });
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

  it("勾选证据后先回到讲话页生成资产，资产页在生成前不解锁", () => {
    const state = selectedState();
    assert.equal(furthestStage(state), "speeches");
    assert.equal(canViewStage(state, "assets"), false);
    assert.equal(canViewStage(state, "material"), false);
    assert.deepEqual(
      getSelectedEvidenceRefs(state).map((ref) => ref.chunkId),
      ["c1"],
    );
  });

  it("资产生成后解锁 Step 4；未确认资产不能进入 Step 5", () => {
    let state = assetsState();
    assert.equal(furthestStage(state), "assets");
    assert.equal(canViewStage(state, "assets"), true);
    assert.equal(canViewStage(state, "material"), false);
    state = workspaceReducer(state, { type: "SET_VIEWING", stage: "material" });
    assert.equal(state.viewing, "assets");
  });

  it("确认资产后解锁 Step 5 并自动进入", () => {
    const state = confirmedAssetsState();
    assert.equal(state.assetsConfirmed, true);
    assert.equal(canViewStage(state, "material"), true);
    assert.equal(state.viewing, "material");
  });

  it("空话语资产不允许确认", () => {
    let state = workspaceReducer(selectedState(), {
      type: "ASSETS_LOADED",
      assets: emptyAssets(),
    });
    state = workspaceReducer(state, {
      type: "CONFIRM_ASSETS",
      assets: emptyAssets(),
    });
    assert.equal(state.assetsConfirmed, false);
    assert.ok(state.error?.includes("话语资产为空"));
  });

  it("修改画像：推荐、勾选、资产、材料全部失效", () => {
    let state = materialState();
    state = workspaceReducer(state, {
      type: "UPDATE_PROFILE_ITEM",
      dimension: "companyPositioning",
      id: "pos_1",
      value: "修改后的定位",
    });
    assert.equal(state.profileConfirmed, false);
    assert.equal(state.recommendations.length, 0);
    assert.equal(state.selectedChunkIds.length, 0);
    assert.equal(state.assets, null);
    assert.equal(state.assetsConfirmed, false);
    assert.equal(state.material, null);
    assert.equal(state.viewing, "profile");
    assert.ok(state.notice?.includes("已失效"));
  });

  it("修改勾选：资产与材料失效", () => {
    let state = confirmedAssetsState();
    state = workspaceReducer(state, { type: "SET_VIEWING", stage: "speeches" });
    state = workspaceReducer(state, { type: "TOGGLE_EVIDENCE", chunkId: "c2" });
    assert.equal(state.selectedChunkIds.length, 2);
    assert.equal(state.assets, null);
    assert.equal(state.assetsConfirmed, false);
    assert.equal(state.material, null);
    assert.ok(state.notice?.includes("话语资产"));
  });

  it("修改资产：材料失效且资产回到未确认", () => {
    let state = materialState();
    state = workspaceReducer(state, {
      type: "UPDATE_ASSET",
      dimension: "technologyInnovation",
      id: "technologyInnovation_1",
      patch: { title: "修改后的标题" },
    });
    assert.equal(state.material, null);
    assert.equal(state.assetsConfirmed, false);
  });

  it("修改场景或补充要求：材料失效", () => {
    let state = materialState();
    state = workspaceReducer(state, { type: "SET_REQUIREMENTS", value: "3 分钟发言" });
    assert.equal(state.material, null);

    state = workspaceReducer(materialState(), {
      type: "SET_SCENARIO",
      scenario: "leadership_research",
    });
    assert.equal(state.material, null);
  });

  it("取消全部勾选时，若正在资产页则退回讲话推荐页", () => {
    let state = assetsState();
    state = workspaceReducer(state, { type: "SET_VIEWING", stage: "assets" });
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
