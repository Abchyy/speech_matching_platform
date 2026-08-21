import { preflightCanonicalCorpus } from "../src/lib/corpus";

function main() {
  const report = preflightCanonicalCorpus();
  console.log("Canonical preflight");
  console.log(`  directory=${report.canonicalDirectory}`);
  console.log(`  documents=${report.documentCount}`);
  console.log(`  runtimeDocuments=${report.runtimeDocumentCount}`);
  console.log(`  runtimeChunks=${report.chunkCount}`);
  console.log(`  sha256Verified=${report.sha256Verified}`);
  console.log(`  substringVerified=${report.substringVerified}`);
  console.log(`  uniqueSpeechIds=${report.uniqueSpeechIds}`);
  console.log(`  uniqueChunkIds=${report.uniqueChunkIds}`);
  console.log(`  dropped=${report.droppedCount}`);
  if (report.dedupPolicy) {
    console.log(`  dedupPolicy=${report.dedupPolicy}`);
  }
  for (const item of report.dropped) {
    console.log(`  - ${item.speechId} -> ${item.keep} (${item.reason})`);
  }
}

main();
