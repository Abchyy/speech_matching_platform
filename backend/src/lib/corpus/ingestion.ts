import fs from "node:fs";
import path from "node:path";
import type { SpeechChunk } from "../schemas";
import {
  CorpusIngestionError,
  type CanonicalDocument,
} from "./canonical-document";
import { chunkCanonicalDocument } from "./chunker";
import { parseCanonicalMarkdown, type ParsedCanonicalMarkdown } from "./parser";

export type IngestionResult = {
  documents: CanonicalDocument[];
  chunks: SpeechChunk[];
};

function assertUniqueSpeechIds(documents: CanonicalDocument[]): void {
  const seen = new Set<string>();
  for (const document of documents) {
    if (seen.has(document.speechId)) {
      throw new CorpusIngestionError(`重复的 Canonical Document id: ${document.speechId}`);
    }
    seen.add(document.speechId);
  }
}

export function assertUniqueChunkIds(chunks: SpeechChunk[]): void {
  const seen = new Set<string>();
  for (const chunk of chunks) {
    if (seen.has(chunk.chunkId)) {
      throw new CorpusIngestionError(`重复的 chunkId: ${chunk.chunkId}`);
    }
    seen.add(chunk.chunkId);
  }
}

export function findProjectRoot(startDir = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 12; i += 1) {
    const hasProgress = fs.existsSync(path.join(dir, "PROGRESS.md"));
    const hasCleaned = fs.existsSync(path.join(dir, "corpus", "cleaned"));
    const hasDemo = fs.existsSync(path.join(dir, "corpus", "demo"));
    if (hasProgress && (hasCleaned || hasDemo)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new CorpusIngestionError(`未找到项目根目录（含 corpus/cleaned 或 corpus/demo），起始目录: ${startDir}`);
}

function hasCanonicalMarkdown(directory: string): boolean {
  if (!fs.existsSync(directory)) {
    return false;
  }
  return fs.readdirSync(directory).some(
    (name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md",
  );
}

export function resolveDemoCorpusDirectory(startDir = process.cwd()): string {
  return path.join(findProjectRoot(startDir), "corpus", "demo");
}

export function resolveCanonicalCorpusDirectory(startDir = process.cwd()): string {
  const root = findProjectRoot(startDir);
  const cleaned = path.join(root, "corpus", "cleaned");
  if (hasCanonicalMarkdown(cleaned)) {
    return cleaned;
  }
  return resolveDemoCorpusDirectory(startDir);
}

export type DedupDrop = {
  keep: string;
  reason: string;
};

export type DedupMapping = {
  policy: string;
  dropped: Record<string, DedupDrop>;
};

export function loadDedupMapping(startDir = process.cwd()): DedupMapping {
  const filePath = path.join(findProjectRoot(startDir), "corpus", "dedup.json");
  if (!fs.existsSync(filePath)) {
    return { policy: "", dropped: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    policy?: string;
    dropped?: Record<string, DedupDrop>;
  };
  return {
    policy: parsed.policy ?? "",
    dropped: parsed.dropped ?? {},
  };
}

function loadMetadataKeywords(startDir = process.cwd()): Map<string, string[]> {
  const filePath = path.join(findProjectRoot(startDir), "corpus", "metadata.json");
  const keywords = new Map<string, string[]>();
  if (!fs.existsSync(filePath)) {
    return keywords;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    articles?: Array<{ id?: string; retrieval_keywords?: unknown }>;
  };
  for (const article of parsed.articles ?? []) {
    if (!article.id || !Array.isArray(article.retrieval_keywords)) {
      continue;
    }
    keywords.set(
      article.id,
      article.retrieval_keywords.filter((item): item is string => typeof item === "string" && item.length > 0),
    );
  }
  return keywords;
}

function keywordsFor(item: ParsedCanonicalMarkdown, metadata: Map<string, string[]>): string[] {
  if (item.retrievalKeywords.length > 0) {
    return item.retrievalKeywords;
  }
  return metadata.get(item.document.speechId) ?? [];
}

export function loadCanonicalMarkdownFiles(directory: string): ParsedCanonicalMarkdown[] {
  if (!fs.existsSync(directory)) {
    throw new CorpusIngestionError(`Canonical Markdown 目录不存在: ${directory}`);
  }

  const names = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".md") &&
        entry.name.toLowerCase() !== "readme.md",
    )
    .map((entry) => entry.name)
    .sort();

  if (names.length === 0) {
    throw new CorpusIngestionError(`目录中没有 Canonical Markdown: ${directory}`);
  }

  return names.map((name) => {
    const markdown = fs.readFileSync(path.join(directory, name), "utf8");
    return parseCanonicalMarkdown(markdown);
  });
}

export function ingestCanonicalMarkdown(markdown: string): IngestionResult {
  const parsed = parseCanonicalMarkdown(markdown);
  const chunks = chunkCanonicalDocument(parsed.document, {
    keywords: parsed.retrievalKeywords,
  });
  assertUniqueChunkIds(chunks);
  return { documents: [parsed.document], chunks };
}

export function ingestCanonicalDocuments(
  documents: CanonicalDocument[],
  options: { keywordsBySpeechId?: Record<string, string[]> } = {},
): IngestionResult {
  assertUniqueSpeechIds(documents);
  const chunks = documents.flatMap((document) =>
    chunkCanonicalDocument(document, {
      keywords: options.keywordsBySpeechId?.[document.speechId] ?? [],
    }),
  );
  assertUniqueChunkIds(chunks);
  return { documents, chunks };
}

export function ingestCanonicalDirectory(directory: string): IngestionResult {
  const parsed = loadCanonicalMarkdownFiles(directory);
  const documents = parsed.map((item) => item.document);
  assertUniqueSpeechIds(documents);
  const chunks = parsed.flatMap((item) =>
    chunkCanonicalDocument(item.document, {
      keywords: item.retrievalKeywords,
    }),
  );
  assertUniqueChunkIds(chunks);
  return { documents, chunks };
}

export function ingestDemoCorpus(startDir = process.cwd()): IngestionResult {
  return ingestCanonicalDirectory(resolveDemoCorpusDirectory(startDir));
}

export function ingestProjectCorpus(startDir = process.cwd()): IngestionResult {
  const parsed = loadCanonicalMarkdownFiles(resolveCanonicalCorpusDirectory(startDir));
  const metadata = loadMetadataKeywords(startDir);
  const droppedIds = new Set(Object.keys(loadDedupMapping(startDir).dropped));
  const runtime = parsed.filter((item) => !droppedIds.has(item.document.speechId));
  const documents = runtime.map((item) => item.document);
  assertUniqueSpeechIds(documents);
  const chunks = runtime.flatMap((item) =>
    chunkCanonicalDocument(item.document, {
      keywords: keywordsFor(item, metadata),
    }),
  );
  assertUniqueChunkIds(chunks);
  return { documents, chunks };
}

export type CorpusPreflightReport = {
  canonicalDirectory: string;
  documentCount: number;
  runtimeDocumentCount: number;
  chunkCount: number;
  sha256Verified: number;
  substringVerified: number;
  uniqueSpeechIds: boolean;
  uniqueChunkIds: boolean;
  dedupPolicy: string;
  droppedCount: number;
  dropped: Array<{ speechId: string; keep: string; reason: string }>;
};

export function preflightCanonicalCorpus(startDir = process.cwd()): CorpusPreflightReport {
  const directory = resolveCanonicalCorpusDirectory(startDir);
  const parsed = loadCanonicalMarkdownFiles(directory);
  const documents = parsed.map((item) => item.document);
  assertUniqueSpeechIds(documents);

  const allChunks = parsed.flatMap((item) =>
    chunkCanonicalDocument(item.document, { keywords: item.retrievalKeywords }),
  );
  assertUniqueChunkIds(allChunks);

  let substringVerified = 0;
  for (const item of parsed) {
    const chunks = chunkCanonicalDocument(item.document, { keywords: item.retrievalKeywords });
    for (const chunk of chunks) {
      if (!item.document.fullText.includes(chunk.text)) {
        throw new CorpusIngestionError(`Chunk 不是 Canonical 子串: ${chunk.chunkId}`);
      }
      substringVerified += 1;
    }
  }

  const dedup = loadDedupMapping(startDir);
  const droppedIds = new Set(Object.keys(dedup.dropped));
  const runtime = ingestProjectCorpus(startDir);

  return {
    canonicalDirectory: directory,
    documentCount: documents.length,
    runtimeDocumentCount: runtime.documents.length,
    chunkCount: runtime.chunks.length,
    sha256Verified: documents.length,
    substringVerified,
    uniqueSpeechIds: true,
    uniqueChunkIds: true,
    dedupPolicy: dedup.policy,
    droppedCount: droppedIds.size,
    dropped: Object.entries(dedup.dropped).map(([speechId, item]) => ({
      speechId,
      keep: item.keep,
      reason: item.reason,
    })),
  };
}
