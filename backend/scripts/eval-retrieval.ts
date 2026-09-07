import fs from "node:fs";
import path from "node:path";
import { defaultChunkRepository } from "../src/lib/corpus";
import { decideKeepReject, runExperiment, type ExperimentReport } from "../src/lib/evaluation/harness";

async function main() {
  const chunkRepository = defaultChunkRepository;
  const experiments = [
    {
      name: "dense-baseline",
      retrievalMode: "dense" as const,
      enableQueryHints: false,
      enableRerank: false,
      changedVariable: "channel=dense",
    },
    {
      name: "dense-lexical",
      retrievalMode: "hybrid" as const,
      enableQueryHints: false,
      enableRerank: false,
      changedVariable: "channel=dense+lexical+exact+rrf",
    },
    {
      name: "hybrid-hints",
      retrievalMode: "hybrid" as const,
      enableQueryHints: true,
      enableRerank: false,
      changedVariable: "queryHints=on",
    },
    {
      name: "hybrid-rerank-identity",
      retrievalMode: "hybrid" as const,
      enableQueryHints: false,
      enableRerank: true,
      changedVariable: "rerank=identity",
    },
  ];

  const reports: ExperimentReport[] = [];
  let baseline: ExperimentReport | undefined;
  for (const config of experiments) {
    const report = await runExperiment({ chunkRepository, config });
    const decided = baseline ? decideKeepReject(baseline, report) : { ...report, decision: "KEEP" as const, decisionReason: "baseline" };
    if (!baseline) baseline = decided;
    reports.push(decided);
    console.log(
      `${decided.name} decision=${decided.decision} provisionalKeywordHit@K=${decided.aggregate.provisionalKeywordHitAtK.toFixed(3)} mrr=${decided.aggregate.mrr.toFixed(3)} ndcg=${decided.aggregate.ndcgAtK.toFixed(3)} obviousError@5=${decided.aggregate.obviousErrorAt5.toFixed(3)} quote=${decided.aggregate.canonicalQuoteConsistency} zeroRecall=${decided.aggregate.zeroRecall}`,
    );
  }

  const outDir = path.resolve(process.cwd(), "evaluation", "reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `retrieval-eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        goldKind: "provisional",
        humanReview: "PENDING HUMAN REVIEW",
        note: "provisionalKeywordHitAtK 不是人工 gold 上的真实 Recall。默认检索模式为 dense。",
        embedding: "hash-embedding-test",
        defaultRetrievalMode: "dense",
        reports,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
