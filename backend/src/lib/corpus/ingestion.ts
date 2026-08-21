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
    const demoDir = path.join(dir, "corpus", "demo");
    if (fs.existsSync(demoDir) && fs.existsSync(path.join(dir, "PROGRESS.md"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new CorpusIngestionError(`未找到项目根目录（含 corpus/demo），起始目录: ${startDir}`);
}

export function resolveDemoCorpusDirectory(startDir = process.cwd()): string {
  return path.join(findProjectRoot(startDir), "corpus", "demo");
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
