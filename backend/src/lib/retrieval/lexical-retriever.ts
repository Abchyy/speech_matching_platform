import type { ChunkRepository } from "../corpus";
import { passesMetadataFilter } from "./vector-retriever";
import { termFrequency, tokenize } from "./tokenize";
import type { RetrievedCandidate, RetrievalQuery, Retriever } from "./types";

const K1 = 1.5;
const B = 0.75;

export class LexicalRetriever implements Retriever {
  readonly channel = "lexical" as const;
  private readonly documents: Array<{
    chunkId: string;
    speechId: string;
    keywords: string[];
    tf: Map<string, number>;
    dl: number;
  }>;
  private readonly df = new Map<string, number>();
  private readonly avgDl: number;

  constructor(chunkRepository: ChunkRepository) {
    const chunks = chunkRepository.listAll();
    this.documents = chunks.map((chunk) => {
      const tokens = tokenize(`${chunk.title}\n${chunk.text}\n${chunk.keywords.join(" ")}`);
      const tf = termFrequency(tokens);
      return {
        chunkId: chunk.chunkId,
        speechId: chunk.speechId,
        keywords: chunk.keywords,
        tf,
        dl: tokens.length || 1,
      };
    });
    for (const document of this.documents) {
      for (const term of document.tf.keys()) {
        this.df.set(term, (this.df.get(term) ?? 0) + 1);
      }
    }
    this.avgDl =
      this.documents.reduce((sum, document) => sum + document.dl, 0) / Math.max(1, this.documents.length);
    this.repository = chunkRepository;
  }

  private readonly repository: ChunkRepository;

  async retrieve(query: RetrievalQuery): Promise<RetrievedCandidate[]> {
    const terms = query.lexicalTerms.length > 0 ? query.lexicalTerms : tokenize(query.text);
    if (terms.length === 0) {
      return [];
    }
    const n = this.documents.length;
    const scored: Array<{ chunkId: string; score: number }> = [];
    for (const document of this.documents) {
      if (!passesMetadataFilter(document, query)) {
        continue;
      }
      let score = 0;
      for (const term of terms) {
        const tf = document.tf.get(term) ?? 0;
        if (tf <= 0) continue;
        const df = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        const denom = tf + K1 * (1 - B + B * (document.dl / this.avgDl));
        score += idf * ((tf * (K1 + 1)) / denom);
      }
      if (score > 0) {
        scored.push({ chunkId: document.chunkId, score });
      }
    }
    scored.sort((left, right) => right.score - left.score);
    const results: RetrievedCandidate[] = [];
    for (const [index, item] of scored.slice(0, query.topK).entries()) {
      const chunk = this.repository.getByChunkId(item.chunkId);
      if (!chunk) continue;
      results.push({
        chunk,
        channels: ["lexical"],
        scores: { lexical: item.score, lexicalRank: index + 1 },
      });
    }
    return results;
  }
}
