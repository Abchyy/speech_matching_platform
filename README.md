# speech_matching_platform

面向中小型 AI 科技企业的总书记重要讲话智能匹配与政企沟通材料平台。

## 项目目标

帮助企业将自身技术、产品与产业方向，匹配到总书记重要讲话和重要论述，沉淀可复用、可追溯、可人工控制的政企沟通话语资产，并生成适配具体沟通场景的文字材料。

## 当前阶段

**M1 Development：真实 Canonical 语料接入与向量检索**

Canonical Source 为 `corpus/cleaned/`。运行时 Chunk 由后端 Chunker 从 Canonical 原文生成，不以 `corpus/chunks/` 预切片作为检索源。

## 本地启动

```bash
cd backend
npm install
cp .env.example .env.local
npm run dev
```

服务地址：`http://localhost:3000`

密钥只放在 `backend/.env.local`，不要提交。本地 LanceDB 位于 `data/lancedb/`，同样不要提交。

## API 调用示例

```bash
curl --noproxy '*' -s http://localhost:3000/api/match \
  -H 'Content-Type: application/json' \
  -d '{
    "rawCompanyDescription": "我们是一家做工业具身智能的创业公司，主要面向汽车制造场景，通过视觉语言模型和机器人控制技术提升柔性生产能力。",
    "companyName": "示例智造",
    "industry": "智能制造",
    "techDomains": ["工业具身智能", "机器人控制"],
    "developmentNeeds": "希望准确对接产业升级相关表述"
  }'
```

若本机开启了 HTTP 代理，请保留 `--noproxy '*'`，避免 localhost 被拦截。

更多接口说明见 [backend/README.md](backend/README.md)。

## 文档入口

- [产品需求文档](docs/product_requirement.md)
- [技术架构文档](docs/technical_architecture.md)
- [语料收集方案](docs/data_collection_plan.md)

产品范围、工作流与技术方案以以上文档为准，不以本 README 为准。
