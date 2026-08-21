import { defaultChunkRepository } from "../src/lib/corpus";
import { DashScopeEmbeddingClient } from "../src/lib/embedding";
import { resolveQuoteFromEvidenceRef, toFullChunkEvidenceRef } from "../src/lib/services/evidence";
import { retrieveRelevantChunks } from "../src/lib/services/retrieval";
import { LanceDbVectorStore } from "../src/lib/vector";

const QUERIES = [
  "工业具身智能创业公司，面向汽车制造，用视觉语言模型和机器人控制提升柔性生产",
  "新能源电池与智能制造企业，推进绿色低碳和产业转型升级",
  "民营中小制造企业数字化转型，希望增强企业信心并服务实体经济",
];

function preview(text: string, max = 80): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= max ? compact : `${compact.slice(0, max)}…`;
}

async function main() {
  const chunkRepository = defaultChunkRepository;
  const embeddingClient = new DashScopeEmbeddingClient();
  const vectorStore = new LanceDbVectorStore();

  console.log(`Runtime chunks=${chunkRepository.listAll().length}`);
  console.log("Query → Vector Search → EvidenceRef quote backfill");

  for (const [queryIndex, query] of QUERIES.entries()) {
    console.log(`\n=== Query ${queryIndex + 1} ===`);
    console.log(`  ${query}`);
    const retrieved = await retrieveRelevantChunks(query, {
      topK: 5,
      embeddingClient,
      vectorStore,
      chunkRepository,
    });
    console.log(`  hits=${retrieved.length}`);

    for (const [index, entry] of retrieved.entries()) {
      const evidenceRef = toFullChunkEvidenceRef(entry.chunk);
      const quote = resolveQuoteFromEvidenceRef(evidenceRef, chunkRepository);
      if (quote !== entry.chunk.text) {
        throw new Error(`quote 与 Canonical Chunk 不一致: ${entry.chunk.chunkId}`);
      }
      if (evidenceRef.startIndex !== 0 || evidenceRef.endIndex !== entry.chunk.text.length) {
        throw new Error(`EvidenceRef 不是完整 Chunk: ${entry.chunk.chunkId}`);
      }
      console.log(
        `\n  [${index + 1}] score=${entry.score.toFixed(4)} chunkId=${entry.chunk.chunkId}`,
      );
      console.log(`      speechId=${evidenceRef.speechId}`);
      console.log(
        `      evidenceRef=[${evidenceRef.startIndex}, ${evidenceRef.endIndex}) length=${entry.chunk.text.length}`,
      );
      console.log(`      title=${entry.chunk.title}`);
      console.log(`      quoteBackfillOk=${quote === entry.chunk.text}`);
      console.log(`      quotePreview=${preview(quote)}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
