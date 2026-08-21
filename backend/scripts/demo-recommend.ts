import { defaultChunkRepository } from "../src/lib/corpus";
import { DashScopeEmbeddingClient } from "../src/lib/embedding";
import { generateEnterpriseProfile } from "../src/lib/services/profile";
import { recommendSpeeches } from "../src/lib/services/matching";
import { resolveQuoteFromEvidenceRef } from "../src/lib/services/evidence";
import { containsCanonicalFragment } from "../src/lib/services/rerank";
import { LanceDbVectorStore } from "../src/lib/vector";

async function main() {
  const profile = generateEnterpriseProfile({
    rawCompanyDescription:
      "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
    companyName: "示例智造",
    industry: "汽车制造",
    techDomains: ["工业具身智能", "人工智能"],
  });

  console.log("Query / Confirmed Profile");
  console.log("  工业具身智能 + 汽车制造 + 柔性生产");
  console.log("↓");
  console.log("Embedding + Vector Search + DeepSeek Rerank");

  const recommendations = await recommendSpeeches(profile, {
    chunkRepository: defaultChunkRepository,
    embeddingClient: new DashScopeEmbeddingClient(),
    vectorStore: new LanceDbVectorStore(),
  });

  console.log(`  recommendations=${recommendations.length}`);
  console.log("↓");
  console.log("Relevant Chunk + EvidenceRef + Reason");

  for (const [index, item] of recommendations.entries()) {
    const quote = resolveQuoteFromEvidenceRef(item.evidenceRef, defaultChunkRepository);
    if (quote !== item.quote || quote !== defaultChunkRepository.getByChunkId(item.chunkId)?.text) {
      throw new Error(`引用文本与 Canonical Chunk 不一致: ${item.chunkId}`);
    }
    if (containsCanonicalFragment(item.reason, quote)) {
      throw new Error(`推荐理由包含 Canonical 原文或连续片段: ${item.chunkId}`);
    }
    console.log(`\n[${index + 1}] ${item.relevance} chunkId=${item.chunkId}`);
    console.log(`    speechId=${item.evidenceRef.speechId}`);
    console.log(`    evidenceRef=[${item.evidenceRef.startIndex}, ${item.evidenceRef.endIndex})`);
    console.log(`    title=${item.title}`);
    console.log(`    reason=${item.reason}`);
    console.log(`    profileEvidenceIds=${item.profileEvidenceIds.join(",") || "(none)"}`);
    console.log(`    quote=${item.quote}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
