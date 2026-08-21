import type { DiscourseAssets, EvidenceRef } from "../schemas";

export function generateAssetsPlaceholder(
  selectedEvidenceRefs: EvidenceRef[],
): DiscourseAssets & { selectedEvidenceCount: number } {
  return {
    placeholder: true,
    technologyInnovation: [],
    industryValue: [],
    socialValue: [],
    developmentPositioning: [],
    selectedEvidenceCount: selectedEvidenceRefs.length,
  };
}
