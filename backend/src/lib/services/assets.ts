import { z } from "zod";
import { defaultChunkRepository, type ChunkRepository } from "../corpus";
import { DeepSeekChatClient } from "../llm";
import type {
  DiscourseAsset,
  DiscourseAssets,
  EnterpriseProfile,
  EvidenceRef,
  SpeechChunk,
} from "../schemas";
import { discourseAssetSchema, discourseAssetsSchema } from "../schemas";
import {
  containsCanonicalFragment,
  isBlankCanonicalSafeText,
  stripAgainstCanonicalTexts,
} from "./canonical-text";
import { EvidenceError, resolveQuoteFromEvidenceRef, toFullChunkEvidenceRef } from "./evidence";
import { collectProfileItems } from "./profile";

export class AssetsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetsError";
  }
}

export const QUOTE_HEADING = "【引用】";
export const MAX_ASSETS_PER_DIMENSION = 2;
const FALLBACK_ENTERPRISE_TEXT =
  "该表达基于已确认企业画像与已选讲话证据。引用原文由程序按 EvidenceRef 回填，不由模型生成。";

const DIMENSIONS = [
  "technologyInnovation",
  "industryValue",
  "socialValue",
  "developmentPositioning",
] as const;

type AssetDimension = (typeof DIMENSIONS)[number];

const llmAssetSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  text: z.string().min(1),
  profileEvidenceIds: z.preprocess(
    (value) => (value == null ? [] : value),
    z.array(z.string()).default([]),
  ),
  evidenceChunkIds: z.preprocess(
    (value) => (value == null ? undefined : value),
    z.array(z.string()).optional(),
  ),
  evidenceRefs: z
    .array(
      z
        .object({
          chunkId: z.string().min(1),
          speechId: z.string().optional(),
        })
        .passthrough(),
    )
    .optional(),
});

const llmAssetsSchema = z
  .object({
    technologyInnovation: z.array(llmAssetSchema).default([]),
    industryValue: z.array(llmAssetSchema).default([]),
    socialValue: z.array(llmAssetSchema).default([]),
    developmentPositioning: z.array(llmAssetSchema).default([]),
  })
  .passthrough();

export type SelectedEvidence = {
  ref: EvidenceRef;
  chunk: SpeechChunk;
  quote: string;
};

export interface AssetGenerator {
  generate(input: {
    profile: EnterpriseProfile;
    selectedEvidence: SelectedEvidence[];
  }): Promise<unknown>;
}

const SYSTEM_PROMPT = `你是企业话语资产生成器。你只根据已确认企业画像和用户已选讲话证据，生成四维结构化企业表达。

硬约束：
1. 企业事实不得超出画像条目；不得虚构客户、融资、规模、市场地位、技术指标或成果。
2. 只能使用用户已选 evidence 的 chunkId；不得引入未确认讲话。
3. 不得生成、改写、复述或摘录总书记讲话原文；text 只能写企业自己的表达。
4. 不得把讲话原文、quote 或连续原文片段写入 title 或 text。
5. 原文将由程序按 evidenceRefs 回填，你只输出结构化 JSON。
6. profileEvidenceIds 只能使用画像条目 id。
7. 企业表达不得伪装成总书记原话。

输出 JSON 字段：
technologyInnovation / industryValue / socialValue / developmentPositioning
每项包含 title、text、profileEvidenceIds、evidenceChunkIds。
每个维度最多 2 条；证据不足时该维必须为空数组，不得为凑数编造。不要要求每个维度至少生成一条。`;

function evidenceKey(ref: EvidenceRef): string {
  return `${ref.speechId}::${ref.chunkId}`;
}

export function enterprisePortion(text: string): string {
  const marker = `\n\n${QUOTE_HEADING}`;
  const index = text.indexOf(marker);
  return index >= 0 ? text.slice(0, index) : text;
}

export function fillCanonicalQuotes(enterpriseText: string, quotes: string[]): string {
  const unique = [...new Set(quotes.filter((quote) => quote.length > 0))];
  const block = unique.map((quote) => `${QUOTE_HEADING}\n${quote}`).join("\n\n");
  return `${enterpriseText}\n\n${block}`.trim();
}

export function resolveSelectedEvidence(
  selectedEvidenceRefs: EvidenceRef[],
  repository: ChunkRepository,
): SelectedEvidence[] {
  if (selectedEvidenceRefs.length === 0) {
    throw new AssetsError("必须提供至少一条用户已选 EvidenceRef");
  }

  const seen = new Set<string>();
  const selected: SelectedEvidence[] = [];
  for (const ref of selectedEvidenceRefs) {
    const chunk = repository.getByChunkId(ref.chunkId);
    if (!chunk) {
      throw new EvidenceError(`未找到 chunkId=${ref.chunkId} 的 Canonical Chunk`);
    }
    const canonicalRef = toFullChunkEvidenceRef(chunk);
    const quote = resolveQuoteFromEvidenceRef(ref, repository);
    const key = evidenceKey(canonicalRef);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push({ ref: canonicalRef, chunk, quote });
  }
  return selected;
}

function collectChunkIds(asset: z.infer<typeof llmAssetSchema>): string[] {
  const fromRefs = (asset.evidenceRefs ?? []).map((ref) => ref.chunkId);
  return [...new Set([...(asset.evidenceChunkIds ?? []), ...fromRefs])];
}

function toDimensionAssets(
  dimension: AssetDimension,
  rawAssets: z.infer<typeof llmAssetSchema>[],
  selected: SelectedEvidence[],
  allowedProfileIds: Set<string>,
): DiscourseAsset[] {
  const selectedByChunkId = new Map(selected.map((item) => [item.chunk.chunkId, item]));
  const quotes = selected.map((item) => item.quote);
  const result: DiscourseAsset[] = [];

  for (const [index, raw] of rawAssets.entries()) {
    const evidence = collectChunkIds(raw)
      .map((chunkId) => selectedByChunkId.get(chunkId))
      .filter((item): item is SelectedEvidence => Boolean(item));
    if (evidence.length === 0) {
      continue;
    }

    const profileEvidenceIds = [...new Set(raw.profileEvidenceIds.filter((id) => allowedProfileIds.has(id)))];
    if (profileEvidenceIds.length === 0) {
      continue;
    }
    let enterpriseText = stripAgainstCanonicalTexts(raw.text, quotes);
    if (isBlankCanonicalSafeText(enterpriseText)) {
      enterpriseText = FALLBACK_ENTERPRISE_TEXT;
    }
    const title = stripAgainstCanonicalTexts(raw.title, quotes) || `${dimension}_${index + 1}`;

    const asset = {
      id: raw.id?.trim() || `${dimension}_${index + 1}`,
      title,
      text: fillCanonicalQuotes(
        enterpriseText,
        evidence.map((item) => item.quote),
      ),
      profileEvidenceIds,
      evidenceRefs: evidence.map((item) => item.ref),
    };

    const parsed = discourseAssetSchema.safeParse(asset);
    if (parsed.success) {
      result.push(parsed.data);
    }
    if (result.length >= MAX_ASSETS_PER_DIMENSION) {
      break;
    }
  }

  return result;
}

function unwrapAssetsPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") {
    return raw;
  }
  const record = raw as Record<string, unknown>;
  if (record.assets && typeof record.assets === "object") {
    return record.assets;
  }
  return raw;
}

export function materializeDiscourseAssets(
  raw: unknown,
  selected: SelectedEvidence[],
  profile: EnterpriseProfile,
): DiscourseAssets {
  const parsed = llmAssetsSchema.safeParse(unwrapAssetsPayload(raw));
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new AssetsError(`话语资产模型输出未通过 Schema 校验: ${details}`);
  }

  const allowedProfileIds = new Set(collectProfileItems(profile).map((item) => item.id));
  const assets: DiscourseAssets = {
    technologyInnovation: toDimensionAssets(
      "technologyInnovation",
      parsed.data.technologyInnovation,
      selected,
      allowedProfileIds,
    ),
    industryValue: toDimensionAssets(
      "industryValue",
      parsed.data.industryValue,
      selected,
      allowedProfileIds,
    ),
    socialValue: toDimensionAssets(
      "socialValue",
      parsed.data.socialValue,
      selected,
      allowedProfileIds,
    ),
    developmentPositioning: toDimensionAssets(
      "developmentPositioning",
      parsed.data.developmentPositioning,
      selected,
      allowedProfileIds,
    ),
  };

  const count = DIMENSIONS.reduce((sum, key) => sum + assets[key].length, 0);
  if (count === 0) {
    throw new AssetsError("没有可落地的话语资产：模型未引用任何已选 EvidenceRef");
  }

  const checked = discourseAssetsSchema.safeParse(assets);
  if (!checked.success) {
    throw new AssetsError("话语资产最终结构未通过 Schema 校验");
  }
  return checked.data;
}

export function assertAssetsHonorEvidenceBoundary(
  assets: DiscourseAssets,
  selected: SelectedEvidence[],
): void {
  const allowedKeys = new Set(selected.map((item) => evidenceKey(item.ref)));
  const quoteByChunkId = new Map(selected.map((item) => [item.chunk.chunkId, item.quote]));
  const quotes = [...quoteByChunkId.values()];

  for (const key of DIMENSIONS) {
    for (const asset of assets[key]) {
      if (asset.evidenceRefs.length === 0) {
        throw new AssetsError(`话语资产缺少 EvidenceRef: ${asset.id}`);
      }
      const enterprise = enterprisePortion(asset.text);
      for (const quote of quotes) {
        if (containsCanonicalFragment(enterprise, quote)) {
          throw new AssetsError(`企业表达混入 Canonical 原文片段: ${asset.id}`);
        }
      }
      for (const ref of asset.evidenceRefs) {
        if (!allowedKeys.has(evidenceKey(ref)) || ref.startIndex !== 0) {
          throw new AssetsError(`话语资产引用了未确认或不完整 Evidence: ${ref.chunkId}`);
        }
        const quote = quoteByChunkId.get(ref.chunkId);
        if (!quote || !asset.text.includes(quote)) {
          throw new AssetsError(`程序回填后缺少 Canonical 引用: ${asset.id}`);
        }
      }
    }
  }
}

export class DeepSeekAssetGenerator implements AssetGenerator {
  constructor(private readonly client = new DeepSeekChatClient()) {}

  async generate(input: {
    profile: EnterpriseProfile;
    selectedEvidence: SelectedEvidence[];
  }): Promise<unknown> {
    const profileItems = collectProfileItems(input.profile).map((item) => ({
      id: item.id,
      value: item.value,
      origin: item.origin,
    }));
    const selectedEvidence = input.selectedEvidence.map((item) => ({
      chunkId: item.chunk.chunkId,
      speechId: item.chunk.speechId,
      title: item.chunk.title,
      date: item.chunk.date,
      source: item.chunk.source,
      keywords: item.chunk.keywords,
    }));

    const userPrompt = `请基于以下已确认画像与已选证据生成四维话语资产。每个维度最多 2 条，证据不足则该维为空，不要凑数。不要写入讲话原文。\n${JSON.stringify({
      profileItems,
      selectedEvidence,
    })}`;
    return this.client.completeJson(SYSTEM_PROMPT, userPrompt);
  }
}

export type GenerateDiscourseAssetsOptions = {
  chunkRepository?: ChunkRepository;
  generator?: AssetGenerator;
};

let defaultGenerator: AssetGenerator | undefined;

function getDefaultAssetGenerator(): AssetGenerator {
  return (defaultGenerator ??= new DeepSeekAssetGenerator());
}

export async function generateDiscourseAssets(
  profile: EnterpriseProfile,
  selectedEvidenceRefs: EvidenceRef[],
  options: GenerateDiscourseAssetsOptions = {},
): Promise<DiscourseAssets> {
  const repository = options.chunkRepository ?? defaultChunkRepository;
  const generator = options.generator ?? getDefaultAssetGenerator();
  const selected = resolveSelectedEvidence(selectedEvidenceRefs, repository);
  const raw = await generator.generate({ profile, selectedEvidence: selected });
  const assets = materializeDiscourseAssets(raw, selected, profile);
  assertAssetsHonorEvidenceBoundary(assets, selected);
  return assets;
}

export function generateAssetsPlaceholder(
  selectedEvidenceRefs: EvidenceRef[],
): DiscourseAssets & { selectedEvidenceCount: number } {
  return {
    placeholder: true,
    technologyInnovation: [],
    industryValue: [],
    socialValue: [],
    developmentPositioning: [],
    selectedEvidenceCount: selectedEvidenceRefs.length,
  };
}
