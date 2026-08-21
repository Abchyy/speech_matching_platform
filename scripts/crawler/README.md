# 人民网讲话数据库采集器

当前模块只负责 Raw Capture（原始 Markdown + metadata），不清洗、不分块、不做 Embedding。

## 依赖

Python 3.10+。在仓库根目录执行：

```bash
pip install -r scripts/crawler/requirements.txt
```

## Smoke Test（当前阶段）

只抓 1 个关键词（默认：科技创新），最多保存 3 篇：

```bash
python scripts/crawler/crawl.py --smoke
```

重复执行是安全的：已保存文章不会重新编号，也不会重复写文件。

请求节奏：正常间隔 2–5 秒；遇到 HTTP 403 等待 30–60 秒后最多再试 2 次，仍失败则记入失败并跳过，不长时间空等。

## 配置

关键词、主题配额在：

```text
scripts/crawler/config/topics.json
```

可直接增删 `themes[].keywords` 或调整 `target`。

主题相关性（保守规则，不改写正文）：

1. 搜索关键词出现在标题中；或
2. 同一主题的其他关键词出现在标题中，且正文至少出现 1 次当前搜索关键词；或
3. 正文中当前搜索关键词精确出现不少于 `quality.min_keyword_hits_in_body` 次（默认 3）。

仅因搜索结果列表命中、正文里偶然出现一次关键词的文章会被跳过。

## 输出

```text
corpus/raw/*.md
corpus/metadata.json
corpus/crawl_failures.json
corpus/crawler.log
```

完整约 100 篇（十类主题配额，需先完成 Smoke Test）：

```bash
python scripts/crawler/crawl.py --full
```
