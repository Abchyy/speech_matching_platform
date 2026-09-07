import { embeddingConfig } from "../src/lib/config";
import { defaultChunkRepository } from "../src/lib/corpus";
import { DashScopeEmbeddingClient } from "../src/lib/embedding";
import { buildAndPublishIndex, FileIndexRegistry } from "../src/lib/index";

async function main() {
  const chunkRepository = defaultChunkRepository;
  const chunks = chunkRepository.listAll();
  const snapshot = chunkRepository.getSnapshot?.();
  if (!snapshot) {
    throw new Error("缺少 corpus snapshot，无法发布索引");
  }
  const embeddingClient = new DashScopeEmbeddingClient();
  const registry = new FileIndexRegistry();

  console.log("Build and publish Canonical Chunk index");
  console.log(`  chunks=${chunks.length}`);
  console.log(`  model=${embeddingClient.model}`);
  console.log(`  corpusVersion=${snapshot.corpusVersion}`);
  console.log(`  chunkFingerprint=${snapshot.chunkFingerprint}`);
  const manifest = await buildAndPublishIndex({
    chunks,
    snapshot,
    embeddingClient,
    embeddingProvider: "dashscope",
    dimensions: embeddingConfig.dimensions,
    registry,
  });
  console.log(`  indexVersion=${manifest.indexVersion}`);
  console.log(`  recordCount=${manifest.recordCount}`);
  console.log(`  dimensions=${manifest.dimensions}`);
  console.log(`  buildStatus=${manifest.buildStatus}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
