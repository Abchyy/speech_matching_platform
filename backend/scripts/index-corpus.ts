import { defaultChunkRepository } from "../src/lib/corpus";
import { DashScopeEmbeddingClient } from "../src/lib/embedding";
import { indexChunksWithStats } from "../src/lib/services/retrieval";
import { defaultLanceDbUri, LanceDbVectorStore } from "../src/lib/vector";

async function main() {
  const chunkRepository = defaultChunkRepository;
  const chunks = chunkRepository.listAll();
  const uri = defaultLanceDbUri();
  const embeddingClient = new DashScopeEmbeddingClient();
  const vectorStore = new LanceDbVectorStore(uri);

  console.log("Index Canonical Chunks");
  console.log(`  chunks=${chunks.length}`);
  console.log(`  model=${embeddingClient.model}`);
  const stats = await indexChunksWithStats(chunks, embeddingClient, vectorStore, uri);
  console.log(`  dimensions=${stats.dimensions}`);
  console.log(`  batchSize=${stats.batchSize}`);
  console.log(`  batchCount=${stats.batchCount}`);
  console.log(`  recordCount=${stats.recordCount}`);
  console.log(`  uri=${stats.uri}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
