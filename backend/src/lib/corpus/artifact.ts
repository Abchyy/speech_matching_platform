import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  CHUNK_POLICY_VERSION,
  CORPUS_VERSION,
  EXPECTED_RUNTIME_CHUNK_COUNT,
  EXPECTED_RUNTIME_DOCUMENT_COUNT,
  XI_SPEECH_DOMAIN,
} from "../domain/xi-speech/constants";
import { speechChunkSchema, type SpeechChunk } from "../schemas";
import {
  CorpusIngestionError,
  hashCanonicalText,
  type CanonicalDocument,
} from "./canonical-document";
import { fingerprintChunks, fingerprintDocuments, type CorpusSnapshot } from "./fingerprint";

export const publishedChunkSchema = z.object({
  chunkId: z.string().min(1),
  speechId: z.string().min(1),
  chunkIndex: z.number().int().nonnegative(),
  title: z.string().min(1),
  date: z.string().nullable(),
  source: z.string().min(1),
  url: z.string().optional().nullable(),
  text: z.string().min(1),
  charStart: z.number().int().nonnegative(),
  charEnd: z.number().int().nonnegative(),
  charCount: z.number().int().nonnegative().optional(),
});

export type PublishedChunk = z.infer<typeof publishedChunkSchema>;

export type ArtifactLoadOptions = {
  documents: CanonicalDocument[];
  droppedIds: Set<string>;
  keywordsBySpeechId: Map<string, string[]>;
  chunkDirectory: string;
  expectedDocumentCount?: number;
  expectedChunkCount?: number;
};

export type ArtifactLoadResult = {
  documents: CanonicalDocument[];
  chunks: SpeechChunk[];
  snapshot: CorpusSnapshot;
};

function buildEmbeddingText(title: string, text: string): string {
  return `标题：${title}\n\n正文：\n${text}`;
}

export function resolveChunkArtifactDirectory(projectRoot: string): string {
  return path.join(projectRoot, "corpus", "chunks");
}

export function loadPublishedChunkFiles(directory: string): PublishedChunk[] {
  if (!fs.existsSync(directory)) {
    throw new CorpusIngestionError(`Chunk Artifact 目录不存在: ${directory}`);
  }

  const names = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  if (names.length === 0) {
    throw new CorpusIngestionError(`目录中没有已发布 Chunk Artifact: ${directory}`);
  }

  const chunks: PublishedChunk[] = [];
  for (const name of names) {
    const filePath = path.join(directory, name);
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!Array.isArray(parsed)) {
      throw new CorpusIngestionError(`Chunk Artifact 必须是数组: ${name}`);
    }
    for (const item of parsed) {
      const chunk = publishedChunkSchema.safeParse(item);
      if (!chunk.success) {
        throw new CorpusIngestionError(
          `Chunk Artifact 校验失败 ${name}: ${chunk.error.issues.map((issue) => issue.message).join("; ")}`,
        );
      }
      chunks.push(chunk.data);
    }
  }
  return chunks;
}

export function validatePublishedChunk(
  published: PublishedChunk,
  document: CanonicalDocument | undefined,
  droppedIds: Set<string>,
): SpeechChunk {
  if (!document) {
    throw new CorpusIngestionError(`未知文档: ${published.speechId} / ${published.chunkId}`);
  }
  if (droppedIds.has(published.speechId)) {
    throw new CorpusIngestionError(
      `dedup 泄漏: ${published.chunkId} 属于已排除文档 ${published.speechId}`,
    );
  }
  if (published.speechId !== document.speechId) {
    throw new CorpusIngestionError(`Chunk 与文档 ID 不一致: ${published.chunkId}`);
  }
  if (published.charEnd < published.charStart) {
    throw new CorpusIngestionError(`非法 offset: ${published.chunkId}`);
  }
  if (published.charEnd > document.fullText.length) {
    throw new CorpusIngestionError(
      `越界 offset: ${published.chunkId} end=${published.charEnd} len=${document.fullText.length}`,
    );
  }
  const sliced = document.fullText.slice(published.charStart, published.charEnd);
  if (sliced !== published.text) {
    throw new CorpusIngestionError(`Chunk 正文与 Canonical slice 不一致: ${published.chunkId}`);
  }

  const contentHash = hashCanonicalText(published.text);
  const documentContentHash = document.sha256 ?? hashCanonicalText(document.fullText);
  const parsed = speechChunkSchema.safeParse({
    chunkId: published.chunkId,
    speechId: published.speechId,
    chunkIndex: published.chunkIndex,
    title: published.title,
    date: published.date,
    source: published.source,
    url: published.url ?? document.url,
    text: published.text,
    keywords: [],
    embeddingText: buildEmbeddingText(published.title, published.text),
    charStart: published.charStart,
    charEnd: published.charEnd,
    contentHash,
    documentContentHash,
    isDemoPlaceholder: document.isDemoPlaceholder,
  });
  if (!parsed.success) {
    throw new CorpusIngestionError(
      `运行时 Chunk 校验失败: ${published.chunkId}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }
  return parsed.data;
}

export function loadPublishedChunkArtifacts(options: ArtifactLoadOptions): ArtifactLoadResult {
  const published = loadPublishedChunkFiles(options.chunkDirectory);
  const documentsById = new Map(options.documents.map((document) => [document.speechId, document]));
  const seenChunkIds = new Set<string>();
  const chunks: SpeechChunk[] = [];

  for (const item of published) {
    if (seenChunkIds.has(item.chunkId)) {
      throw new CorpusIngestionError(`重复的 chunkId: ${item.chunkId}`);
    }
    seenChunkIds.add(item.chunkId);
    const document = documentsById.get(item.speechId);
    const chunk = validatePublishedChunk(item, document, options.droppedIds);
    const keywords = options.keywordsBySpeechId.get(chunk.speechId) ?? [];
    chunks.push({
      ...chunk,
      keywords: [...keywords],
      embeddingText: buildEmbeddingText(chunk.title, chunk.text),
    });
  }

  const runtimeDocuments = options.documents.filter((document) => !options.droppedIds.has(document.speechId));
  const expectedDocuments = options.expectedDocumentCount ?? EXPECTED_RUNTIME_DOCUMENT_COUNT;
  const expectedChunks = options.expectedChunkCount ?? EXPECTED_RUNTIME_CHUNK_COUNT;
  if (runtimeDocuments.length !== expectedDocuments) {
    throw new CorpusIngestionError(
      `运行时文档数不符合快照: ${runtimeDocuments.length} != ${expectedDocuments}`,
    );
  }
  if (chunks.length !== expectedChunks) {
    throw new CorpusIngestionError(
      `已发布 Chunk 数不符合快照: ${chunks.length} != ${expectedChunks}`,
    );
  }

  const publishedSpeechIds = new Set(chunks.map((chunk) => chunk.speechId));
  for (const document of runtimeDocuments) {
    if (!publishedSpeechIds.has(document.speechId)) {
      throw new CorpusIngestionError(`运行时文档缺少 Chunk Artifact: ${document.speechId}`);
    }
  }

  const snapshot: CorpusSnapshot = {
    domain: XI_SPEECH_DOMAIN,
    corpusVersion: CORPUS_VERSION,
    corpusFingerprint: fingerprintDocuments(runtimeDocuments),
    chunkFingerprint: fingerprintChunks(chunks),
    chunkPolicyVersion: CHUNK_POLICY_VERSION,
    documentCount: runtimeDocuments.length,
    chunkCount: chunks.length,
  };

  return { documents: runtimeDocuments, chunks, snapshot };
}
