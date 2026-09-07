# speech_matching_platform

面向中小型 AI 科技企业的总书记重要讲话智能匹配与政企沟通材料平台。

## 项目目标

帮助企业将自身技术、产品与产业方向，匹配到总书记重要讲话和重要论述，沉淀可复用、可追溯、可人工控制的政企沟通话语资产，并生成适配具体沟通场景的文字材料。

## 当前阶段

**M2：证据稳定、索引可复现、Provider 可替换、检索可评测**

Canonical Source 为 `corpus/cleaned/`。运行时 Chunk 只读取 `corpus/chunks/` 已发布 Artifact（当前 63 篇 / 447 Chunk），不再从 Canonical Markdown 现场切块。向量索引必须离线构建并发布；推荐请求只读 active index。默认检索模式为 dense；hybrid 为显式实验开关。

## 本地启动

```bash
cd backend
npm ci
cp .env.example .env.local
npm run corpus:preflight
npm run corpus:index    # 离线构建并发布 active index；需要 DASHSCOPE_API_KEY
npm run index:status
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
