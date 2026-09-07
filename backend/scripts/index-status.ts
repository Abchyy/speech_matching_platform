import { embeddingConfig } from "../src/lib/config";
import { defaultChunkRepository } from "../src/lib/corpus";
import { FileIndexRegistry } from "../src/lib/index";

async function main() {
  const snapshot = defaultChunkRepository.getSnapshot?.();
  const registry = new FileIndexRegistry();
  const active = await registry.getActive();
  const previous = await registry.getPrevious();
  console.log("Index status");
  console.log(`  corpusVersion=${snapshot?.corpusVersion ?? ""}`);
  console.log(`  chunkFingerprint=${snapshot?.chunkFingerprint ?? ""}`);
  console.log(`  chunkCount=${snapshot?.chunkCount ?? 0}`);
  if (!active) {
    console.log("  active=missing");
    process.exitCode = 2;
    return;
  }
  console.log(`  activeVersion=${active.manifest.indexVersion}`);
  console.log(`  activeStatus=${active.manifest.buildStatus}`);
  console.log(`  activeModel=${active.manifest.embeddingModel}`);
  console.log(`  activeRecords=${active.manifest.recordCount}`);
  console.log(`  previousVersion=${previous?.indexVersion ?? "none"}`);
  try {
    if (!snapshot) {
      throw new Error("缺少 corpus snapshot");
    }
    await registry.assertReadyForQuery(
      snapshot,
      {
        provider: "dashscope",
        model: embeddingConfig.model,
        dimensions: embeddingConfig.dimensions,
      },
      defaultChunkRepository.listAll().map((chunk) => chunk.chunkId),
    );
    console.log("  ready=true");
  } catch (error) {
    console.log(`  ready=false`);
    console.log(`  error=${error instanceof Error ? error.message : error}`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
