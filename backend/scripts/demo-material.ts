import { defaultChunkRepository } from "../src/lib/corpus";
import { generateDiscourseAssets } from "../src/lib/services/assets";
import { containsCanonicalFragment, hasStripArtifacts } from "../src/lib/services/canonical-text";
import { resolveQuoteFromEvidenceRef, toFullChunkEvidenceRef } from "../src/lib/services/evidence";
import {
  enterpriseBodyWithoutQuotes,
  generateScenarioMaterial,
} from "../src/lib/services/material";
import { generateEnterpriseProfile } from "../src/lib/services/profile";

async function main() {
  const profile = generateEnterpriseProfile({
    rawCompanyDescription:
      "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
    companyName: "示例智造",
    industry: "汽车制造",
    techDomains: ["工业具身智能", "人工智能"],
  });
  const selectedRefs = defaultChunkRepository
    .listAll()
    .slice(0, 2)
    .map((chunk) => toFullChunkEvidenceRef(chunk));
  const quotes = selectedRefs.map((ref) => resolveQuoteFromEvidenceRef(ref, defaultChunkRepository));

  console.log("Confirmed Profile + Selected EvidenceRef + Confirmed DiscourseAssets");
  console.log(`  evidence=${selectedRefs.map((ref) => ref.chunkId).join(", ")}`);
  const assets = await generateDiscourseAssets(profile, selectedRefs);
  console.log("↓");
  console.log("DeepSeek GeneratedMaterial (leadership_research)");

  const material = await generateScenarioMaterial({
    confirmedProfile: profile,
    selectedEvidenceRefs: selectedRefs,
    confirmedAssets: assets,
    scenario: "leadership_research",
    additionalRequirements: "本次为地方主管部门到企业调研，请控制在可口头汇报的篇幅。",
  });

  const enterprise = enterpriseBodyWithoutQuotes(material.body, quotes);
  for (const ref of material.usedEvidenceRefs) {
    const quote = resolveQuoteFromEvidenceRef(ref, defaultChunkRepository);
    if (!material.body.includes(quote)) {
      throw new Error(`程序未回填 Canonical 原文: ${ref.chunkId}`);
    }
    if (containsCanonicalFragment(enterprise, quote)) {
      throw new Error(`企业表达混入 Canonical 原文: ${ref.chunkId}`);
    }
  }
  if (material.usedAssetIds.length === 0) {
    throw new Error("材料未复用已确认话语资产");
  }
  if (hasStripArtifacts(material.title) || hasStripArtifacts(enterprise.replaceAll("\n", ""))) {
    throw new Error("非引用标题或正文仍有剥离残缺");
  }

  console.log(`  scenario=${material.scenario}`);
  console.log(`  title=${material.title}`);
  console.log(`  usedAssetIds=${material.usedAssetIds.join(",")}`);
  console.log(`  usedEvidenceRefs=${material.usedEvidenceRefs.map((ref) => ref.chunkId).join(",")}`);
  console.log(`  usedSpeechIds=${material.usedSpeechIds.join(",")}`);
  console.log("----- body -----");
  console.log(material.body);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
