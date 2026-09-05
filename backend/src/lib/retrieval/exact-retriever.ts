import type { ChunkRepository } from "../corpus";
import { passesMetadataFilter } from "./vector-retriever";
import type { RetrievedCandidate, RetrievalQuery, Retriever } from "./types";

export class ExactPhraseRetriever implements Retriever {
  readonly channel = "exact" as const;

  constructor(private readonly chunkRepository: ChunkRepository) {}

  async retrieve(query: RetrievalQuery): Promise<RetrievedCandidate[]> {
    const phrases = query.exactPhrases.filter((phrase) => phrase.trim().length >= 4);
    if (phrases.length === 0) {
      return [];
    }
    const scored: RetrievedCandidate[] = [];
    for (const chunk of this.chunkRepository.listAll()) {
      if (!passesMetadataFilter(chunk, query)) {
        continue;
      }
      let hits = 0;
      for (const phrase of phrases) {
        if (chunk.text.includes(phrase) || chunk.title.includes(phrase)) {
          hits += 1;
        }
      }
      if (hits > 0) {
        scored.push({
          chunk,
          channels: ["exact"],
          scores: { exact: hits / phrases.length },
        });
      }
    }
    scored.sort((left, right) => (right.scores.exact ?? 0) - (left.scores.exact ?? 0));
    return scored.slice(0, query.topK).map((item, index) => ({
      ...item,
      scores: { ...item.scores, exactRank: index + 1 },
    }));
  }
}
