export type { CanonicalDocument } from "./canonical-document";
export {
  canonicalDocumentSchema,
  CorpusIngestionError,
  createCanonicalDocument,
  freezeCanonicalDocument,
  hashCanonicalText,
} from "./canonical-document";
export type { ChunkRepository } from "./chunk-repository";
export { chunkCanonicalDocument } from "./chunker";
export { CanonicalChunkRepository } from "./canonical-chunk-repository";
export { DemoChunkRepository } from "./demo-chunk-repository";
export { InMemoryChunkRepository } from "./in-memory-chunk-repository";
export type { CorpusPreflightReport, DedupMapping, IngestionResult } from "./ingestion";
export {
  findProjectRoot,
  ingestCanonicalDirectory,
  ingestCanonicalDocuments,
  ingestCanonicalMarkdown,
  ingestDemoCorpus,
  ingestProjectCorpus,
  loadDedupMapping,
  preflightCanonicalCorpus,
  resolveCanonicalCorpusDirectory,
  resolveDemoCorpusDirectory,
} from "./ingestion";
export type { ParsedCanonicalMarkdown } from "./parser";
export { parseCanonicalMarkdown } from "./parser";

import type { ChunkRepository } from "./chunk-repository";
import { CanonicalChunkRepository } from "./canonical-chunk-repository";

export const defaultChunkRepository: ChunkRepository = new CanonicalChunkRepository();
