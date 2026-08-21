"use client";

import { useMemo, useReducer, useState } from "react";
import type {
  DiscourseAsset,
  GeneratedMaterial,
  SpeechRecommendation,
} from "../lib/schemas";
import {
  ApiError,
  assetEnterpriseText,
  assetsAreComplete,
  countAssets,
  generateAssets,
  generateMaterial,
  generateProfile,
  normalizeAssetsForSubmit,
  profileHasItems,
  profileItemCount,
  recommendSpeeches,
  sanitizeProfile,
  splitAssetText,
  updateAssetText,
} from "./api";
import {
  ASSET_DIMENSIONS,
  CONFIDENCE_LABEL,
  DEMO_CORPUS_NOTICE,
  ORIGIN_LABEL,
  PROFILE_DIMENSIONS,
  RELEVANCE_LABEL,
  SAMPLE_COMPANY_DESCRIPTION,
  SCENARIO_OPTIONS,
  STAGES,
} from "./labels";
import {
  canViewStage,
  furthestStage,
  getSelectedEvidenceRefs,
  initialWorkspaceState,
  workspaceReducer,
  type StageId,
  type WorkspaceState,
} from "./state";
import {
  Badge,
  Banner,
  Card,
  GhostButton,
  PrimaryButton,
  Spinner,
  StageHeader,
} from "./ui";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "未知错误";
}

export function Workspace() {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);

  const profileValueById = useMemo(() => {
    const map = new Map<string, string>();
    if (state.profile) {
      for (const dimension of PROFILE_DIMENSIONS) {
        for (const item of state.profile[dimension.key]) {
          map.set(item.id, item.value);
        }
      }
    }
    return map;
  }, [state.profile]);

  const recommendationByChunkId = useMemo(
    () => new Map(state.recommendations.map((item) => [item.chunkId, item])),
    [state.recommendations],
  );

  const hasDemoEvidence = useMemo(
    () => state.recommendations.some((item) => item.isDemoPlaceholder),
    [state.recommendations],
  );

  async function handleGenerateProfile() {
    const description = state.description.trim();
    if (!description) {
      dispatch({ type: "FAIL", message: "请先填写企业介绍。" });
      return;
    }
    dispatch({ type: "REQUEST", key: "profile" });
    try {
      const { profile } = await generateProfile(description);
      dispatch({ type: "PROFILE_GENERATED", profile });
    } catch (error) {
      dispatch({ type: "FAIL", message: errorMessage(error) });
    }
  }

  async function handleConfirmAndRecommend() {
    if (!state.profile) return;
    const clean = sanitizeProfile(state.profile);
    dispatch({ type: "CONFIRM_PROFILE", profile: clean });
    if (!profileHasItems(clean)) return;
    dispatch({ type: "REQUEST", key: "recommend" });
    try {
      const { recommendations } = await recommendSpeeches(clean);
      dispatch({ type: "RECOMMENDATIONS_LOADED", recommendations });
    } catch (error) {
      dispatch({ type: "FAIL", message: errorMessage(error) });
    }
  }

  async function handleGenerateAssets() {
    if (!state.profile || state.selectedChunkIds.length === 0) return;
    const selectedEvidenceRefs = getSelectedEvidenceRefs(state);
    const requestChunkIds = selectedEvidenceRefs.map((ref) => ref.chunkId);
    dispatch({ type: "REQUEST", key: "assets" });
    try {
      const { assets } = await generateAssets(state.profile, selectedEvidenceRefs);
      dispatch({ type: "ASSETS_LOADED", assets, requestChunkIds });
    } catch (error) {
      dispatch({ type: "FAIL", message: errorMessage(error) });
    }
  }

  function handleConfirmAssets() {
    if (!state.assets) return;
    dispatch({
      type: "CONFIRM_ASSETS",
      assets: normalizeAssetsForSubmit(state.assets),
    });
  }

  async function handleGenerateMaterial() {
    if (!state.profile || !state.assets || !state.assetsConfirmed || !state.scenario) {
      return;
    }
    const selectedEvidenceRefs = getSelectedEvidenceRefs(state);
    const requirements = state.additionalRequirements.trim();
    dispatch({ type: "REQUEST", key: "material" });
    try {
      const { material } = await generateMaterial({
        confirmedProfile: state.profile,
        selectedEvidenceRefs,
        confirmedAssets: state.assets,
        scenario: state.scenario,
        additionalRequirements: requirements.length > 0 ? requirements : undefined,
      });
      dispatch({ type: "MATERIAL_LOADED", material });
    } catch (error) {
      dispatch({ type: "FAIL", message: errorMessage(error) });
    }
  }

  return (
    <div className="min-h-screen">
      <div className="paper-grain" aria-hidden />
      <Header showDemoBadge={hasDemoEvidence} />
      <main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-[230px_minmax(0,1fr)] md:py-12">
        <StepRail state={state} onView={(stage) => dispatch({ type: "SET_VIEWING", stage })} />
        <section className="min-w-0">
          {state.viewing === "input" ? (
            <InputStage
              state={state}
              onChange={(value) => dispatch({ type: "SET_DESCRIPTION", value })}
              onGenerate={handleGenerateProfile}
              onClearError={() => dispatch({ type: "CLEAR_ERROR" })}
            />
          ) : null}
          {state.viewing === "profile" ? (
            <ProfileStage
              state={state}
              dispatch={dispatch}
              onConfirm={handleConfirmAndRecommend}
            />
          ) : null}
          {state.viewing === "speeches" ? (
            <SpeechesStage
              state={state}
              profileValueById={profileValueById}
              hasDemoEvidence={hasDemoEvidence}
              onToggle={(chunkId) => dispatch({ type: "TOGGLE_EVIDENCE", chunkId })}
              onRetry={handleConfirmAndRecommend}
              onBackToProfile={() => dispatch({ type: "SET_VIEWING", stage: "profile" })}
              onGenerateAssets={handleGenerateAssets}
              onClearError={() => dispatch({ type: "CLEAR_ERROR" })}
              onClearNotice={() => dispatch({ type: "CLEAR_NOTICE" })}
            />
          ) : null}
          {state.viewing === "assets" ? (
            <AssetsStage
              state={state}
              profileValueById={profileValueById}
              dispatch={dispatch}
              onBack={() => dispatch({ type: "SET_VIEWING", stage: "speeches" })}
              onRegenerate={handleGenerateAssets}
              onConfirm={handleConfirmAssets}
            />
          ) : null}
          {state.viewing === "material" ? (
            <MaterialStage
              state={state}
              recommendationByChunkId={recommendationByChunkId}
              dispatch={dispatch}
              onBack={() => dispatch({ type: "SET_VIEWING", stage: "assets" })}
              onGenerate={handleGenerateMaterial}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function Header({ showDemoBadge }: { showDemoBadge: boolean }) {
  return (
    <header className="border-b border-line/70 bg-paper-3/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h1 className="font-serif text-lg font-semibold tracking-tight text-ink">
            重要讲话智能匹配 · 政企沟通材料工作台
          </h1>
          <p className="text-xs text-ink-soft">
            企业画像 → 讲话证据 → 话语资产 → 场景材料（人工可控工作流）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">M1 本地演示</Badge>
          {showDemoBadge ? (
            <span title={DEMO_CORPUS_NOTICE}>
              <Badge tone="amber">演示语料 · 占位文本</Badge>
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function isStageDone(state: WorkspaceState, id: StageId): boolean {
  switch (id) {
    case "input":
      return state.profile !== null;
    case "profile":
      return state.profileConfirmed;
    case "speeches":
      return state.selectedChunkIds.length > 0;
    case "assets":
      return state.assetsConfirmed;
    case "material":
      return state.material !== null;
    default:
      return false;
  }
}

function StepRail({
  state,
  onView,
}: {
  state: WorkspaceState;
  onView: (stage: StageId) => void;
}) {
  const furthest = furthestStage(state);
  return (
    <aside>
      <ol className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-3 md:overflow-visible">
        {STAGES.map((stage, index) => {
          const id = stage.id as StageId;
          const locked = !canViewStage(state, id);
          const current = state.viewing === id;
          const done = !current && isStageDone(state, id);
          return (
            <li key={stage.id} className="min-w-[150px] md:min-w-0">
              <button
                type="button"
                disabled={locked}
                onClick={() => onView(id)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-300 ${
                  current
                    ? "border-seal/40 bg-paper-3 shadow-[0_14px_40px_-24px_rgba(156,43,26,0.5)]"
                    : locked
                      ? "cursor-not-allowed border-line/50 bg-paper-2/40 opacity-60"
                      : "border-line/70 bg-paper-3/60 hover:border-ink/25"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    done
                      ? "bg-moss text-paper-3"
                      : current
                        ? "bg-seal text-paper-3"
                        : "border border-line text-ink-soft"
                  }`}
                >
                  {done ? "✓" : index + 1}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                    {stage.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-soft">
                    {locked
                      ? id === "material"
                        ? "待资产确认"
                        : id === "assets"
                          ? "生成话语资产后解锁"
                          : `完成「${STAGES[index - 1]?.label ?? "上一步"}」后解锁`
                      : stage.gate
                        ? `人工闸门：${stage.gate}`
                        : id === "material"
                          ? "场景选择 + 生成"
                          : "自然语言输入"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 hidden text-[11px] leading-relaxed text-ink-soft md:block">
        当前进度：{STAGES.find((s) => s.id === furthest)?.label}
      </p>
    </aside>
  );
}

function InputStage({
  state,
  onChange,
  onGenerate,
  onClearError,
}: {
  state: WorkspaceState;
  onChange: (value: string) => void;
  onGenerate: () => void;
  onClearError: () => void;
}) {
  const loading = state.pending === "profile";
  return (
    <div className="space-y-6">
      <StageHeader
        eyebrow="Step 1 · 企业输入"
        title="用自然语言描述你的企业"
        description="不需要填写复杂表单。介绍企业的技术、产品、应用场景与价值方向即可；系统将在下一步形成结构化企业画像，由你修改并确认后，才进入讲话匹配。"
      />
      {state.error ? (
        <Banner tone="seal" title="操作未完成" onClose={onClearError}>
          {state.error}
        </Banner>
      ) : null}
      <Card className="p-5">
        <textarea
          value={state.description}
          onChange={(event) => onChange(event.target.value)}
          rows={6}
          placeholder="例如：我们是一家做工业具身智能的创业公司，主要面向汽车制造场景……"
          className="w-full resize-y rounded-xl border border-line bg-paper-3 p-4 text-[15px] leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-seal/50"
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <GhostButton
            onClick={() => onChange(SAMPLE_COMPANY_DESCRIPTION)}
            disabled={loading}
          >
            填入示例企业
          </GhostButton>
          <PrimaryButton onClick={onGenerate} loading={loading}>
            生成企业画像
          </PrimaryButton>
        </div>
      </Card>
      <p className="text-xs leading-relaxed text-ink-soft">
        流程说明：画像生成后需经你人工确认（闸门 1），系统才会基于确认后的画像检索讲话证据。
      </p>
    </div>
  );
}

function ProfileStage({
  state,
  dispatch,
  onConfirm,
}: {
  state: WorkspaceState;
  dispatch: React.Dispatch<import("./state").WorkspaceAction>;
  onConfirm: () => void;
}) {
  const profile = state.profile;
  if (!profile) return null;
  const loading = state.pending === "recommend";
  return (
    <div className="space-y-6">
      <StageHeader
        eyebrow="Step 2 · 企业画像"
        title="系统如何理解你的公司"
        description="以下为五维结构化画像。你可以修改、删除或补充任意条目；只有点击确认后，系统才会基于确认画像检索讲话证据。修改已确认画像将使下游推荐、勾选、资产与材料全部失效。"
      />
      {state.notice ? (
        <Banner tone="amber" title="下游已失效" onClose={() => dispatch({ type: "CLEAR_NOTICE" })}>
          {state.notice}
        </Banner>
      ) : null}
      {state.error ? (
        <Banner tone="seal" title="操作未完成" onClose={() => dispatch({ type: "CLEAR_ERROR" })}>
          {state.error}
        </Banner>
      ) : null}
      {loading ? (
        <Banner tone="neutral" title="正在检索讲话证据">
          正在执行向量检索与重排，可能需要数十秒，请稍候……
        </Banner>
      ) : null}
      <div className="space-y-4">
        {PROFILE_DIMENSIONS.map((dimension) => {
          const items = profile[dimension.key];
          return (
            <Card key={dimension.key} className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-base font-semibold text-ink">
                  {dimension.label}
                  <span className="ml-2 text-xs font-normal text-ink-soft">
                    {dimension.hint}
                  </span>
                </h3>
                <span className="text-xs text-ink-soft">{items.length} 条</span>
              </div>
              <div className="mt-4 space-y-3">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <textarea
                      value={item.value}
                      rows={2}
                      disabled={loading}
                      onChange={(event) =>
                        dispatch({
                          type: "UPDATE_PROFILE_ITEM",
                          dimension: dimension.key,
                          id: item.id,
                          value: event.target.value,
                        })
                      }
                      className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-paper-3 px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-seal/50 disabled:opacity-60"
                    />
                    <div className="flex w-28 shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={item.origin === "explicit" ? "moss" : "amber"}>
                        {ORIGIN_LABEL[item.origin]}
                      </Badge>
                      <span className="text-[11px] text-ink-soft">
                        {CONFIDENCE_LABEL[item.confidence]}
                      </span>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          dispatch({
                            type: "REMOVE_PROFILE_ITEM",
                            dimension: dimension.key,
                            id: item.id,
                          })
                        }
                        className="text-[11px] text-ink-soft underline-offset-2 transition-colors hover:text-seal hover:underline disabled:opacity-50"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
                {items.length === 0 ? (
                  <p className="text-xs text-ink-soft">该维度暂无条目。</p>
                ) : null}
              </div>
              <div className="mt-4">
                <GhostButton
                  disabled={loading}
                  onClick={() =>
                    dispatch({ type: "ADD_PROFILE_ITEM", dimension: dimension.key })
                  }
                >
                  + 添加条目
                </GhostButton>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-5">
        <GhostButton
          disabled={loading}
          onClick={() => dispatch({ type: "SET_VIEWING", stage: "input" })}
        >
          ← 返回企业描述
        </GhostButton>
        <PrimaryButton onClick={onConfirm} loading={loading}>
          {state.profileConfirmed ? "重新获取讲话推荐" : "确认画像并获取讲话推荐"}
        </PrimaryButton>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        闸门 1：确认画像。确认后系统仅基于该画像进行语义检索；「系统归纳」条目经你修改后会标记为「用户明确提供」。
      </p>
    </div>
  );
}

function relevanceTone(relevance: SpeechRecommendation["relevance"]) {
  switch (relevance) {
    case "strong":
      return "moss" as const;
    case "medium":
      return "neutral" as const;
    default:
      return "amber" as const;
  }
}

function SpeechCard({
  item,
  selected,
  disabled,
  profileValueById,
  onToggle,
}: {
  item: SpeechRecommendation;
  selected: boolean;
  disabled: boolean;
  profileValueById: Map<string, string>;
  onToggle: () => void;
}) {
  const matchedProfileValues = item.profileEvidenceIds
    .map((id) => profileValueById.get(id))
    .filter((value): value is string => Boolean(value));
  return (
    <Card
      className={`p-5 transition-all duration-300 ${
        selected ? "border-seal/50 ring-1 ring-seal/30" : ""
      }`}
    >
      <div className="flex items-start gap-4">
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
          aria-label={`选择证据 ${item.title}`}
          className="mt-1.5 h-4 w-4 shrink-0 accent-[#9c2b1a] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={relevanceTone(item.relevance)}>
              {RELEVANCE_LABEL[item.relevance]}
            </Badge>
            {item.isDemoPlaceholder ? (
              <Badge tone="amber">演示占位文本 · 非总书记原文</Badge>
            ) : null}
          </div>
          <blockquote className="mt-3 border-l-2 border-seal/60 pl-4 font-serif text-[15px] leading-relaxed text-ink">
            {item.quote}
          </blockquote>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            <span className="font-medium text-ink">推荐理由：</span>
            {item.reason}
          </p>
          {matchedProfileValues.length > 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              对应画像字段：{matchedProfileValues.join("；")}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
            <span className="font-medium text-ink">{item.title}</span>
            <span>{item.source}</span>
            <span>{item.date ?? "日期待考"}</span>
          </div>
          {item.keywords.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.keywords.map((keyword) => (
                <Badge key={keyword} tone="neutral">
                  {keyword}
                </Badge>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-ink-soft/70">
            EvidenceRef：{item.speechId} / {item.chunkId} [{item.evidenceRef.startIndex},{" "}
            {item.evidenceRef.endIndex})
          </p>
        </div>
      </div>
    </Card>
  );
}

function SpeechesStage({
  state,
  profileValueById,
  hasDemoEvidence,
  onToggle,
  onRetry,
  onBackToProfile,
  onGenerateAssets,
  onClearError,
  onClearNotice,
}: {
  state: WorkspaceState;
  profileValueById: Map<string, string>;
  hasDemoEvidence: boolean;
  onToggle: (chunkId: string) => void;
  onRetry: () => void;
  onBackToProfile: () => void;
  onGenerateAssets: () => void;
  onClearError: () => void;
  onClearNotice: () => void;
}) {
  const loading = state.pending === "recommend";
  const generatingAssets = state.pending === "assets";
  return (
    <div className="space-y-6">
      <StageHeader
        eyebrow="Step 3 · 讲话推荐"
        title="与企业方向相关的讲话证据"
        description="每条推荐包含原文片段、出处、时间、关键词与推荐理由。勾选即确认 Chunk 级 EvidenceRef，话语资产与材料生成将仅基于你勾选的证据。"
      />
      {hasDemoEvidence ? (
        <Banner tone="amber" title="演示语料提示">
          {DEMO_CORPUS_NOTICE}
        </Banner>
      ) : null}
      {state.notice ? (
        <Banner tone="amber" title="下游已失效" onClose={onClearNotice}>
          {state.notice}
        </Banner>
      ) : null}
      {state.error ? (
        <Banner tone="seal" title="操作未完成" onClose={onClearError}>
          {state.error}
        </Banner>
      ) : null}
      {loading ? (
        <Card className="p-10">
          <div className="flex flex-col items-center gap-3 text-ink-soft">
            <Spinner label="正在检索语料并重排讲话证据" />
            <p className="text-xs">向量检索 + DeepSeek Rerank，可能需要数十秒……</p>
          </div>
        </Card>
      ) : state.recommendations.length === 0 ? (
        <Card className="p-8">
          <p className="text-sm leading-relaxed text-ink-soft">
            暂无推荐结果。可以返回企业画像补充更具体的技术与产业信息，或重试推荐。
          </p>
          <div className="mt-4 flex gap-3">
            <GhostButton onClick={onBackToProfile}>← 返回企业画像</GhostButton>
            <PrimaryButton onClick={onRetry}>重试推荐</PrimaryButton>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {state.recommendations.map((item) => (
            <SpeechCard
              key={item.chunkId}
              item={item}
              selected={state.selectedChunkIds.includes(item.chunkId)}
              disabled={state.pending !== null}
              profileValueById={profileValueById}
              onToggle={() => onToggle(item.chunkId)}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-5">
        <div className="flex items-center gap-3">
          <GhostButton onClick={onBackToProfile} disabled={loading || generatingAssets}>
            ← 返回企业画像
          </GhostButton>
          <span className="text-sm text-ink-soft">
            已选 <span className="font-semibold text-ink">{state.selectedChunkIds.length}</span> 条讲话证据
          </span>
        </div>
        <PrimaryButton
          onClick={onGenerateAssets}
          loading={generatingAssets}
          disabled={state.selectedChunkIds.length === 0 || loading}
          title={
            state.selectedChunkIds.length === 0 ? "至少勾选 1 条讲话证据" : undefined
          }
        >
          生成话语资产
        </PrimaryButton>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        闸门 2：勾选证据。系统不会默认把全部推荐视为企业正式立场；勾选变化会使已生成的话语资产与场景材料失效。
      </p>
    </div>
  );
}

function AssetCard({
  asset,
  disabled,
  profileValueById,
  onChangeTitle,
  onChangeEnterprise,
  onRemove,
}: {
  asset: DiscourseAsset;
  disabled: boolean;
  profileValueById: Map<string, string>;
  onChangeTitle: (value: string) => void;
  onChangeEnterprise: (value: string) => void;
  onRemove: () => void;
}) {
  const { quoteSuffix } = splitAssetText(asset.text);
  const matchedProfileValues = asset.profileEvidenceIds
    .map((id) => profileValueById.get(id))
    .filter((value): value is string => Boolean(value));
  return (
    <div className="rounded-xl border border-line/70 bg-paper-3/70 p-4">
      <div className="flex items-start gap-3">
        <input
          value={asset.title}
          disabled={disabled}
          onChange={(event) => onChangeTitle(event.target.value)}
          aria-label="资产标题"
          className="min-w-0 flex-1 rounded-lg border border-line bg-paper-3 px-3 py-2 text-sm font-medium text-ink outline-none transition-colors focus:border-seal/50 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="shrink-0 pt-2 text-[11px] text-ink-soft underline-offset-2 transition-colors hover:text-seal hover:underline disabled:opacity-50"
        >
          删除
        </button>
      </div>
      <textarea
        value={assetEnterpriseText(asset)}
        rows={4}
        disabled={disabled}
        onChange={(event) => onChangeEnterprise(event.target.value)}
        aria-label="资产正文（企业表达）"
        className="mt-3 w-full resize-y rounded-lg border border-line bg-paper-3 px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-seal/50 disabled:opacity-60"
      />
      {quoteSuffix ? (
        <div className="mt-3">
          <Badge tone="seal">总书记原文 · 程序回填 · 只读</Badge>
          <blockquote className="mt-2 whitespace-pre-line rounded-lg border-l-2 border-seal/60 bg-paper-2/50 pl-4 pr-3 py-3 font-serif text-sm leading-relaxed text-ink">
            {quoteSuffix.trim()}
          </blockquote>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-soft">
        <span>证据：{asset.evidenceRefs.map((ref) => ref.chunkId).join("、") || "无"}</span>
        {matchedProfileValues.length > 0 ? (
          <span>对应画像：{matchedProfileValues.join("；")}</span>
        ) : null}
      </div>
    </div>
  );
}

function AssetsStage({
  state,
  profileValueById,
  dispatch,
  onBack,
  onRegenerate,
  onConfirm,
}: {
  state: WorkspaceState;
  profileValueById: Map<string, string>;
  dispatch: React.Dispatch<import("./state").WorkspaceAction>;
  onBack: () => void;
  onRegenerate: () => void;
  onConfirm: () => void;
}) {
  const assets = state.assets;
  const busy = state.pending !== null;
  if (!assets) {
    return (
      <div className="space-y-6">
        <StageHeader
          eyebrow="Step 4 · 企业话语资产"
          title="话语资产生成"
          description="基于已确认企业画像与已勾选讲话证据生成的可复用企业正式表达。"
        />
        <Card className="p-8">
          <p className="text-sm leading-relaxed text-ink-soft">
            当前没有已生成的话语资产。请返回讲话推荐页勾选证据后生成。
          </p>
          <div className="mt-4">
            <GhostButton onClick={onBack}>← 返回讲话推荐</GhostButton>
          </div>
        </Card>
      </div>
    );
  }
  const total = countAssets(assets);
  const complete = assetsAreComplete(assets);
  return (
    <div className="space-y-6">
      <StageHeader
        eyebrow="Step 4 · 企业话语资产"
        title="可复用的企业正式表达"
        description="以下表达仅基于已确认画像与你勾选的讲话证据生成，可在多种政企沟通材料中反复调用。你可以修改标题与正文、删除条目；「【引用】」区块为总书记原文，由程序按 EvidenceRef 回填，只读不可改。"
      />
      {state.notice ? (
        <Banner tone="amber" title="提示" onClose={() => dispatch({ type: "CLEAR_NOTICE" })}>
          {state.notice}
        </Banner>
      ) : null}
      {state.error ? (
        <Banner tone="seal" title="操作未完成" onClose={() => dispatch({ type: "CLEAR_ERROR" })}>
          {state.error}
        </Banner>
      ) : null}
      {!complete ? (
        <Banner tone="amber" title="暂不能确认">
          每条资产都需要非空的标题与正文，且至少保留一条资产；请补全或删除空条目。
        </Banner>
      ) : null}
      <div className="space-y-4">
        {ASSET_DIMENSIONS.map((dimension) => {
          const items = assets[dimension.key];
          return (
            <Card key={dimension.key} className="p-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-serif text-base font-semibold text-ink">
                  {dimension.label}
                </h3>
                <span className="text-xs text-ink-soft">{items.length} 条</span>
              </div>
              <div className="mt-4 space-y-4">
                {items.map((asset) => (
                  <AssetCard
                    key={asset.id}
                    asset={asset}
                    disabled={busy}
                    profileValueById={profileValueById}
                    onChangeTitle={(value) =>
                      dispatch({
                        type: "UPDATE_ASSET",
                        dimension: dimension.key,
                        id: asset.id,
                        patch: { title: value },
                      })
                    }
                    onChangeEnterprise={(value) =>
                      dispatch({
                        type: "UPDATE_ASSET",
                        dimension: dimension.key,
                        id: asset.id,
                        patch: { text: updateAssetText(asset, value).text },
                      })
                    }
                    onRemove={() =>
                      dispatch({
                        type: "REMOVE_ASSET",
                        dimension: dimension.key,
                        id: asset.id,
                      })
                    }
                  />
                ))}
                {items.length === 0 ? (
                  <p className="text-xs text-ink-soft">
                    该维度无资产生成（证据不足时系统不会强行凑数）。
                  </p>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-5">
        <GhostButton onClick={onBack} disabled={busy}>
          ← 返回调整讲话勾选
        </GhostButton>
        <div className="flex items-center gap-3">
          <GhostButton onClick={onRegenerate} disabled={busy}>
            重新生成
          </GhostButton>
          <PrimaryButton
            onClick={onConfirm}
            disabled={!complete || busy}
            title={complete ? undefined : "存在空标题或空正文的资产"}
          >
            确认话语资产{total > 0 ? `（${total} 条）` : ""}
          </PrimaryButton>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        闸门 3：确认话语资产。确认后才能进入场景材料生成；确认后再修改资产将使已生成的材料失效。
      </p>
    </div>
  );
}

function MaterialBody({ body }: { body: string }) {
  const paragraphs = body.split(/\n{2,}/).filter((part) => part.trim().length > 0);
  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph, index) =>
        paragraph.trimStart().startsWith("【引用】") ? (
          <blockquote
            key={index}
            className="whitespace-pre-line rounded-lg border-l-2 border-seal/60 bg-paper-2/50 py-3 pl-4 pr-3 font-serif text-[15px] leading-relaxed text-ink"
          >
            {paragraph.trim()}
          </blockquote>
        ) : (
          <p
            key={index}
            className="whitespace-pre-line text-[15px] leading-relaxed text-ink"
          >
            {paragraph.trim()}
          </p>
        ),
      )}
    </div>
  );
}

function MaterialView({
  material,
  recommendationByChunkId,
}: {
  material: GeneratedMaterial;
  recommendationByChunkId: Map<string, SpeechRecommendation>;
}) {
  const [copied, setCopied] = useState(false);
  const scenarioLabel =
    SCENARIO_OPTIONS.find((option) => option.key === material.scenario)?.label ??
    material.scenario;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${material.title}\n\n${material.body}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge tone="moss">{scenarioLabel}</Badge>
        <GhostButton onClick={handleCopy}>{copied ? "已复制 ✓" : "复制材料"}</GhostButton>
      </div>
      <h3 className="mt-4 font-serif text-xl font-semibold leading-snug text-ink">
        {material.title}
      </h3>
      <div className="mt-4 border-t border-line/60 pt-4">
        <MaterialBody body={material.body} />
      </div>
      <div className="mt-6 rounded-xl border border-line/70 bg-paper-2/40 p-4">
        <p className="text-xs font-medium text-ink">
          证据链：复用资产 {material.usedAssetIds.length} 条 · 引用讲话证据{" "}
          {material.usedEvidenceRefs.length} 条
        </p>
        <ul className="mt-2 space-y-1.5">
          {material.usedEvidenceRefs.map((ref) => {
            const recommendation = recommendationByChunkId.get(ref.chunkId);
            return (
              <li key={ref.chunkId} className="text-[11px] leading-relaxed text-ink-soft">
                {recommendation
                  ? `${recommendation.title} · ${recommendation.source} · ${recommendation.date ?? "日期待考"}`
                  : ref.chunkId}
                {recommendation?.isDemoPlaceholder ? "（演示占位文本）" : ""}
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

function MaterialStage({
  state,
  recommendationByChunkId,
  dispatch,
  onBack,
  onGenerate,
}: {
  state: WorkspaceState;
  recommendationByChunkId: Map<string, SpeechRecommendation>;
  dispatch: React.Dispatch<import("./state").WorkspaceAction>;
  onBack: () => void;
  onGenerate: () => void;
}) {
  const generating = state.pending === "material";
  if (!state.assetsConfirmed || !state.assets) return null;
  return (
    <div className="space-y-6">
      <StageHeader
        eyebrow="Step 5 · 场景化材料"
        title="为具体沟通场景生成完整材料"
        description="选择场景并补充本次具体情况（可选）。材料将继承已确认画像、已勾选证据与已确认话语资产，总书记原文由程序按 EvidenceRef 原样回填。"
      />
      {state.error ? (
        <Banner tone="seal" title="生成失败" onClose={() => dispatch({ type: "CLEAR_ERROR" })}>
          {state.error}
        </Banner>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {SCENARIO_OPTIONS.map((scenario) => {
          const active = state.scenario === scenario.key;
          return (
            <button
              key={scenario.key}
              type="button"
              disabled={generating}
              onClick={() => dispatch({ type: "SET_SCENARIO", scenario: scenario.key })}
              className={`rounded-2xl border p-5 text-left transition-all duration-300 disabled:opacity-60 ${
                active
                  ? "border-seal/50 bg-paper-3 ring-1 ring-seal/30"
                  : "border-line/70 bg-paper-3/60 hover:border-ink/25"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-serif text-base font-semibold text-ink">
                  {scenario.label}
                </span>
                {active ? <Badge tone="seal">已选择</Badge> : null}
              </span>
              <span className="mt-1 block text-xs font-medium text-ink">
                {scenario.output}
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-ink-soft">
                {scenario.hint}
              </span>
            </button>
          );
        })}
      </div>
      <Card className="p-5">
        <label className="block text-xs font-medium text-ink" htmlFor="requirements">
          补充本次沟通的具体情况（可选）
        </label>
        <textarea
          id="requirements"
          value={state.additionalRequirements}
          rows={3}
          disabled={generating}
          onChange={(event) =>
            dispatch({ type: "SET_REQUIREMENTS", value: event.target.value })
          }
          placeholder="例如：下周参加区里的人工智能企业座谈会，作为创始人做 3 分钟左右的企业介绍……"
          className="mt-2 w-full resize-y rounded-xl border border-line bg-paper-3 p-4 text-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-ink-soft/50 focus:border-seal/50 disabled:opacity-60"
        />
      </Card>
      {generating ? (
        <Card className="p-10">
          <div className="flex flex-col items-center gap-3 text-ink-soft">
            <Spinner label="正在生成场景材料" />
            <p className="text-xs">基于已确认话语资产组织成文，可能需要数十秒……</p>
          </div>
        </Card>
      ) : state.material ? (
        <MaterialView
          material={state.material}
          recommendationByChunkId={recommendationByChunkId}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-5">
        <GhostButton onClick={onBack} disabled={generating}>
          ← 返回话语资产
        </GhostButton>
        <PrimaryButton
          onClick={onGenerate}
          loading={generating}
          disabled={!state.scenario}
          title={state.scenario ? undefined : "请先选择场景"}
        >
          {state.material ? "重新生成材料" : "生成场景材料"}
        </PrimaryButton>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        更换场景或修改补充要求会使当前材料失效；材料中的总书记原文与出处均可按
        EvidenceRef 追溯。
      </p>
    </div>
  );
}
