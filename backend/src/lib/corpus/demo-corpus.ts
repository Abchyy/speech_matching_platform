import type { SpeechChunk, SpeechDocument } from "../schemas";

const DEMO_SOURCE = "DEMO_PLACEHOLDER";
const DEMO_PREFIX = "【演示占位文本，非总书记讲话原文】";

const demoSpeechSciTech: SpeechDocument = {
  speechId: "demo_speech_sci_tech",
  title: "[DEMO] 科技创新与人工智能主题占位语料",
  date: "2024-01-01",
  source: DEMO_SOURCE,
  fullText: `${DEMO_PREFIX}推动人工智能与制造业深度结合，支持企业把视觉识别、机器人控制等技术用到生产现场，提高柔性制造能力。科技创新要面向实体经济，鼓励掌握关键技术的科技企业服务重点产业链。`,
  isDemoPlaceholder: true,
};

const demoSpeechIndustry: SpeechDocument = {
  speechId: "demo_speech_industry",
  title: "[DEMO] 智能制造与产业升级主题占位语料",
  date: "2024-01-02",
  source: DEMO_SOURCE,
  fullText: `${DEMO_PREFIX}发展新质生产力，需要把原创技术与应用场景结合起来，支持智能制造和工业升级。汽车等重点产业的数字化、智能化改造，是科技赋能传统产业的重要方向。`,
  isDemoPlaceholder: true,
};

const demoSpeechPrivate: SpeechDocument = {
  speechId: "demo_speech_enterprise",
  title: "[DEMO] 科技企业发展主题占位语料",
  date: "2024-01-03",
  source: DEMO_SOURCE,
  fullText: `${DEMO_PREFIX}支持科技型中小企业把自身技术能力转化为产业价值，在创新创业中服务实体经济。`,
  isDemoPlaceholder: true,
};

export const demoSpeechDocuments: SpeechDocument[] = [
  demoSpeechSciTech,
  demoSpeechIndustry,
  demoSpeechPrivate,
];

function demoChunk(input: Omit<SpeechChunk, "isDemoPlaceholder" | "source">): SpeechChunk {
  return {
    ...input,
    source: DEMO_SOURCE,
    isDemoPlaceholder: true,
  };
}

export const demoSpeechChunks: SpeechChunk[] = [
  demoChunk({
    chunkId: "demo_chunk_001",
    speechId: demoSpeechSciTech.speechId,
    chunkIndex: 0,
    title: demoSpeechSciTech.title,
    date: demoSpeechSciTech.date,
    text: `${DEMO_PREFIX}推动人工智能与制造业深度结合，支持企业把视觉识别、机器人控制等技术用到生产现场，提高柔性制造能力。`,
    keywords: ["人工智能", "制造业", "机器人", "柔性制造", "视觉识别"],
    embeddingText: `标题：${demoSpeechSciTech.title}\n\n正文：\n${DEMO_PREFIX}推动人工智能与制造业深度结合，支持企业把视觉识别、机器人控制等技术用到生产现场，提高柔性制造能力。`,
  }),
  demoChunk({
    chunkId: "demo_chunk_002",
    speechId: demoSpeechSciTech.speechId,
    chunkIndex: 1,
    title: demoSpeechSciTech.title,
    date: demoSpeechSciTech.date,
    text: `${DEMO_PREFIX}科技创新要面向实体经济，鼓励掌握关键技术的科技企业服务重点产业链。`,
    keywords: ["科技创新", "实体经济", "关键技术", "科技企业", "产业链"],
    embeddingText: `标题：${demoSpeechSciTech.title}\n\n正文：\n${DEMO_PREFIX}科技创新要面向实体经济，鼓励掌握关键技术的科技企业服务重点产业链。`,
  }),
  demoChunk({
    chunkId: "demo_chunk_003",
    speechId: demoSpeechIndustry.speechId,
    chunkIndex: 0,
    title: demoSpeechIndustry.title,
    date: demoSpeechIndustry.date,
    text: `${DEMO_PREFIX}发展新质生产力，需要把原创技术与应用场景结合起来，支持智能制造和工业升级。`,
    keywords: ["新质生产力", "智能制造", "工业升级", "应用场景"],
    embeddingText: `标题：${demoSpeechIndustry.title}\n\n正文：\n${DEMO_PREFIX}发展新质生产力，需要把原创技术与应用场景结合起来，支持智能制造和工业升级。`,
  }),
  demoChunk({
    chunkId: "demo_chunk_004",
    speechId: demoSpeechIndustry.speechId,
    chunkIndex: 1,
    title: demoSpeechIndustry.title,
    date: demoSpeechIndustry.date,
    text: `${DEMO_PREFIX}汽车等重点产业的数字化、智能化改造，是科技赋能传统产业的重要方向。`,
    keywords: ["汽车", "数字化", "智能化", "传统产业"],
    embeddingText: `标题：${demoSpeechIndustry.title}\n\n正文：\n${DEMO_PREFIX}汽车等重点产业的数字化、智能化改造，是科技赋能传统产业的重要方向。`,
  }),
  demoChunk({
    chunkId: "demo_chunk_005",
    speechId: demoSpeechPrivate.speechId,
    chunkIndex: 0,
    title: demoSpeechPrivate.title,
    date: demoSpeechPrivate.date,
    text: `${DEMO_PREFIX}支持科技型中小企业把自身技术能力转化为产业价值，在创新创业中服务实体经济。`,
    keywords: ["中小企业", "科技企业", "产业价值", "创新创业", "实体经济"],
    embeddingText: `标题：${demoSpeechPrivate.title}\n\n正文：\n${DEMO_PREFIX}支持科技型中小企业把自身技术能力转化为产业价值，在创新创业中服务实体经济。`,
  }),
];

export function getDemoChunkById(chunkId: string): SpeechChunk | undefined {
  return demoSpeechChunks.find((chunk) => chunk.chunkId === chunkId);
}
