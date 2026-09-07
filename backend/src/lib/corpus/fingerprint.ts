import { hashCanonicalText, type CanonicalDocument } from "./canonical-document";
import type { SpeechChunk } from "../schemas";

export type CorpusSnapshot = {
  domain: string;
  corpusVersion: string;
  corpusFingerprint: string;
  chunkFingerprint: string;
  chunkPolicyVersion: string;
  documentCount: number;
  chunkCount: number;
};

export function fingerprintDocuments(documents: CanonicalDocument[]): string {
  const lines = documents
    .map((document) => `${document.speechId}\t${document.sha256 ?? hashCanonicalText(document.fullText)}`)
    .sort();
  return hashCanonicalText(lines.join("\n"));
}

export function fingerprintChunks(chunks: SpeechChunk[]): string {
  const lines = chunks
    .map((chunk) => {
      const contentHash = chunk.contentHash ?? hashCanonicalText(chunk.text);
      const start = chunk.charStart ?? 0;
      const end = chunk.charEnd ?? chunk.text.length;
      return `${chunk.chunkId}\t${chunk.speechId}\t${start}\t${end}\t${contentHash}`;
    })
    .sort();
  return hashCanonicalText(lines.join("\n"));
}
