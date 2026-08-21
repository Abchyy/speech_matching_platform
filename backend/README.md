# 后端 Vertical Slice

M1-A.1 后端骨架：企业输入 → 画像结构化 → mock 匹配 → EvidenceRef 回填。

当前使用 mock service 与 DEMO 占位语料，不接入真实 Embedding、LanceDB 或 LLM。DEMO 文本**不是**总书记讲话原文。

## 启动

```bash
cd backend
npm install
npm run dev
```

默认地址：`http://localhost:3000`

## 测试

```bash
cd backend
npm test
npm run typecheck
```

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/match` | Vertical Slice 入口 |
| POST | `/api/profile/generate` | 企业画像（mock） |
| POST | `/api/speeches/recommend` | 讲话推荐 + Evidence（mock） |
| POST | `/api/assets/generate` | 话语资产（占位） |
| POST | `/api/material/generate` | 场景材料（占位） |

## 调用示例

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

若本机开启了 HTTP 代理，必须加 `--noproxy '*'`，否则 `localhost` 可能被拦截并返回空响应。
