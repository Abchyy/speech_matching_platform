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
- M1-C.1 前端工作台：五步单页（企业输入 → 画像编辑/确认 → 讲话推荐/证据勾选 可用；话语资产与场景材料为"接口待接入"状态页），含状态机、三个人工闸门与上游修改失效机制

下一步：
配置 DASHSCOPE/DeepSeek 密钥后联调讲话推荐链路；Retrieval Quality Improvement 与话语资产 / 场景材料生成（仍为占位接口）
