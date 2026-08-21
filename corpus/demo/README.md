# Demo 语料

本目录存放 **Demo Canonical Document**（Markdown），供 ingestion pipeline 生成检索 Chunk。

这些记录明确标注为 `DEMO_PLACEHOLDER`，**不是总书记讲话原文**，只用于验证：

Canonical Document → Chunk → ChunkRepository → EvidenceRef 回填。

当前文件：

- `demo_speech_sci_tech.md`
- `demo_speech_industry.md`
- `demo_speech_enterprise.md`

Chunk 不得在此目录或业务代码中手工维护；一律由 ingestion 从 Canonical Document 切片生成。
