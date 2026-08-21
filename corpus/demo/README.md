# Demo 语料

本目录预留给后续 Canonical Document / Chunk 落盘。

M1-A.1 的 mock 检索数据位于：

`backend/src/lib/corpus/demo-corpus.ts`

这些记录明确标注为 `DEMO_PLACEHOLDER`，**不是总书记讲话原文**，只用于验证：

企业输入 → 画像 → 匹配 → EvidenceRef 切片回填。
