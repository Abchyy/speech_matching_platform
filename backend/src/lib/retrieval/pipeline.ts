import { retrievalConfig } from "../config";
import type { RetrievedCandidate, RetrievalQuery, Retriever } from "./types";
import { reciprocalRankFusion } from "./fusion";

export type RetrievalPipelineOptions = {
  mode?: "dense" | "hybrid";
  rrfK?: number;
  retrievers: Retriever[];
};

export type RetrievalPipelineResult = {
  candidates: RetrievedCandidate[];
  mode: "dense" | "hybrid";
  channels: string[];
};

export async function runRetrievalPipeline(
  query: RetrievalQuery,
  options: RetrievalPipelineOptions,
): Promise<RetrievalPipelineResult> {
  const mode = options.mode ?? retrievalConfig.mode;
  const enabled =
    mode === "dense"
      ? options.retrievers.filter((retriever) => retriever.channel === "dense")
      : options.retrievers;
  if (enabled.length === 0) {
    throw new Error("检索管道没有可用 Retriever");
  }

  const lists = await Promise.all(enabled.map((retriever) => retriever.retrieve(query)));
  const candidates =
    mode === "dense" || enabled.length === 1
      ? (lists[0] ?? []).map((item, index) => ({
          ...item,
          scores: {
            ...item.scores,
            fusion: item.scores.dense ?? item.scores.lexical ?? item.scores.exact,
            fusionRank: index + 1,
          },
        }))
      : reciprocalRankFusion(lists, options.rrfK ?? retrievalConfig.rrfK);

  return {
    candidates: candidates.slice(0, query.topK),
    mode,
    channels: enabled.map((retriever) => retriever.channel),
  };
}

export function applySpeechDiversity(
  candidates: RetrievedCandidate[],
  maxChunksPerSpeech: number,
): RetrievedCandidate[] {
  const seen = new Map<string, number>();
  return candidates.filter((item) => {
    const count = seen.get(item.chunk.speechId) ?? 0;
    if (count >= maxChunksPerSpeech) {
      return false;
    }
    seen.set(item.chunk.speechId, count + 1);
    return true;
  });
}
