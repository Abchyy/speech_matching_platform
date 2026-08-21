import { speechChunkSchema, type SpeechChunk } from "../schemas";
import {
  CorpusIngestionError,
  type CanonicalDocument,
} from "./canonical-document";

/** 工程默认值；精确长度与 overlap 尚未冻结，本阶段不做 overlap。 */
const DEFAULT_MAX_CHUNK_CHARS = 800;

export type ChunkingOptions = {
  maxChars?: number;
  keywords?: string[];
};

function freezeChunk(chunk: SpeechChunk): SpeechChunk {
  Object.freeze(chunk.keywords);
  Object.freeze(chunk);
  return chunk;
}

function splitParagraphRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const parts = text.split(/\n\n+/);
  let cursor = 0;

  for (const part of parts) {
    const start = text.indexOf(part, cursor);
    if (start < 0) {
      throw new CorpusIngestionError("Canonical 正文分段失败");
    }
    const end = start + part.length;
    if (part.trim().length > 0) {
      ranges.push({ start, end });
    }
    cursor = end;
  }

  return ranges;
}

function splitSentenceRanges(text: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = /[^。！？!?]+[。！？!?]*/g;
  let match: RegExpExecArray | null = pattern.exec(text);

  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    if (match[0].trim().length > 0) {
      ranges.push({ start, end });
    }
    match = pattern.exec(text);
  }

  return ranges.length > 0 ? ranges : [{ start: 0, end: text.length }];
}

function sliceUnit(unit: string, maxChars: number): string[] {
  if (unit.length <= maxChars) {
    return [unit];
  }

  const pieces: string[] = [];
  const sentences = splitSentenceRanges(unit);
  let current = "";

  const flush = () => {
    if (current) {
      pieces.push(current);
      current = "";
    }
  };

  for (const range of sentences) {
    const sentence = unit.slice(range.start, range.end);
    if (sentence.length > maxChars) {
      flush();
      for (let offset = 0; offset < sentence.length; offset += maxChars) {
        pieces.push(sentence.slice(offset, offset + maxChars));
      }
      continue;
    }
    if (current.length + sentence.length > maxChars) {
      flush();
    }
    current += sentence;
  }

  flush();
  return pieces;
}

function buildEmbeddingText(title: string, text: string): string {
  return `标题：${title}\n\n正文：\n${text}`;
}

function toChunkId(speechId: string, chunkIndex: number): string {
  return `${speechId}_chunk_${String(chunkIndex).padStart(3, "0")}`;
}

/**
 * 从 Canonical Document 原样切片生成 Chunk。
 * Chunk 文本必须是 fullText 的子串，禁止改写。
 */
export function chunkCanonicalDocument(
  document: CanonicalDocument,
  options: ChunkingOptions = {},
): SpeechChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const keywords = options.keywords ?? [];
  const texts = splitParagraphRanges(document.fullText).flatMap((range) =>
    sliceUnit(document.fullText.slice(range.start, range.end), maxChars),
  );

  if (texts.length === 0) {
    throw new CorpusIngestionError(`Canonical Document 无法生成 Chunk: ${document.speechId}`);
  }

  return texts.map((text, chunkIndex) => {
    if (!document.fullText.includes(text)) {
      throw new CorpusIngestionError(
        `Chunk 文本必须是 Canonical Document 的原样子串: ${document.speechId}`,
      );
    }

    const parsed = speechChunkSchema.safeParse({
      chunkId: toChunkId(document.speechId, chunkIndex),
      speechId: document.speechId,
      chunkIndex,
      title: document.title,
      date: document.date,
      source: document.source,
      url: document.url,
      text,
      keywords,
      embeddingText: buildEmbeddingText(document.title, text),
      isDemoPlaceholder: document.isDemoPlaceholder,
    });

    if (!parsed.success) {
      throw new CorpusIngestionError(
        `Chunk 校验失败: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      );
    }

    return freezeChunk(parsed.data);
  });
}
