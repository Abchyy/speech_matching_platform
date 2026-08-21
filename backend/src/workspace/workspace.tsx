"use client";

import { useMemo, useReducer } from "react";
import type { SpeechRecommendation } from "../lib/schemas";
import {
  ApiError,
  generateProfile,
  profileHasItems,
  profileItemCount,
  recommendSpeeches,
  sanitizeProfile,
} from "./api";
import {
  ASSET_DIMENSION_LABELS,
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

  const selectedRecommendations = useMemo(
    () =>
      state.recommendations.filter((item) =>
        state.selectedChunkIds.includes(item.chunkId),
      ),
    [state.recommendations, state.selectedChunkIds],
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

  return (
    <div className="min-h-screen">
      <div className="paper-grain" aria-hidden />
      <Header />
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
              onToggle={(chunkId) => dispatch({ type: "TOGGLE_EVIDENCE", chunkId })}
              onRetry={handleConfirmAndRecommend}
              onBackToProfile={() => dispatch({ type: "SET_VIEWING", stage: "profile" })}
              onNext={() => dispatch({ type: "SET_VIEWING", stage: "assets" })}
              onClearError={() => dispatch({ type: "CLEAR_ERROR" })}
            />
          ) : null}
          {state.viewing === "assets" ? (
            <AssetsStage
              state={state}
              selected={selectedRecommendations}
              onBack={() => dispatch({ type: "SET_VIEWING", stage: "speeches" })}
            />
          ) : null}
          {state.viewing === "material" ? (
            <MaterialStage
              onBack={() => dispatch({ type: "SET_VIEWING", stage: "assets" })}
            />
          ) : null}
        </section>
      </main>
    </div>
  );
}

function Header() {
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
          <span title={DEMO_CORPUS_NOTICE}>
            <Badge tone="amber">演示语料 · 占位文本</Badge>
          </span>
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
          const pendingBackend = id === "assets" || id === "material";
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
                    {pendingBackend ? <Badge tone="neutral">待接入</Badge> : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-soft">
                    {locked
                      ? id === "material"
                        ? "待资产确认（闸门 3 待接口接入）"
                        : `完成「${STAGES[index - 1]?.label ?? "上一步"}」后解锁`
                      : stage.gate
                        ? `人工闸门：${stage.gate}`
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
        description="以下为五维结构化画像。你可以修改、删除或补充任意条目；只有点击确认后，系统才会基于确认画像检索讲话证据。修改已确认画像将使下游推荐与勾选失效。"
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
  profileValueById,
  onToggle,
}: {
  item: SpeechRecommendation;
  selected: boolean;
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
          onChange={onToggle}
          aria-label={`选择证据 ${item.title}`}
          className="mt-1.5 h-4 w-4 shrink-0 accent-[#9c2b1a]"
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
  onToggle,
  onRetry,
  onBackToProfile,
  onNext,
  onClearError,
}: {
  state: WorkspaceState;
  profileValueById: Map<string, string>;
  onToggle: (chunkId: string) => void;
  onRetry: () => void;
  onBackToProfile: () => void;
  onNext: () => void;
  onClearError: () => void;
}) {
  const loading = state.pending === "recommend";
  return (
    <div className="space-y-6">
      <StageHeader
        eyebrow="Step 3 · 讲话推荐"
        title="与企业方向相关的讲话证据"
        description="每条推荐包含原文片段、出处、时间、关键词与推荐理由。勾选即确认 Chunk 级 EvidenceRef，后续话语资产与材料生成将仅基于你勾选的证据。"
      />
      <Banner tone="amber" title="演示语料提示">
        {DEMO_CORPUS_NOTICE}
      </Banner>
      {state.error ? (
        <Banner tone="seal" title="推荐失败" onClose={onClearError}>
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
              profileValueById={profileValueById}
              onToggle={() => onToggle(item.chunkId)}
            />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-5">
        <div className="flex items-center gap-3">
          <GhostButton onClick={onBackToProfile} disabled={loading}>
            ← 返回企业画像
          </GhostButton>
          <span className="text-sm text-ink-soft">
            已选 <span className="font-semibold text-ink">{state.selectedChunkIds.length}</span> 条讲话证据
          </span>
        </div>
        <PrimaryButton
          onClick={onNext}
          disabled={state.selectedChunkIds.length === 0 || loading}
          title={
            state.selectedChunkIds.length === 0 ? "至少勾选 1 条讲话证据" : undefined
          }
        >
          查看话语资产阶段 →
        </PrimaryButton>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        闸门 2：勾选证据。系统不会默认把全部推荐视为企业正式立场；你可以随时取消并重新选择。
      </p>
    </div>
  );
}

function AssetsStage({
  state,
  selected,
  onBack,
}: {
  state: WorkspaceState;
  selected: SpeechRecommendation[];
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <StageHeader
        eyebrow="Step 4 · 企业话语资产"
        title="话语资产生成"
        description="本步骤将基于已确认企业画像与已勾选讲话证据，生成可复用的企业正式表达。"
      />
      <Banner tone="amber" title="后端生成接口待接入">
        按已冻结工作流，这里将生成四维话语资产（
        {ASSET_DIMENSION_LABELS.join(" / ")}
        ），总书记原文由程序按 EvidenceRef 从 Canonical Chunk 回填。当前接口尚未接入，本页不生成、不手写、不伪造任何资产内容。
      </Banner>
      <Card className="p-5">
        <h3 className="font-serif text-base font-semibold text-ink">已确认的上游输入</h3>
        <p className="mt-2 text-sm text-ink-soft">
          企业画像：共 {state.profile ? profileItemCount(state.profile) : 0} 条（已确认）
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          讲话证据：共 {selected.length} 条（已勾选，Chunk 级 EvidenceRef）
        </p>
        <ul className="mt-4 space-y-3">
          {selected.map((item) => (
            <li
              key={item.chunkId}
              className="rounded-xl border border-line/70 bg-paper-3/70 p-4"
            >
              <blockquote className="border-l-2 border-seal/60 pl-3 font-serif text-sm leading-relaxed text-ink">
                {item.quote}
              </blockquote>
              <p className="mt-2 text-xs text-ink-soft">
                {item.title} · {item.source} · {item.date ?? "日期待考"}
                {item.isDemoPlaceholder ? " · 演示占位文本" : ""}
              </p>
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-5">
        <GhostButton onClick={onBack}>← 返回调整讲话勾选</GhostButton>
        <PrimaryButton disabled title="话语资产生成接口接入后开放">
          确认话语资产（待接口接入）
        </PrimaryButton>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        闸门 3：确认话语资产。该人工确认节点保留但暂不可用；接口接入并完成确认前，不会进入材料生成。
      </p>
    </div>
  );
}

function MaterialStage({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-6">
      <StageHeader
        eyebrow="Step 5 · 场景化材料"
        title="场景化材料生成"
        description="本步骤将在话语资产确认后，结合具体沟通场景生成完整文字材料。"
      />
      <Banner tone="amber" title="后端生成接口待接入">
        材料生成将以「已确认画像 + 已勾选证据 + 已确认话语资产 + 场景」为输入，直接引用由程序按
        EvidenceRef 原样回填。当前接口尚未接入，本页不生成任何材料。
      </Banner>
      <div className="grid gap-4 md:grid-cols-3">
        {SCENARIO_OPTIONS.map((scenario) => (
          <Card key={scenario.key} className="p-5 opacity-70">
            <h3 className="font-serif text-base font-semibold text-ink">{scenario.label}</h3>
            <p className="mt-1 text-xs font-medium text-ink">{scenario.output}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">{scenario.hint}</p>
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <textarea
          disabled
          rows={3}
          placeholder="补充本次沟通的具体情况（待接口接入后开放）"
          className="w-full resize-y rounded-xl border border-line bg-paper-2/50 p-4 text-sm text-ink-soft outline-none"
        />
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-5">
        <GhostButton onClick={onBack}>← 返回话语资产阶段</GhostButton>
        <PrimaryButton disabled title="需先完成话语资产确认（待接口接入）">
          生成场景材料（待接口接入）
        </PrimaryButton>
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        前置条件：完成闸门 3（话语资产确认）。当前该闸门待后端接口接入，因此材料生成保持锁定。
      </p>
    </div>
  );
}
