阶段：
M1 Development

已完成：
- 项目目录初始化
- 文档整理
- Git 初始化准备
- 产品需求冻结
- 技术架构审查
- EvidenceRef 机制冻结
- 语料方案对齐
- M1-A.1 后端 Vertical Slice：企业输入 → 画像结构化 → mock 匹配 → Evidence 回填
- M1-A.2 Evidence 边界修正：强制 Chunk 级 Evidence，抽象 ChunkRepository
- M1-B.1 Canonical Corpus Ingestion Interface：Canonical Document → Chunk → ChunkRepository
- M1-B.2 Embedding + Vector Retrieval：Qwen Embedding → LanceDB → 语义检索 → EvidenceRef
- M1-B.3 DeepSeek Rerank：Top-K Canonical Chunk 重排 + 结构化推荐理由，接入推荐接口
- M1-C.1 话语资产：已确认画像 + 已选 EvidenceRef → DeepSeek 四维 DiscourseAssets，原文程序回填
- M1-D.1 场景材料：已确认画像 + 已选 EvidenceRef + 已确认话语资产 + 场景 → DeepSeek GeneratedMaterial，原文程序回填
- 语料采集：Raw Capture 75 篇；Canonical `corpus/cleaned/` 75 篇（含 12 篇去重对照副本）
- 运行时接入 `corpus/cleaned/`：当前后端 Chunker 生成 Chunk，本机 Qwen Embedding + LanceDB 索引

下一步：
Retrieval Quality Improvement 仍可并行评估
