import type {
  DiscourseAssets,
  EvidenceRef,
  GeneratedMaterial,
  Scenario,
} from "../schemas";

const scenarioTitles: Record<Scenario, string> = {
  leadership_research: "企业调研汇报稿（占位）",
  government_symposium: "政企座谈发言稿（占位）",
  government_coordination: "政府部门对接介绍材料（占位）",
};

export function generateMaterialPlaceholder(input: {
  selectedEvidenceRefs: EvidenceRef[];
  confirmedAssets: DiscourseAssets;
  scenario: Scenario;
}): GeneratedMaterial {
  const usedSpeechIds = [
    ...new Set(input.selectedEvidenceRefs.map((ref) => ref.speechId)),
  ];

  return {
    placeholder: true,
    scenario: input.scenario,
    title: scenarioTitles[input.scenario],
    body: "场景化材料生成尚未接入。后续将基于已确认企业画像、已确认 EvidenceRef 和已确认话语资产生成，并由程序按 EvidenceRef 回填原文。",
    usedAssetIds: [],
    usedSpeechIds,
    usedEvidenceRefs: input.selectedEvidenceRefs,
  };
}
