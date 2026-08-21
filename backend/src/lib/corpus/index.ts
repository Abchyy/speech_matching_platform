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
export { DemoChunkRepository } from "./demo-chunk-repository";
export { InMemoryChunkRepository } from "./in-memory-chunk-repository";
export type { IngestionResult } from "./ingestion";
export {
  findProjectRoot,
  ingestCanonicalDirectory,
  ingestCanonicalDocuments,
  ingestCanonicalMarkdown,
  ingestDemoCorpus,
} from "./ingestion";
export type { ParsedCanonicalMarkdown } from "./parser";
export { parseCanonicalMarkdown } from "./parser";

import type { ChunkRepository } from "./chunk-repository";
import { DemoChunkRepository } from "./demo-chunk-repository";

export const defaultChunkRepository: ChunkRepository = new DemoChunkRepository();
