import { createHash } from "node:crypto";
import { speechDocumentSchema, type SpeechDocument } from "../schemas";

/**
 * Canonical Document 与架构中的 SpeechDocument 为同一模型。
 * speechId = document id；fullText = 不可修改的权威正文。
 */
export type CanonicalDocument = SpeechDocument;
export const canonicalDocumentSchema = speechDocumentSchema;

export class CorpusIngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorpusIngestionError";
  }
}

export function hashCanonicalText(fullText: string): string {
  return createHash("sha256").update(fullText, "utf8").digest("hex");
}

export function freezeCanonicalDocument(document: CanonicalDocument): CanonicalDocument {
  Object.freeze(document);
  return document;
}

export function createCanonicalDocument(input: {
  speechId: string;
  title: string;
  date: string | null;
  source: string;
  url?: string;
  fullText: string;
  sha256?: string;
  isDemoPlaceholder?: boolean;
}): CanonicalDocument {
  const sha256 = hashCanonicalText(input.fullText);
  if (input.sha256 && input.sha256 !== sha256) {
    throw new CorpusIngestionError(
      `Canonical Document sha256 与正文不一致: ${input.speechId}`,
    );
  }

  const parsed = canonicalDocumentSchema.safeParse({
    ...input,
    sha256,
  });

  if (!parsed.success) {
    throw new CorpusIngestionError(
      `Canonical Document 校验失败: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  }

  return freezeCanonicalDocument(parsed.data);
}
