import type { RetrievedCandidate } from "./types";

export function reciprocalRankFusion(
  lists: RetrievedCandidate[][],
  k: number,
): RetrievedCandidate[] {
  const byId = new Map<string, RetrievedCandidate>();
  for (const list of lists) {
    for (const item of list) {
      const current = byId.get(item.chunk.chunkId);
      if (!current) {
        byId.set(item.chunk.chunkId, {
          chunk: item.chunk,
          channels: [...item.channels],
          scores: { ...item.scores },
        });
        continue;
      }
      current.channels = [...new Set([...current.channels, ...item.channels])];
      current.scores = { ...current.scores, ...item.scores };
    }
  }

  const fused: RetrievedCandidate[] = [];
  for (const candidate of byId.values()) {
    let fusion = 0;
    if (candidate.scores.denseRank) {
      fusion += 1 / (k + candidate.scores.denseRank);
    }
    if (candidate.scores.lexicalRank) {
      fusion += 1 / (k + candidate.scores.lexicalRank);
    }
    if (candidate.scores.exactRank) {
      fusion += 1 / (k + candidate.scores.exactRank);
    }
    fused.push({
      ...candidate,
      scores: { ...candidate.scores, fusion },
    });
  }
  fused.sort((left, right) => (right.scores.fusion ?? 0) - (left.scores.fusion ?? 0));
  return fused.map((item, index) => ({
    ...item,
    scores: { ...item.scores, fusionRank: index + 1 },
  }));
}
