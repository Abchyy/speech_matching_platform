import { defaultChunkRepository } from "../src/lib/corpus";
import { DashScopeEmbeddingClient } from "../src/lib/embedding";
import { toFullChunkEvidenceRef, resolveQuoteFromEvidenceRef } from "../src/lib/services/evidence";
import { ensureChunkIndex, retrieveRelevantChunks } from "../src/lib/services/retrieval";
import { LanceDbVectorStore } from "../src/lib/vector";

async function main() {
  const query = "工业具身智能、人工智能如何服务汽车制造和柔性生产";
  const chunkRepository = defaultChunkRepository;
  const embeddingClient = new DashScopeEmbeddingClient();
  const vectorStore = new LanceDbVectorStore();

  console.log("Query");
  console.log(`  ${query}`);
  console.log("↓");
  console.log("Canonical Chunks");
  const chunks = chunkRepository.listAll();
  console.log(`  ${chunks.length} demo chunks`);
  console.log("↓");
  console.log("Embedding");
  console.log(`  model=${embeddingClient.model}`);
  await ensureChunkIndex(chunkRepository, embeddingClient, vectorStore);
  console.log(`  indexed=${(await vectorStore.listChunkIds()).length}`);
  console.log("↓");
  console.log("Vector Search");
  const retrieved = await retrieveRelevantChunks(query, {
    topK: 5,
    embeddingClient,
    vectorStore,
    chunkRepository,
  });
  console.log(`  hits=${retrieved.length}`);
  console.log("↓");
  console.log("Relevant Chunk + EvidenceRef");

  for (const [index, entry] of retrieved.entries()) {
    const evidenceRef = toFullChunkEvidenceRef(entry.chunk);
    const quote = resolveQuoteFromEvidenceRef(evidenceRef, chunkRepository);
    if (quote !== entry.chunk.text) {
      throw new Error(`引用文本与 Canonical Chunk 不一致: ${entry.chunk.chunkId}`);
    }
    console.log(`\n[${index + 1}] score=${entry.score.toFixed(4)} chunkId=${entry.chunk.chunkId}`);
    console.log(`    speechId=${evidenceRef.speechId}`);
    console.log(`    evidenceRef=[${evidenceRef.startIndex}, ${evidenceRef.endIndex})`);
    console.log(`    title=${entry.chunk.title}`);
    console.log(`    quote=${quote}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
