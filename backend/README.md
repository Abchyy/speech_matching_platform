# 后端 Vertical Slice

企业输入 → 画像结构化 → Embedding 向量检索 → DeepSeek Rerank → 已选 EvidenceRef → 四维话语资产 → 场景材料。

当前画像生成仍为 mock；讲话匹配、话语资产与场景材料已接入 DeepSeek。DEMO 文本**不是**总书记讲话原文。

## 启动

```bash
cd backend
npm install
cp .env.example .env.local   # 填入 DASHSCOPE_API_KEY；DeepSeek 可复用同一把 Model Studio 密钥
npm run dev
```

默认地址：`http://localhost:3000`

密钥只放在 `backend/.env.local`，该文件已被 gitignore，不要提交。

## 测试与 Demo

```bash
cd backend
npm test
npm run typecheck
npm run retrieve:demo
npm run recommend:demo
npm run assets:demo
npm run material:demo
```

`material:demo` 会用已确认画像、已选 EvidenceRef 和已确认话语资产生成场景材料，并由程序回填 Canonical 原文。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/match` | Vertical Slice 入口 |
| POST | `/api/profile/generate` | 企业画像（mock） |
| POST | `/api/speeches/recommend` | 向量召回 + Rerank 推荐 + Evidence |
| POST | `/api/assets/generate` | 四维话语资产（DeepSeek + Evidence 回填） |
| POST | `/api/material/generate` | 场景材料（DeepSeek + Evidence 回填） |

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
