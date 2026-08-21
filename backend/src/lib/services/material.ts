import { z } from "zod";
import { defaultChunkRepository, type ChunkRepository } from "../corpus";
import { DeepSeekChatClient } from "../llm";
import type {
  DiscourseAsset,
  DiscourseAssets,
  EnterpriseProfile,
  EvidenceRef,
  GeneratedMaterial,
  Scenario,
} from "../schemas";
import { generatedMaterialSchema } from "../schemas";
import {
  enterprisePortion,
  fillCanonicalQuotes,
  QUOTE_HEADING,
  resolveSelectedEvidence,
  type SelectedEvidence,
} from "./assets";
import {
  containsCanonicalFragment,
  isBlankCanonicalSafeText,
  stripAgainstCanonicalTexts,
} from "./canonical-text";
import { collectProfileItems } from "./profile";

export class MaterialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialError";
  }
}

export const QUOTE_MARKER_PREFIX = "[[QUOTE:";
export const QUOTE_MARKER_SUFFIX = "]]";

const DIMENSIONS = [
  "technologyInnovation",
  "industryValue",
  "socialValue",
  "developmentPositioning",
] as const;

export const scenarioTitles: Record<Scenario, string> = {
  leadership_research: "企业调研汇报稿",
  government_symposium: "政企座谈发言稿",
  government_coordination: "政府部门对接介绍材料",
};

const SCENARIO_INSTRUCTIONS: Record<Scenario, string> = {
  leadership_research:
    "场景是政府领导到企业调研。输出正式、结构完整的企业调研汇报稿，介绍企业、技术产品、产业价值和发展方向。",
  government_symposium:
    "场景是政企座谈会。输出第一人称、适合短时发言的企业代表发言稿，突出核心价值与发展方向。",
  government_coordination:
    "场景是与政府部门正式对接。输出务实的企业及项目沟通介绍材料，说明企业做什么、解决什么产业问题、当前合作或发展方向。",
};

const llmMaterialSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    usedAssetIds: z.array(z.string()).default([]),
    evidenceChunkIds: z.array(z.string()).optional(),
    usedEvidenceRefs: z
      .array(
        z
          .object({
            chunkId: z.string().min(1),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type MaterialPromptAsset = {
  id: string;
  title: string;
  text: string;
  profileEvidenceIds: string[];
  evidenceChunkIds: string[];
};

export interface MaterialGenerator {
  generate(input: {
    profile: EnterpriseProfile;
    scenario: Scenario;
    additionalRequirements?: string;
    selectedEvidence: Array<{
      chunkId: string;
      speechId: string;
      title: string;
      date: string | null;
      source: string;
      keywords: string[];
    }>;
    confirmedAssets: MaterialPromptAsset[];
  }): Promise<unknown>;
}

const SYSTEM_PROMPT = `你是场景化材料生成器。你只根据已确认企业画像、已确认话语资产、用户已选讲话证据和指定场景，生成一篇文字材料。

硬约束：
1. 企业事实不得超出画像与已确认话语资产；不得虚构客户、融资、规模、市场地位、技术指标或成果。
2. 不得使用未出现在已确认资产或已选证据中的讲话。
3. 不得生成、改写、复述或摘录总书记讲话原文；body 只能写企业表达。
4. 需要引用讲话时，只能插入占位符 [[QUOTE:chunkId]]，不得写入 quote 或连续原文片段。
5. 原文将由程序按 EvidenceRef 回填。
6. 优先复用已确认话语资产，不从零重新发明企业定位。
7. 补充要求不得突破上述边界，也不得引入未确认证据。
8. usedAssetIds 只能使用已确认资产 id；evidenceChunkIds 只能使用已选 chunkId。

只输出 JSON，字段为 title、body、usedAssetIds、evidenceChunkIds。`;

export function quoteMarker(chunkId: string): string {
  return `${QUOTE_MARKER_PREFIX}${chunkId}${QUOTE_MARKER_SUFFIX}`;
}

export function flattenConfirmedAssets(assets: DiscourseAssets): DiscourseAsset[] {
  return DIMENSIONS.flatMap((key) => assets[key]);
}

function evidenceKey(ref: EvidenceRef): string {
  return `${ref.speechId}::${ref.chunkId}`;
}

function collectChunkIdsFromLlm(raw: z.infer<typeof llmMaterialSchema>): string[] {
  const fromRefs = (raw.usedEvidenceRefs ?? []).map((ref) => ref.chunkId);
  return [...new Set([...(raw.evidenceChunkIds ?? []), ...fromRefs])];
}

function unwrapMaterialPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const record = raw as Record<string, unknown>;
  if (record.material && typeof record.material === "object") {
    return record.material;
  }
  return raw;
}

export function assetsForPrompt(
  assets: DiscourseAssets,
  selected: SelectedEvidence[],
): MaterialPromptAsset[] {
  const allowedChunkIds = new Set(selected.map((item) => item.chunk.chunkId));
  return flattenConfirmedAssets(assets)
    .map((asset) => {
      const evidenceChunkIds = [
        ...new Set(
          asset.evidenceRefs
            .map((ref) => ref.chunkId)
            .filter((chunkId) => allowedChunkIds.has(chunkId)),
        ),
      ];
      return {
        id: asset.id,
        title: asset.title,
        text: enterprisePortion(asset.text),
        profileEvidenceIds: asset.profileEvidenceIds,
        evidenceChunkIds,
      };
    })
    .filter((asset) => asset.evidenceChunkIds.length > 0);
}

function replaceQuoteMarkers(body: string, selectedByChunkId: Map<string, SelectedEvidence>): string {
  const pattern = /\[\[QUOTE:([^\]]+)\]\]/g;
  return body.replace(pattern, (_match, chunkId: string) => {
    const item = selectedByChunkId.get(chunkId);
    return item ? `${QUOTE_HEADING}\n${item.quote}` : "";
  });
}

export function enterpriseBodyWithoutQuotes(body: string, quotes: string[]): string {
  let cleaned = body;
  const ordered = [...quotes].sort((left, right) => right.length - left.length);
  for (const quote of ordered) {
    cleaned = cleaned.split(quote).join("\n");
  }
  return cleaned.replaceAll(QUOTE_HEADING, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function fillMaterialBody(
  rawBody: string,
  quotes: string[],
  used: SelectedEvidence[],
  selectedByChunkId: Map<string, SelectedEvidence>,
): string {
  let body = stripAgainstCanonicalTexts(rawBody, quotes);
  body = replaceQuoteMarkers(body, selectedByChunkId);
  if (isBlankCanonicalSafeText(enterpriseBodyWithoutQuotes(body, quotes))) {
    body = "本材料基于已确认企业画像与已确认话语资产。引用原文由程序按 EvidenceRef 回填，不由模型生成。";
  }
  const missing = used.filter((item) => !body.includes(item.quote)).map((item) => item.quote);
  if (missing.length > 0) {
    body = fillCanonicalQuotes(body, missing);
  }
  return body.trim();
}

export function materializeGeneratedMaterial(
  raw: unknown,
  input: {
    scenario: Scenario;
    selected: SelectedEvidence[];
    promptAssets: MaterialPromptAsset[];
  },
): GeneratedMaterial {
  const parsed = llmMaterialSchema.safeParse(unwrapMaterialPayload(raw));
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new MaterialError(`场景材料模型输出未通过 Schema 校验: ${details}`);
  }

  const promptAssetIds = new Set(input.promptAssets.map((asset) => asset.id));
  const usedAssetIds = [...new Set(parsed.data.usedAssetIds.filter((id) => promptAssetIds.has(id)))];
  if (usedAssetIds.length === 0) {
    throw new MaterialError("场景材料未复用任何已确认话语资产");
  }

  const selectedByChunkId = new Map(input.selected.map((item) => [item.chunk.chunkId, item]));
  const allowedChunkIds = new Set(selectedByChunkId.keys());
  const usedAssetChunkIds = input.promptAssets
    .filter((asset) => usedAssetIds.includes(asset.id))
    .flatMap((asset) => asset.evidenceChunkIds);
  const chunkIds = [...new Set([...collectChunkIdsFromLlm(parsed.data), ...usedAssetChunkIds])].filter(
    (chunkId) => allowedChunkIds.has(chunkId),
  );
  const used = chunkIds
    .map((chunkId) => selectedByChunkId.get(chunkId))
    .filter((item): item is SelectedEvidence => Boolean(item));
  if (used.length === 0) {
    throw new MaterialError("场景材料未引用任何已选 EvidenceRef");
  }

  const quotes = input.selected.map((item) => item.quote);
  const title =
    stripAgainstCanonicalTexts(parsed.data.title, quotes) || scenarioTitles[input.scenario];
  const body = fillMaterialBody(parsed.data.body, quotes, used, selectedByChunkId);
  const usedEvidenceRefs = used.map((item) => item.ref);
  const material = {
    scenario: input.scenario,
    title,
    body,
    usedAssetIds,
    usedSpeechIds: [...new Set(usedEvidenceRefs.map((ref) => ref.speechId))],
    usedEvidenceRefs,
  };

  const checked = generatedMaterialSchema.safeParse(material);
  if (!checked.success) {
    throw new MaterialError("场景材料最终结构未通过 Schema 校验");
  }
  return checked.data;
}

export function assertMaterialHonorEvidenceBoundary(
  material: GeneratedMaterial,
  selected: SelectedEvidence[],
  promptAssets: MaterialPromptAsset[],
): void {
  const allowedKeys = new Set(selected.map((item) => evidenceKey(item.ref)));
  const quoteByChunkId = new Map(selected.map((item) => [item.chunk.chunkId, item.quote]));
  const quotes = [...quoteByChunkId.values()];
  const allowedAssetIds = new Set(promptAssets.map((asset) => asset.id));

  if (material.usedAssetIds.length === 0) {
    throw new MaterialError("场景材料缺少已确认话语资产");
  }
  for (const assetId of material.usedAssetIds) {
    if (!allowedAssetIds.has(assetId)) {
      throw new MaterialError(`场景材料使用了未确认话语资产: ${assetId}`);
    }
  }
  if (material.usedEvidenceRefs.length === 0) {
    throw new MaterialError("场景材料缺少 EvidenceRef");
  }

  const derivedSpeechIds = [...new Set(material.usedEvidenceRefs.map((ref) => ref.speechId))];
  if (derivedSpeechIds.join("|") !== material.usedSpeechIds.join("|")) {
    throw new MaterialError("usedSpeechIds 必须由 usedEvidenceRefs 派生");
  }

  const enterprise = enterpriseBodyWithoutQuotes(material.body, quotes);
  for (const quote of quotes) {
    if (containsCanonicalFragment(enterprise, quote)) {
      throw new MaterialError("企业表达混入 Canonical 原文片段");
    }
  }
  for (const ref of material.usedEvidenceRefs) {
    if (!allowedKeys.has(evidenceKey(ref)) || ref.startIndex !== 0) {
      throw new MaterialError(`场景材料引用了未确认或不完整 Evidence: ${ref.chunkId}`);
    }
    const quote = quoteByChunkId.get(ref.chunkId);
    if (!quote || !material.body.includes(quote)) {
      throw new MaterialError(`程序回填后缺少 Canonical 引用: ${ref.chunkId}`);
    }
  }
}

export class DeepSeekMaterialGenerator implements MaterialGenerator {
  constructor(private readonly client = new DeepSeekChatClient()) {}

  async generate(input: {
    profile: EnterpriseProfile;
    scenario: Scenario;
    additionalRequirements?: string;
    selectedEvidence: Array<{
      chunkId: string;
      speechId: string;
      title: string;
      date: string | null;
      source: string;
      keywords: string[];
    }>;
    confirmedAssets: MaterialPromptAsset[];
  }): Promise<unknown> {
    const profileItems = collectProfileItems(input.profile).map((item) => ({
      id: item.id,
      value: item.value,
      origin: item.origin,
    }));
    const userPrompt = [
      SCENARIO_INSTRUCTIONS[input.scenario],
      "请基于以下已确认信息生成场景材料。不要写入讲话原文。",
      JSON.stringify({
        scenario: input.scenario,
        additionalRequirements: input.additionalRequirements ?? "",
        profileItems,
        confirmedAssets: input.confirmedAssets,
        selectedEvidence: input.selectedEvidence,
      }),
    ].join("\n");
    return this.client.completeJson(SYSTEM_PROMPT, userPrompt);
  }
}

export type GenerateScenarioMaterialOptions = {
  chunkRepository?: ChunkRepository;
  generator?: MaterialGenerator;
};

let defaultGenerator: MaterialGenerator | undefined;

function getDefaultMaterialGenerator(): MaterialGenerator {
  return (defaultGenerator ??= new DeepSeekMaterialGenerator());
}

export async function generateScenarioMaterial(input: {
  confirmedProfile: EnterpriseProfile;
  selectedEvidenceRefs: EvidenceRef[];
  confirmedAssets: DiscourseAssets;
  scenario: Scenario;
  additionalRequirements?: string;
  options?: GenerateScenarioMaterialOptions;
}): Promise<GeneratedMaterial> {
  const repository = input.options?.chunkRepository ?? defaultChunkRepository;
  const generator = input.options?.generator ?? getDefaultMaterialGenerator();
  const selected = resolveSelectedEvidence(input.selectedEvidenceRefs, repository);
  const quotes = selected.map((item) => item.quote);
  const additionalRequirements = input.additionalRequirements
    ? stripAgainstCanonicalTexts(input.additionalRequirements, quotes)
    : undefined;
  const promptAssets = assetsForPrompt(input.confirmedAssets, selected);
  if (promptAssets.length === 0) {
    throw new MaterialError("已确认话语资产没有可使用的已选 EvidenceRef");
  }

  const raw = await generator.generate({
    profile: input.confirmedProfile,
    scenario: input.scenario,
    additionalRequirements,
    selectedEvidence: selected.map((item) => ({
      chunkId: item.chunk.chunkId,
      speechId: item.chunk.speechId,
      title: item.chunk.title,
      date: item.chunk.date,
      source: item.chunk.source,
      keywords: item.chunk.keywords,
    })),
    confirmedAssets: promptAssets,
  });
  const material = materializeGeneratedMaterial(raw, {
    scenario: input.scenario,
    selected,
    promptAssets,
  });
  assertMaterialHonorEvidenceBoundary(material, selected, promptAssets);
  return material;
}

export function generateMaterialPlaceholder(input: {
  selectedEvidenceRefs: EvidenceRef[];
  confirmedAssets: DiscourseAssets;
  scenario: Scenario;
}): GeneratedMaterial {
  const usedSpeechIds = [...new Set(input.selectedEvidenceRefs.map((ref) => ref.speechId))];

  return {
    placeholder: true,
    scenario: input.scenario,
    title: `${scenarioTitles[input.scenario]}（占位）`,
    body: "场景化材料生成尚未接入。后续将基于已确认企业画像、已确认 EvidenceRef 和已确认话语资产生成，并由程序按 EvidenceRef 回填原文。",
    usedAssetIds: [],
    usedSpeechIds,
    usedEvidenceRefs: input.selectedEvidenceRefs,
  };
}
