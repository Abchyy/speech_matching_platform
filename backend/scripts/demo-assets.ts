import { defaultChunkRepository } from "../src/lib/corpus";
import { generateDiscourseAssets, enterprisePortion } from "../src/lib/services/assets";
import { containsCanonicalFragment } from "../src/lib/services/canonical-text";
import { toFullChunkEvidenceRef, resolveQuoteFromEvidenceRef } from "../src/lib/services/evidence";
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

  console.log("Confirmed Profile + Selected EvidenceRef");
  console.log(`  evidence=${selectedRefs.map((ref) => ref.chunkId).join(", ")}`);
  console.log("↓");
  console.log("DeepSeek DiscourseAssets");

  const assets = await generateDiscourseAssets(profile, selectedRefs);
  const dimensions = [
    ["technologyInnovation", assets.technologyInnovation],
    ["industryValue", assets.industryValue],
    ["socialValue", assets.socialValue],
    ["developmentPositioning", assets.developmentPositioning],
  ] as const;

  for (const [name, items] of dimensions) {
    console.log(`\n[${name}] count=${items.length}`);
    for (const asset of items) {
      for (const ref of asset.evidenceRefs) {
        const quote = resolveQuoteFromEvidenceRef(ref, defaultChunkRepository);
        if (!asset.text.includes(quote)) {
          throw new Error(`程序未回填 Canonical 原文: ${asset.id}`);
        }
        if (containsCanonicalFragment(enterprisePortion(asset.text), quote)) {
          throw new Error(`企业表达混入 Canonical 原文: ${asset.id}`);
        }
      }
      console.log(`  - ${asset.title}`);
      console.log(`    evidenceRefs=${asset.evidenceRefs.map((ref) => ref.chunkId).join(",")}`);
      console.log(`    profileEvidenceIds=${asset.profileEvidenceIds.join(",") || "(none)"}`);
      console.log(`    text=${asset.text}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
