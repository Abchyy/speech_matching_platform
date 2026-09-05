import { defaultChunkRepository } from "../src/lib/corpus";
import { HashEmbeddingClient } from "../src/lib/embedding";
import { buildMemoryIndex } from "../src/lib/index";
import { generateDiscourseAssets } from "../src/lib/services/assets";
import { resolveQuoteFromEvidenceRef } from "../src/lib/services/evidence";
import { recommendSpeechesWithDiagnostics } from "../src/lib/services/matching";
import { generateScenarioMaterial } from "../src/lib/services/material";
import { generateEnterpriseProfileFallback } from "../src/lib/services/profile-llm";
import { IdentityReranker } from "../src/lib/services/rerank";

async function main() {
  const repo = defaultChunkRepository;
  const snapshot = repo.getSnapshot?.();
  if (!snapshot) {
    throw new Error("缺少 corpus snapshot");
  }
  const embedding = new HashEmbeddingClient();
  const { registry, store } = await buildMemoryIndex({
    chunks: repo.listAll(),
    snapshot,
    embeddingClient: embedding,
    dimensions: 64,
  });
  const writesBefore = store.writeCount;
  const generated = generateEnterpriseProfileFallback({
    rawCompanyDescription:
      "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
    companyName: "示例智造",
    industry: "汽车制造",
    techDomains: ["工业具身智能", "人工智能"],
  });
  if (!generated.fallback || generated.generator !== "rules-fallback") {
    throw new Error("fallback 未显式标记");
  }

  const result = await recommendSpeechesWithDiagnostics(generated.profile, {
    chunkRepository: repo,
    embeddingClient: embedding,
    vectorStore: store,
    indexRegistry: registry,
    retrievalMode: "hybrid",
    enableRerank: true,
    reranker: new IdentityReranker(),
  });
  if (store.writeCount !== writesBefore) {
    throw new Error("查询路径写入了索引");
  }
  if (result.recommendations.length === 0) {
    throw new Error("推荐为空");
  }

  let quoteOk = 0;
  for (const item of result.recommendations) {
    const quote = resolveQuoteFromEvidenceRef(item.evidenceRef, repo);
    if (quote !== item.quote) {
      throw new Error(`quote 不一致: ${item.chunkId}`);
    }
    quoteOk += 1;
  }

  const selected = result.recommendations.slice(0, 2).map((item) => item.evidenceRef);
  const assets = await generateDiscourseAssets(generated.profile, selected, {
    chunkRepository: repo,
    generator: {
      async generate({ selectedEvidence }) {
        return {
          technologyInnovation: [
            {
              title: "以智能技术服务制造现场",
              text: "企业将工业具身智能用于汽车制造柔性生产。",
              profileEvidenceIds: ["tech_1"],
              evidenceChunkIds: [selectedEvidence[0]?.chunk.chunkId],
            },
          ],
          industryValue: [],
          socialValue: [],
          developmentPositioning: [],
        };
      },
    },
  });
  const material = await generateScenarioMaterial({
    confirmedProfile: generated.profile,
    selectedEvidenceRefs: selected,
    confirmedAssets: assets,
    scenario: "government_symposium",
    options: {
      chunkRepository: repo,
      generator: {
        async generate({ confirmedAssets, selectedEvidence }) {
          return {
            title: "座谈发言",
            body: "基于已确认资产作介绍。",
            usedAssetIds: [confirmedAssets[0]?.id],
            evidenceChunkIds: [selectedEvidence[0]?.chunkId],
          };
        },
      },
    },
  });
  const usedQuotes = assets.technologyInnovation.flatMap((asset) =>
    asset.evidenceRefs.map((ref) => resolveQuoteFromEvidenceRef(ref, repo)),
  );
  if (usedQuotes.length === 0 || !usedQuotes.every((quote) => material.body.includes(quote))) {
    throw new Error("材料缺少 Canonical Quote");
  }

  const active = await registry.getActive();
  console.log("E2E_TEST_PROVIDER=ok");
  console.log(`chunks=${repo.listAll().length}`);
  console.log(`indexVersion=${active?.manifest.indexVersion ?? ""}`);
  console.log(`recs=${result.recommendations.length}`);
  console.log(`quoteConsistency=${quoteOk}/${result.recommendations.length}`);
  console.log(`fallback=${generated.fallback}`);
  console.log(`queryWrites=${store.writeCount - writesBefore}`);
  console.log("happyPathTop:");
  for (const [index, item] of result.recommendations.entries()) {
    console.log(`  ${index + 1} ${item.relevance} ${item.chunkId} ${item.title.slice(0, 80)}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
