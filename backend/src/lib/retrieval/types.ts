import type { SpeechChunk } from "../schemas";

export type RetrievalChannel = "dense" | "lexical" | "exact";

export type ScoreBreakdown = {
  dense?: number;
  lexical?: number;
  exact?: number;
  fusion?: number;
  rerank?: number;
  denseRank?: number;
  lexicalRank?: number;
  exactRank?: number;
  fusionRank?: number;
};

export type RetrievalQuery = {
  text: string;
  lexicalTerms: string[];
  exactPhrases: string[];
  metadataFilters?: {
    speechIds?: string[];
    keywords?: string[];
  };
  topK: number;
};

export type RetrievedCandidate = {
  chunk: SpeechChunk;
  scores: ScoreBreakdown;
  channels: RetrievalChannel[];
};

export interface Retriever {
  readonly channel: RetrievalChannel;
  retrieve(query: RetrievalQuery): Promise<RetrievedCandidate[]>;
}

export type RetrievalIntent = {
  confirmedFacts: Array<{ id: string; text: string; origin: "explicit" | "inferred" }>;
  retrievalHints: Array<{
    text: string;
    source: "deterministic_rule";
    version: string;
    fromFactIds: string[];
  }>;
  metadataFilters: {
    keywords?: string[];
  };
  profileSnapshotRef: string;
  queryText: string;
};
