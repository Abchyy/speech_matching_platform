# AI 科技企业总书记重要讲话智能匹配与政企沟通材料平台
## 技术架构文档（Technical Architecture）v0.1

> **项目**：AI黑客松-第二次模拟  
> **文档状态**：当前技术开发基线 / 可迭代  
> **适用阶段**：5小时 MVP 开发  
> **产品依据**：`docs/product_requirement.md`  
> **技术目标**：以最小必要技术复杂度，稳定跑通“企业画像 → 总书记重要讲话匹配 → 人工勾选 → 企业话语资产 → 场景化文字材料”的完整闭环。  
> **决策原则**：已人工确认的技术与产品约束可直接沿用；尚未冻结的产品字段、数量、页面形式和实验参数，不得由 Coding Agent 擅自冻结。  
> **本版校正**：补充 EvidenceRef、语料四层模型、引用程序回填协议，以及开发阶段可用小规模语料启动技术链路的说明。MVP 已冻结为 Chunk 级 Evidence，不支持 Chunk 内 Span 选择。产品定位、核心工作流与 RAG 技术路线不变。

---

# 1. 技术架构目标

本系统不是通用聊天机器人，也不是单纯讲话搜索库。

MVP 技术架构必须支撑以下完整工作流：

```text
用户输入企业介绍
        ↓
DeepSeek 生成结构化企业画像
        ↓
用户修改并确认
        ↓
Qwen3.7 Text Embedding 生成查询向量
        ↓
LanceDB 本地向量检索
        ↓
DeepSeek Rerank + 推荐理由
        ↓
用户人工勾选总书记重要讲话
        ↓
DeepSeek 生成结构化企业话语资产
        ↓
用户修改并确认
        ↓
用户选择场景 + 补充自然语言要求
        ↓
DeepSeek 生成最终文字材料
```

用户勾选环节在数据协议上落地为确认 `EvidenceRef[]`：检索与勾选以 Chunk 为最小证据单位，后续生成必须基于已确认 Evidence，而不得仅依赖 `speechId`。

架构设计优先保证：

1. 总书记原文绝对准确；
2. 企业事实不漂移；
3. 讲话推荐具有真实语义相关性；
4. 关键环节有人在回路（Human-in-the-loop）；
5. 中间结果结构化、可检查、可修改；
6. 整个系统可在 5 小时 MVP 开发中完成并稳定演示。

---

# 2. 最高优先级硬约束：总书记原文不可修改

本约束优先级高于所有其他 Prompt、生成效果、UI 体验和开发便利性。

## 2.1 Canonical Quote 原则

**凡在系统中被标记、展示或引用为“总书记原文”“总书记重要讲话原文”“总书记重要论述原文”的文本，必须与权威原始语料逐字、逐标点完全一致。**

不得：

- 修改任何一个汉字；
- 修改任何一个数字；
- 修改任何一个标点符号；
- 修改引号、冒号、分号等符号；
- 进行同义改写；
- 进行润色；
- 进行简繁转换；
- 自动替换全角/半角字符；
- 用 AI “复述”后冒充原文；
- 凭模型记忆生成总书记原话。

## 2.2 原文必须由程序抽取，而不是由 LLM 生成

**LLM 不直接生成总书记讲话原文。** 模型只产出结构化字段与企业表达；凡需展示或写入材料的总书记原文，一律由程序按 EvidenceRef 从 Canonical Source 回填。

推荐流程：

```text
检索
 ↓
EvidenceRef
 ↓
用户确认
 ↓
LLM生成结构化内容
 ↓
程序根据 EvidenceRef 回填原文
```

实现原则：

```text
LLM
↓
只返回 EvidenceRef（speechId / chunkId / startIndex / endIndex）
↓
程序
↓
从 Canonical Chunk 读取原始字符串并 slice
↓
原样展示 / 原样插入材料
```

避免：

- 模型自由生成引用；
- 模型“凭记忆”复述原话；
- 把 LLM 输出的字符串当作 Canonical Quote。

LLM 不承担“生成总书记原话”的职责。

## 2.3 直接引用校验

MVP 阶段冻结为 Chunk 级 Evidence：用户确认完整 Chunk，不支持 Chunk 内 Span 选择。引用校验仍按 EvidenceRef 从 Chunk `text` 抽取：

```ts
canonicalText.includes(quote) === true
```

正式协议保存为 EvidenceRef：

```ts
{
  speechId: string
  chunkId: string
  startIndex: number
  endIndex: number
}
```

并由程序直接执行：

```ts
const canonicalText = chunk.text
quote = canonicalText.slice(startIndex, endIndex)
```

`startIndex` / `endIndex` 相对于该 Chunk 的 Canonical `text`，而不是整篇 `fullText`。MVP 中确认整个 Chunk，因此 `startIndex = 0` 且 `endIndex = chunk.text.length`。

避免 LLM 重新输出引用字符串。

## 2.4 Canonical Document 只读

Raw Capture 可保留采集噪声，但不得作为引用源。讲话正文经清洗确认进入 Canonical Document 后，应视为只读 Canonical Source。

建议在建库时保存 SHA-256：

```text
raw speech text
        ↓
SHA-256
        ↓
保存 provenance hash
```

用于发现后续处理流程中的意外修改。

## 2.5 三类文本必须严格区分

系统内部至少区分：

```text
A. Canonical Quote
总书记原文
→ 只读、不可改写、程序直接抽取

B. Interpretation
对讲话主题的解释
→ AI 可以生成，但不得标记为总书记原话

C. Enterprise Expression
企业话语资产 / 最终材料
→ AI 可以生成，但不得伪装为总书记原话
```

**任何生成层不得污染 Canonical Quote。**

---

# 3. 总体技术栈

当前建议的 MVP 技术栈如下。

| 模块 | 当前技术选择 | 状态 |
|---|---|---|
| Web Framework | Next.js + TypeScript | 当前基线 |
| UI | Tailwind CSS + shadcn/ui | 当前基线 |
| 后端 API | Next.js Route Handlers / Server-side API | 当前基线 |
| 主 LLM | DeepSeek V4 Flash | 已讨论认可 |
| Embedding | Qwen3.7 Text Embedding API | 已确认 |
| 本地向量库 | LanceDB | 已确认 |
| Schema Validation | Zod | 当前基线 |
| RAG Framework | 自研轻量 Pipeline | 当前基线 |
| Agent Framework | 不引入 | 当前基线 |
| Workflow Engine | 不引入 | 当前基线 |
| 业务数据库 | MVP 暂不引入正式 DB | 当前基线 |
| 本地状态 | React State；必要时 localStorage | 当前基线 |
| 部署模式 | Local-first Demo | 当前基线 |

MVP 阶段不引入：

- LangChain；
- LangGraph；
- 多 Agent；
- 知识图谱；
- Milvus；
- Elasticsearch；
- Redis；
- 微服务；
- 模型微调；
- 自动网页爬虫系统；
- 复杂权限体系；
- PPT 自动生成。

---

# 4. 总体系统架构

```text
                           ┌─────────────────────────┐
                           │       Next.js Web       │
                           │    React + TypeScript   │
                           └────────────┬────────────┘
                                        │
                         Human-in-the-loop 操作
                                        │
                ┌───────────────────────┼───────────────────────┐
                │                       │                       │
                ↓                       ↓                       ↓
       企业画像生成/编辑          讲话检索与选择          话语资产/材料生成
                │                       │                       │
                ↓                       ↓                       ↓
       DeepSeek V4 Flash      Qwen3.7 Embedding API     DeepSeek V4 Flash
                                        │
                                        ↓
                                  Query Vector
                                        │
                                        ↓
                               LanceDB Local Vector DB
                                        │
                                        ↓
                                Candidate Speech Chunks
                                        │
                                        ↓
                               DeepSeek V4 Flash Rerank
                                        │
                                        ↓
                             排序 + 关联强度 + 推荐理由
```

---

# 5. 部署策略

## 5.1 MVP：Local-first

由于当前向量数据库选择 LanceDB 本地文件模式，MVP 优先采用：

```text
Browser
   ↓
localhost:3000
   ↓
Next.js Node Runtime
   ↓
./data/lancedb
```

即：

> **在一台开发电脑本地完整运行并进行 Demo。**

这样可以避免在 5 小时 MVP 中额外解决云端持久化向量存储、Serverless 文件系统等问题。

## 5.2 公网部署

如果比赛或演示最终明确要求公网 URL，需要重新确认：

- LanceDB 的持久化方式；
- 是否改为云端向量服务；
- 是否将 Web 与数据服务分离；
- 运行环境是否提供持久磁盘。

**在明确需求前，不提前复杂化。**

---

# 6. 总书记讲话语料数据模型

系统将语料处理为四层，不得混用：

```text
Raw Capture
    ↓
Canonical Document
    ↓
Chunk
    ↓
EvidenceRef
```

- **Raw Capture**：原始采集数据，保留抓取现场（含网页噪声、原始 Markdown、采集 metadata）。
- **Canonical Document**：经过清洗与确认后的权威正文。
- **Chunk**：从 Canonical Document 派生的检索单元。
- **EvidenceRef**：用户确认和引用追溯单位。MVP 指向完整 Chunk 对应的 Canonical 文本，偏移基于该 Chunk 的 `text`。

强调：

> **Canonical Document 中的总书记讲话原文不可修改。**

Chunk 与 EvidenceRef 都是派生数据，只能切片或引用 Canonical 正文，不得反向改写原文。

## 6.1 Raw Capture

代表采集阶段落盘的原始记录，不等同于可引用正文。

```ts
type RawCapture = {
  speechId: string
  title: string
  date: string | null
  source: string
  url?: string
  rawMarkdown: string
  retrievedAt?: string
  retrievalKeywords?: string[]
}
```

Raw Capture 允许保留网页噪声，供清洗与抽查；不得直接作为 Canonical Quote，也不得作为生成引用源。

## 6.2 SpeechDocument（Canonical Document）

代表一篇经过确认的权威讲话或重要论述正文。

```ts
type SpeechDocument = {
  speechId: string
  title: string
  date: string | null
  source: string
  url?: string
  fullText: string
  sha256?: string
}
```

最低必要 provenance：

- `speechId`
- `title`
- `date`
- `source`
- `fullText`

`fullText` 为 Canonical Quote Source。进入 Canonical 后：

- 不得改写任何一个汉字、数字或标点；
- 后续 Chunk / EvidenceRef 只能引用或切片，不能回写修改。

`url` 强烈建议保留，但首版是否要求所有记录必须存在 URL，由团队根据语料源人工确认。

## 6.3 SpeechChunk

代表真正进入 Embedding 和向量检索的语义单元，是检索结果的最小证据单位。

```ts
type SpeechChunk = {
  chunkId: string
  speechId: string
  chunkIndex: number

  title: string
  date: string | null
  source: string
  url?: string

  text: string
  keywords: string[]

  embeddingText: string
  vector: number[]
}
```

其中：

- `text`：从 Canonical Document 按字符原样切出的片段，只保存未经改写的原始文本；
- `embeddingText`：仅用于检索优化；
- `vector`：Qwen Embedding 产生的向量；
- `keywords`：辅助展示 metadata，不属于总书记原话。

推荐列表展示的是候选 Chunk，而不是仅按篇的 Speech。

## 6.4 EvidenceRef

所有总书记讲话引用必须来自可追溯原文。系统用 EvidenceRef 表达“引用了哪一篇、哪一个 Chunk”。

MVP 阶段冻结：

- 采用 Chunk 级 Evidence；
- 用户确认粒度为完整 Chunk；
- 不支持 Chunk 内 Span 选择；
- EvidenceRef 的 offset 基于 Chunk `text`。

```ts
type EvidenceRef = {
  speechId: string
  chunkId: string
  startIndex: number
  endIndex: number
}
```

字段含义：

- `speechId`：所属 Canonical Document；
- `chunkId`：所属检索 Chunk；
- `startIndex` / `endIndex`：相对该 Chunk Canonical `text` 的字符区间（半开区间 `[startIndex, endIndex)`）。

MVP 中确认整个 Chunk，因此固定为：

```ts
startIndex = 0
endIndex = chunk.text.length
```

引用抽取必须由程序执行：

```ts
quote = chunk.text.slice(startIndex, endIndex)
```

约束：

1. 检索结果以 Chunk 为最小证据单位；
2. 用户确认的是 Evidence，而不是仅仅 Speech；
3. 后续生成流程必须基于已确认 `EvidenceRef[]`；
4. LLM 不得输出总书记原文，只可返回 EvidenceRef，由程序回填原文。

未来版本可根据产品需求扩展到 Chunk 内 Span 选择；该能力不在 MVP 范围，不得在当前阶段实现。

## 6.5 语料规模与开发启动条件

第一版产品语料库目标保持：

```text
约100篇总书记讲话语料
```

该目标用于产品能力覆盖，不删除、不下调。

开发阶段允许先使用：

- 小规模黄金语料；
- Demo 测试语料；

优先验证：

- 检索；
- 匹配；
- 引用；
- 生成闭环。

约 100 篇完整语料是产品能力扩展目标，**不作为技术链路启动的阻塞条件**。清洗、Chunk、Embedding、LanceDB、EvidenceRef 回填与生成 Pipeline 可在小规模语料上先跑通，再扩展至约 100 篇。

---

# 7. 语料清洗与 Chunking

## 7.1 清洗原则

允许清除：

- 网页导航；
- 广告；
- 页面按钮文字；
- 无关版权提示；
- 明显抓取噪声；
- 与正文无关的页面元素。

不得对讲话正文做：

- LLM 润色；
- 同义替换；
- 摘要替代；
- 标点规范化；
- 简繁转换；
- 任何会改变 Canonical Quote 字符序列的操作。

必要的网页清洗必须在进入 Canonical Source 前完成，并经过人工抽查。

## 7.2 Chunk 策略

采用：

> **自然段 / 语义段优先 + 长度约束**

基本规则：

1. 单个自然段长度合适 → 直接作为一个 Chunk；
2. 多个自然段过短 → 可合并相邻自然段；
3. 单个自然段过长 → 按句号、分号和自然语义边界二次拆分；
4. 不允许从句子中间机械截断；
5. 语义完整性优先于固定长度。

开发初始参考范围：

> 约 300–800 个中文字符 / Chunk。

该数字属于**可调工程参数，不冻结**。

## 7.3 Overlap

MVP 初始策略：

> 不设置固定 overlap，优先依靠自然段边界。

原因是减少同一篇讲话的重复结果。

如实际检索测试证明存在明显上下文丢失，再局部调整。

---

# 8. Embedding 建库方案

## 8.1 Embedding 模型

使用：

> **Qwen3.7 Text Embedding API**

不在本地部署小型 Embedding 模型。

原因：

- 讲话匹配属于核心产品能力；
- 企业技术语言与政治/产业表述之间存在跨表达体系语义匹配；
- 优先追求召回质量，而非节省极低的 Embedding 成本。

## 8.2 建库阶段

```text
Raw Capture
      ↓
Canonical SpeechDocument
      ↓
Chunk
      ↓
构造 embeddingText
      ↓
Qwen3.7 Text Embedding API
      ↓
Vector
      ↓
LanceDB
```

讲话语料仅在首次建库或语料变更时重新 Embedding。EvidenceRef 不写入建库结果，只在检索与生成时按 Chunk 构造。

## 8.3 embeddingText

`embeddingText` 与 Canonical `text` 分离。

示例：

```text
标题：习近平在……的重要讲话

正文：
<原始 Chunk 文本>
```

Embedding 输入可以为提高检索效果进行结构组织，但**不得覆盖原始 `text`**。

---

# 9. LanceDB 本地向量数据库

LanceDB 负责存储：

```text
speech metadata
+
canonical chunk text
+
embedding metadata
+
vector
```

建议目录：

```text
project/
├── data/
│   └── lancedb/
│       └── speeches.lance/
```

LanceDB 不承担：

- 企业画像业务状态；
- 用户登录；
- 话语资产历史管理；
- 多人协作。

其 MVP 职责只有：

> **讲话语料向量持久化 + 相似度检索。**

---

# 10. 独立 Ingestion Pipeline

建库过程必须独立于 Web 正常运行流程。

建议：

```text
scripts/
└── ingest-corpus.ts
```

执行：

```bash
npm run ingest
```

流程：

```text
读取 corpus/raw（Raw Capture）
      ↓
验证 metadata
      ↓
清洗网页噪声
      ↓
生成 Canonical SpeechDocument
      ↓
Chunk
      ↓
生成辅助 keywords
      ↓
调用 Qwen Embedding
      ↓
写入 LanceDB
      ↓
输出建库统计
```

EvidenceRef 不在建库阶段物化。它是检索、用户确认与生成引用时的运行时协议，必须指向已入库的 Canonical Chunk。

正常 Web 启动：

```bash
npm run dev
```

只负责读取已经建好的向量库。

---

# 11. 建库验收

建库成功不能只以“写入 N 条记录”为标准。

至少检查：

```text
Speech 数量
Chunk 数量
空 Chunk 数量
缺失 title 数量
缺失 source 数量
缺失 date 数量
Embedding 维度是否一致
重复 chunk 是否存在
原始文本 hash 是否可验证
```

并人工随机抽查至少若干条：

- 原文是否完整；
- 标点是否与权威来源一致；
- 标题是否正确；
- 日期是否正确；
- 来源是否正确；
- Chunk 是否保持语义完整。

---

# 12. 企业画像数据模型

企业画像采用：

> **五维结构化画像 + 维度内部开放编辑**

五个维度当前设计草案：

1. 企业定位；
2. 技术与创新能力；
3. 产品与应用；
4. 产业与市场定位；
5. 价值创造。

其设计目标是把企业从：

```text
我是谁
↓
我掌握什么
↓
我做什么
↓
我处于什么产业位置
↓
我创造什么价值
```

结构化。

该结构可参考 Business Model Canvas 对价值主张、客户、关键活动/资源的结构化思想，以及企业创新研究中对产品、业务过程和创新活动的区分，但本系统并不声称存在一个现成的“五维政企沟通企业画像理论模型”。

这是针对本任务构造的**任务型 Schema**。

## 12.1 推荐结构

```ts
type EnterpriseProfile = {
  companyPositioning: ProfileItem[]
  technologyAndInnovation: ProfileItem[]
  productsAndApplications: ProfileItem[]
  industryAndMarket: ProfileItem[]
  valueCreation: ProfileItem[]
}
```

```ts
type ProfileItem = {
  id: string
  value: string
  origin: "explicit" | "inferred"
  confidence: "high" | "medium" | "low"
}
```

其中：

- `explicit`：用户明确提供；
- `inferred`：AI 基于用户输入进行保守归纳。

## 12.2 用户控制

每个维度都必须支持：

- 修改；
- 删除；
- 新增；
- 对 AI 推断内容进行纠正；
- 最终确认。

核心原则：

> **维度结构相对固定，维度内部内容开放。**

只有用户确认后的：

> `Confirmed Enterprise Profile`

可以进入正式讲话检索。

---

# 13. Retrieval Query 构造

正式检索不得使用已经被用户修改或否定的原始企业输入。

数据源必须是：

> **Confirmed Enterprise Profile**

MVP 初始方案不额外引入 LLM Query Expansion。

而采用确定性拼接：

```text
企业定位：……
核心技术：……
核心产品：……
应用场景：……
产业定位：……
价值创造：……
```

然后：

```text
Retrieval Text
      ↓
Qwen3.7 Text Embedding
      ↓
Query Vector
```

这样可以避免 LLM 自行加入“新质生产力”等用户未确认概念，造成检索方向污染。

---

# 14. 两阶段讲话匹配算法

采用：

> **Vector Recall + LLM Rerank**

## 14.1 第一阶段：向量召回

```text
Confirmed Enterprise Profile
      ↓
Retrieval Text
      ↓
Qwen Embedding
      ↓
LanceDB Vector Search
      ↓
Top-K Candidate Chunks
```

初始开发参数：

> Top 20

该参数不冻结。

## 14.2 同源去重

向量检索后需避免同一篇讲话连续占据大量结果。

MVP 可采用：

> 同一 `speechId` 最多保留 1–2 个候选 Chunk。

具体数量属于可调参数。

## 14.3 第二阶段：DeepSeek Reranker

使用：

> **DeepSeek V4 Flash**

输入：

```text
Confirmed Enterprise Profile
+
Candidate Speech Chunks
```

Reranker 负责：

1. 最终语义相关性判断；
2. 强/中/弱/无关分类；
3. 排名；
4. 推荐理由；
5. 指出关联到企业画像的哪些字段。

建议判断维度：

- 业务相关性；
- 价值相关性；
- 具体性；
- 关联强度。

原则：

> 具体、真实关联优先于泛化政治表达。

禁止为了增强“战略感”而夸大企业与讲话的关系。

---

# 15. Reranker Structured Output

建议：

```ts
type RerankResult = {
  results: {
    chunkId: string
    relevance: "strong" | "medium" | "weak" | "irrelevant"
    reason: string
    profileEvidenceIds: string[]
  }[]
}
```

Reranker **不重新生成总书记原文**。

用户勾选后，系统将选中 Chunk 固化为 EvidenceRef。MVP 冻结为确认完整 Chunk（`startIndex = 0`，`endIndex = chunk.text.length`），不支持 Chunk 内 Span 选择。未来版本可根据产品需求扩展，但不在当前实现范围。

前端根据 `chunkId` 从 LanceDB 获取：

- 原文；
- 出处；
- 时间；
- 关键词；
- URL（如有）。

只有：

- 推荐理由；
- 关联强度；
- 画像证据映射；

由 DeepSeek 生成。

---

# 16. 企业话语资产模型

企业话语资产第一版采用四维结构：

1. 技术创新表达；
2. 产业价值表达；
3. 社会价值表达；
4. 发展定位表达。

目标不是生成大量素材，而是形成少量、可复用、可人工编辑的标准表达。

四维结构同样属于针对本产品任务构造的**任务型 Schema**，不是宣称存在一个现成的官方“四维话语资产理论”。

## 16.1 数据结构

```ts
type DiscourseAssets = {
  technologyInnovation: DiscourseAsset[]
  industryValue: DiscourseAsset[]
  socialValue: DiscourseAsset[]
  developmentPositioning: DiscourseAsset[]
}
```

```ts
type DiscourseAsset = {
  id: string
  title: string
  text: string

  profileEvidenceIds: string[]
  evidenceRefs: EvidenceRef[]
}
```

`evidenceRefs` 替代原先笼统的 speech ID 列表。话语资产中如需出现总书记原文，不得把原文写进 LLM 输出的 `text`；由程序按 `evidenceRefs` 从 Canonical Chunk 回填。

## 16.2 Evidence Mapping

每条话语资产都应能够追溯到：

```text
Confirmed Enterprise Profile
+
用户确认的 EvidenceRef
```

即：

```text
产业价值表达
      ↑
      ├── 企业画像 evidence
      └── 总书记原文 EvidenceRef
```

后续生成不得仅使用 `speechId` 作为引用依据。

## 16.3 用户控制

话语资产必须支持：

- 逐条编辑；
- 删除；
- 单独重新生成；
- 返回调整讲话勾选；
- 最终确认。

只有：

> `Confirmed Discourse Assets`

才能进入正式场景材料生成。

---

# 17. 场景材料

MVP 仅保留三个文字输出场景，不做 PPT。

## 17.1 场景 A：政府领导到企业调研

输出：

> 企业调研汇报稿 / 企业介绍稿

特点：

- 正式；
- 相对完整；
- 介绍企业、技术产品、产业价值和发展方向。

## 17.2 场景 B：政企座谈会

输出：

> 企业代表发言稿

特点：

- 第一人称；
- 适合短时发言；
- 重点突出企业核心价值与发展方向。

## 17.3 场景 C：与政府部门正式对接

输出：

> 企业及项目沟通介绍材料

特点：

- 务实；
- 强调企业做什么；
- 解决什么产业问题；
- 当前合作/发展方向。

## 17.4 场景仍保留自由输入

推荐交互：

```text
[领导调研]
[政企座谈]
[政府部门对接]

补充本次具体情况（可选）：
__________________________
```

即：

> **场景结构化 + 自然语言补充**

---

# 18. 最终材料数据结构

```ts
type GeneratedMaterial = {
  scenario:
    | "leadership_research"
    | "government_symposium"
    | "government_coordination"

  title: string
  body: string

  usedAssetIds: string[]
  usedSpeechIds: string[]
  usedEvidenceRefs: EvidenceRef[]
}
```

`body` 为自然语言正文。`usedSpeechIds` 仅作为篇级出处列表，可由 `usedEvidenceRefs` 派生。

如果正文中出现总书记原文，必须通过 EvidenceRef 由程序从 Canonical Source 原样插入，不允许 LLM 自行重写或自由生成引用。

---

# 19. 四类核心 AI 调用

整个 MVP 只保留四类核心 AI 能力。

## 19.1 Profile Generator

```text
原始企业介绍
↓
DeepSeek
↓
五维 EnterpriseProfile JSON
↓
Zod 校验
↓
用户编辑确认
```

Prompt 核心约束：

- 只提取或保守归纳用户提供的信息；
- 不得虚构客户、融资、规模、市场地位、技术指标、成果；
- 推断内容必须标记为 `inferred`；
- 不确定内容不要填充。

## 19.2 Retrieval + Reranker

```text
Confirmed Profile
↓
Qwen Embedding
↓
LanceDB
↓
Candidates
↓
DeepSeek Rerank
↓
推荐结果
```

## 19.3 Asset Generator

输入：

```text
Confirmed Enterprise Profile
+
Confirmed EvidenceRefs
```

输出：

```text
Structured DiscourseAssets JSON
```

规则：

- 企业事实不得超出画像；
- 总书记原文不得由模型生成或重写；
- LLM 只返回结构化内容与 EvidenceRef；
- 程序根据 EvidenceRef 回填原文；
- 话语资产必须保存 Evidence Mapping。

## 19.4 Material Generator

输入：

```text
Confirmed Enterprise Profile
+
Confirmed EvidenceRefs
+
Confirmed Discourse Assets
+
Scenario
+
Additional Requirements
```

输出：

```text
GeneratedMaterial
```

规则：

1. 企业事实不能漂移；
2. 不得擅自加入用户未确认的 Evidence 作为核心依据；
3. 直接引用必须来自 Canonical Source，并由程序按 EvidenceRef 回填；
4. 优先复用已确认话语资产；
5. 不从零重新发明企业定位。

---

# 20. Structured Output 与 Zod

所有中间 AI 输出尽量采用：

> JSON Structured Output + Zod Validation

重点对象：

- EnterpriseProfile；
- RerankResult；
- EvidenceRef；
- DiscourseAssets；
- GeneratedMaterial 外层 metadata。

这样可以避免：

- 字段缺失；
- LLM 随意增加数据结构；
- 前端无法稳定渲染；
- Evidence ID 丢失。

最终文章正文可保持自由文本，但其外层仍由结构化对象承载。

---

# 21. 应用状态机

MVP 显式维护以下阶段：

```text
PROFILE_DRAFT
      ↓ 用户确认

PROFILE_CONFIRMED
      ↓ 执行检索

RECOMMENDATIONS_READY
      ↓ 用户勾选（确认 EvidenceRef，而非仅 Speech）

SPEECHES_SELECTED
      ↓ 生成话语资产

ASSETS_DRAFT
      ↓ 用户编辑 / 确认

ASSETS_CONFIRMED
      ↓ 选择场景

SCENARIO_DEFINED
      ↓ 生成材料

MATERIAL_READY
```

Human-in-the-loop 的三个硬节点：

1. 企业画像确认；
2. 总书记讲话证据人工勾选（落地为 Confirmed EvidenceRefs）；
3. 企业话语资产确认。

AI 不得越过这些节点自动替用户决定。

---

# 22. 上游变化导致下游失效

必须实现依赖失效机制：

| 用户修改 | 自动失效 |
|---|---|
| 企业画像 | 讲话推荐、证据选择、话语资产、最终材料 |
| 证据选择（EvidenceRef） | 话语资产、最终材料 |
| 话语资产 | 最终材料 |
| 场景/场景要求 | 最终材料 |

原则：

> **上游事实或人工选择发生变化，所有依赖该状态的下游生成物必须重新生成。**

避免页面显示新画像、后台却仍使用旧状态。

---

# 23. 核心 API

MVP 建议只保留四个核心接口。

## 23.1 企业画像

```text
POST /api/profile/generate
```

输入：

```ts
{
  rawCompanyDescription: string
}
```

输出：

```ts
EnterpriseProfile
```

## 23.2 讲话推荐

```text
POST /api/speeches/recommend
```

输入：

```ts
{
  confirmedProfile: EnterpriseProfile
}
```

内部：

```text
Qwen Embedding
→ LanceDB
→ Deduplicate
→ DeepSeek Rerank
```

输出：

```text
Speech Recommendations
（候选 Chunk + 可构造的 EvidenceRef）
```

## 23.3 话语资产

```text
POST /api/assets/generate
```

输入：

```ts
{
  confirmedProfile: EnterpriseProfile
  selectedEvidenceRefs: EvidenceRef[]
}
```

输出：

```ts
DiscourseAssets
```

## 23.4 场景材料

```text
POST /api/material/generate
```

输入：

```ts
{
  confirmedProfile: EnterpriseProfile
  selectedEvidenceRefs: EvidenceRef[]
  confirmedAssets: DiscourseAssets
  scenario: string
  additionalRequirements?: string
}
```

输出：

```ts
GeneratedMaterial
```

---

# 24. 客户端状态

MVP 可采用：

```ts
type WorkspaceState = {
  rawCompanyDescription: string

  profile?: EnterpriseProfile
  profileConfirmed: boolean

  recommendations: SpeechRecommendation[]
  selectedEvidenceRefs: EvidenceRef[]

  assets?: DiscourseAssets
  assetsConfirmed: boolean

  scenario?: Scenario
  additionalRequirements?: string

  material?: GeneratedMaterial
}
```

MVP 暂不引入正式业务数据库。

必要时使用：

- React State；
- localStorage。

如果后续加入：

- 多用户；
- 历史企业；
- 多项目；
- 企业话语资产长期沉淀；
- 跨设备使用；

再评估 SQLite / PostgreSQL 等正式持久化方案。

---

# 25. 推荐项目目录

```text
project/
│
├── corpus/
│   ├── raw/
│   └── processed/
│
├── data/
│   └── lancedb/
│
├── scripts/
│   └── ingest-corpus.ts
│
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── profile/
│   │       ├── speeches/
│   │       ├── assets/
│   │       └── material/
│   │
│   └── lib/
│       ├── ai/
│       │   ├── llm.ts
│       │   ├── embedding.ts
│       │   ├── retrieval.ts
│       │   ├── rerank.ts
│       │   └── prompts.ts
│       │
│       ├── corpus/
│       │   ├── schema.ts
│       │   ├── clean.ts
│       │   └── chunk.ts
│       │
│       └── schemas/
│           ├── profile.ts
│           ├── speech.ts
│           ├── evidence.ts
│           ├── assets.ts
│           └── material.ts
│
├── .env.local
└── package.json
```

目录属于推荐实现，不要求 Coding Agent 机械照搬；在不破坏架构边界与验收目标的前提下可自主调整。

---

# 26. API Key 与安全

`.env.local` 至少保存：

```text
DEEPSEEK_API_KEY=
DASHSCOPE_API_KEY=
```

原则：

- API Key 只存在服务端；
- 不得暴露到浏览器 bundle；
- 不得提交到 Git；
- `.env.local` 必须进入 `.gitignore`。

---

# 27. Retrieval Smoke Test

建库后必须先验证检索质量，而不是直接做 UI。

准备少量典型企业画像，例如：

- 工业具身智能；
- AI for Science；
- 医疗 AI；
- 大模型基础设施；
- 智慧农业；
- 机器人。

执行：

```text
Enterprise Profile
↓
Qwen Embedding
↓
LanceDB Top-K
↓
打印结果
```

人工观察：

- 是否存在明显语义相关讲话；
- 是否只是关键词相似；
- 同一讲话是否过度重复；
- 是否漏掉明显应命中的核心讲话。

如召回失败，应优先定位：

1. 语料覆盖；
2. Chunking；
3. embeddingText；
4. Retrieval Query；
5. Embedding 模型/参数。

---

# 28. RAG 可诊断性

系统必须能够区分：

## 情况 A：目标讲话未进入向量候选

问题可能在：

- Corpus；
- Chunk；
- Embedding；
- Retrieval Query；
- Vector Search。

## 情况 B：目标讲话进入候选但被排低

问题可能在：

- Reranker Prompt；
- Reranker 判断标准。

## 情况 C：排序正确但推荐理由差

问题主要在：

- Explanation Prompt。

不要把所有问题都归结为“大模型效果不好”。

---

# 29. MVP 验收重点

## 29.1 原文完整性

最高优先级：

> **任何总书记直接引用与 Canonical Source 逐字逐标点完全一致。**

引用必须能还原为 EvidenceRef，并由程序 slice 回填，而不是比对 LLM 自行输出的字符串。建议写自动测试覆盖。

## 29.2 企业画像可信

- AI 能形成可读的五维画像；
- 用户能够修改；
- 修改后后续检索使用新画像。

## 29.3 检索相关性

- 推荐结果不是简单关键词包含；
- 用户能够理解推荐理由。

## 29.4 Human-in-the-loop 有效

- 用户改变已确认 Evidence 后，话语资产有可感知变化；
- 上游修改导致下游正确失效。

## 29.5 Evidence Chain

至少能够实现：

```text
Enterprise Profile
      ↓
Confirmed EvidenceRef
      ↓
Discourse Asset
      ↓
Final Material
```

并保留 `speechId` / `chunkId` / `startIndex` / `endIndex`。最终材料中的总书记原文必须能按 EvidenceRef 追溯到 Canonical Chunk。

## 29.6 场景差异

同一企业、同一套话语资产，在：

- 领导调研；
- 政企座谈；
- 政府部门对接；

三个场景中生成的材料应具有明显的结构和语气差异。

---

# 30. 当前已确认的技术基线

截至本版本，当前认可的方向包括：

1. Next.js + TypeScript Web 应用；
2. Tailwind CSS + shadcn/ui；
3. DeepSeek V4 Flash 作为主 LLM；
4. Qwen3.7 Text Embedding API；
5. LanceDB 本地向量数据库；
6. Local-first MVP；
7. 自研轻量 RAG，不引入 LangChain / LangGraph；
8. 自然段 / 语义段优先 Chunk；
9. Vector Recall + DeepSeek Rerank；
10. 五维结构化企业画像；
11. 四维企业话语资产；
12. 三个文字型政企沟通场景；
13. Zod 结构化输出校验；
14. 显式 Human-in-the-loop 状态机；
15. 上游变化使下游依赖结果失效；
16. 总书记原文不得由 LLM 生成；
17. 所有总书记原文必须从 Canonical Source 原样抽取；
18. 总书记直接引用不得修改任何一个字或任何一个标点符号；
19. 语料分层为 Raw Capture → Canonical Document → Chunk → EvidenceRef；
20. 用户确认的是 EvidenceRef，后续生成必须基于已确认 Evidence；
21. LLM 生成结构化内容后，由程序按 EvidenceRef 回填原文；
22. 第一版产品语料库目标约 100 篇；开发阶段可用小规模黄金/Demo 语料先跑通技术闭环，100 篇不是 Pipeline 启动阻塞条件；
23. MVP 采用 Chunk 级 Evidence：用户确认完整 Chunk，不支持 Chunk 内 Span 选择；EvidenceRef 的 offset 基于 Chunk text。

---

# 31. 尚未完全冻结、需人工确认的事项

以下事项仍不得由 Coding Agent 擅自做产品层冻结：

1. 企业画像五维下的最终具体字段；
2. 企业画像每个维度的 UI 形式；
3. 企业画像是否在 UI 显式显示 `explicit / inferred`；
4. 推荐讲话最终显示数量；
5. Vector Retrieval Top-K 精确值；
6. 同一 Speech 最多保留几个候选 Chunk；
7. Chunk 最终长度；
8. 是否加入局部 overlap；
9. 讲话关键词生成方式；
10. 讲话卡片最终字段；
11. 是否显示匹配强度；
12. 四类话语资产的最终名称与具体数量；
13. 话语资产卡片交互细节；
14. 三个最终场景的正式产品命名；
15. 最终材料默认篇幅；
16. 总书记讲话首版语料覆盖范围；
17. 是否要求所有语料必须提供原文 URL；
18. 最终 UI 视觉风格；
19. 是否在 MVP 中加入 localStorage 持久化；
20. 是否需要公网部署。

其中，如果某项决策会改变用户理解、核心流程、产品定位或证据机制，必须回到团队人工确认。

---

# 32. 推荐开发顺序

在 5 小时 MVP 中，建议按风险优先顺序推进：

```text
1. 准备并校验权威讲话语料（可用小规模黄金/Demo 语料启动）
        ↓
2. Chunk + Qwen Embedding + LanceDB 建库
        ↓
3. Retrieval Smoke Test
        ↓
4. Enterprise Profile Structured Output
        ↓
5. Vector Retrieval + DeepSeek Rerank
        ↓
6. 推荐讲话卡片 + 人工勾选（固化 EvidenceRef）
        ↓
7. Discourse Assets Structured Output + 原文回填
        ↓
8. 三场景 Material Generator + 原文回填
        ↓
9. 状态失效机制
        ↓
10. UI 优化与 Demo 打磨
```

核心原则：

> **先证明语料可靠、匹配有效、引用可追溯，再做完整界面。**

约 100 篇完整语料用于产品能力扩展，不阻塞上述技术链路启动。

---

# 33. 最终技术架构摘要

本产品 MVP 采用一个 **Next.js + TypeScript 的 Local-first 单体 Web 应用**。

讲话知识库采用：

```text
Raw Capture
→ Canonical Document
→ 语义 Chunk
→ Qwen3.7 Text Embedding API
→ LanceDB 本地向量库
```

企业匹配采用：

```text
Confirmed Enterprise Profile
→ Qwen Query Embedding
→ LanceDB Vector Recall
→ DeepSeek V4 Flash Rerank
→ 人工确认 EvidenceRef
```

生成链采用：

```text
五维企业画像
+
用户确认的 EvidenceRef
→
LLM 生成结构化企业话语资产
→
程序按 EvidenceRef 回填原文
→
人工确认
→
三个文字型政企沟通场景
→
最终材料（引用同样由程序回填）
```

系统始终坚持：

> **企业事实由用户最终确认。**

> **AI 负责推荐和生成，用户负责正式表达的关键决策。**

> **总书记讲话原文是只读 Canonical Source；任何直接引用必须逐字、逐标点与权威原始语料完全一致，LLM 无权生成或修改。**

> **用户确认的是 Evidence，而不是仅仅 Speech；后续生成必须基于已确认 EvidenceRef。**

> **MVP 不追求复杂基础设施，只证明“企业画像 → 权威讲话 → 话语资产 → 场景材料”这条工作流能够真实、可信、可控地成立。**
