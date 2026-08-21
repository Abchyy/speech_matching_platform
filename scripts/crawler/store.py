from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ASCII_EDGE = " \t\r\n"


def _strip_ascii_edges(text: str) -> str:
    """Trim only ASCII whitespace. Keep ideographic spaces and original chars."""
    return (text or "").strip(ASCII_EDGE)


def yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    text = str(value)
    if text == "" or any(ch in text for ch in ":#{}[]&*!|>'\"%@`") or text[:1] in "-?":
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return text


def render_markdown(record: dict[str, Any], body: str) -> str:
    lines = ["---"]
    for key in (
        "id",
        "title",
        "date",
        "source",
        "origin",
        "url",
        "article_id",
    ):
        if key in record:
            lines.append(f"{key}: {yaml_scalar(record[key])}")
    keywords = record.get("retrieval_keywords") or []
    lines.append("retrieval_keywords:")
    if keywords:
        for item in keywords:
            lines.append(f"  - {yaml_scalar(item)}")
    else:
        lines.append("  []")
    themes = record.get("themes") or []
    lines.append("themes:")
    if themes:
        for item in themes:
            lines.append(f"  - {yaml_scalar(item)}")
    else:
        lines.append("  []")
    lines.append("---")
    lines.append("")
    title = _strip_ascii_edges(record.get("title") or "")
    lines.append(f"# {title}" if title else "#")
    lines.append("")
    lines.append(body.rstrip("\n"))
    lines.append("")
    return "\n".join(lines)


class CorpusStore:
    """Idempotent Markdown + metadata.json store keyed by canonical URL."""

    def __init__(self, repo_root: Path, logger) -> None:
        self.repo_root = repo_root
        self.logger = logger
        self.corpus_dir = repo_root / "corpus"
        self.raw_dir = self.corpus_dir / "raw"
        self.cleaned_dir = self.corpus_dir / "cleaned"
        self.chunks_dir = self.corpus_dir / "chunks"
        self.metadata_path = self.corpus_dir / "metadata.json"
        self.failures_path = self.corpus_dir / "crawl_failures.json"
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.cleaned_dir.mkdir(parents=True, exist_ok=True)
        self.chunks_dir.mkdir(parents=True, exist_ok=True)
        self.metadata = self._load_metadata()
        self.failures = self._load_failures()

    def _load_metadata(self) -> dict[str, Any]:
        if not self.metadata_path.exists():
            return {
                "source": "人民网总书记系列重要讲话数据库",
                "updated_at": None,
                "next_seq": 1,
                "articles": [],
            }
        with self.metadata_path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        data.setdefault("articles", [])
        data.setdefault("next_seq", 1)
        return data

    def _load_failures(self) -> list[dict[str, Any]]:
        if not self.failures_path.exists():
            return []
        with self.failures_path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            return data
        return data.get("failures", [])

    def save(self) -> None:
        self.metadata["updated_at"] = datetime.now(timezone.utc).astimezone().isoformat(
            timespec="seconds"
        )
        self._atomic_write_json(self.metadata_path, self.metadata)
        self._atomic_write_json(self.failures_path, self.failures)

    def _atomic_write_json(self, path: Path, payload: Any) -> None:
        tmp = path.with_suffix(path.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        tmp.replace(path)

    def find_by_url(self, url: str) -> dict[str, Any] | None:
        for article in self.metadata["articles"]:
            if article.get("url") == url:
                return article
        return None

    def find_by_article_id(self, article_id: str) -> dict[str, Any] | None:
        for article in self.metadata["articles"]:
            if str(article.get("article_id")) == str(article_id):
                return article
        return None

    def merge_hits(
        self,
        article: dict[str, Any],
        keyword: str,
        theme_id: str | None,
    ) -> bool:
        changed = False
        keywords = list(article.get("retrieval_keywords") or [])
        if keyword and keyword not in keywords:
            keywords.append(keyword)
            article["retrieval_keywords"] = keywords
            changed = True
        themes = list(article.get("themes") or [])
        if theme_id and theme_id not in themes:
            themes.append(theme_id)
            article["themes"] = themes
            changed = True
        return changed

    def rewrite_markdown_front_matter(self, article: dict[str, Any]) -> None:
        path = self.repo_root / article["path"]
        if not path.exists():
            self.logger.warn(f"Markdown missing while updating keywords: {path}")
            return
        text = path.read_text(encoding="utf-8")
        parts = text.split("---", 2)
        if len(parts) < 3:
            self.logger.warn(f"Cannot update front matter (format unexpected): {path}")
            return
        body = parts[2].lstrip("\n")
        if body.startswith("#"):
            _, _, remainder = body.partition("\n")
            body = remainder.lstrip("\n")
        path.write_text(render_markdown(article, body.rstrip("\n")), encoding="utf-8")

    def save_article(self, record: dict[str, Any], body: str) -> dict[str, Any]:
        existing = self.find_by_url(record["url"]) or self.find_by_article_id(
            record["article_id"]
        )
        if existing:
            changed = self.merge_hits(
                existing,
                record.get("_keyword") or "",
                record.get("_theme_id"),
            )
            if changed:
                existing["path"] = existing.get("path") or f"corpus/raw/{existing['id']}.md"
                self.rewrite_markdown_front_matter(existing)
                self.logger.info(
                    f"Updated keywords/themes for existing article {existing['id']}"
                )
            else:
                self.logger.skip(f"URL already saved: {existing['url']}")
            return existing

        # Recompute from existing IDs so a failed write cannot leave a hole
        # that later becomes a new article with a reused number.
        existing_nums = []
        for item in self.metadata["articles"]:
            match = re.fullmatch(r"speech_(\d+)", str(item.get("id") or ""))
            if match:
                existing_nums.append(int(match.group(1)))
        seq = max(existing_nums) + 1 if existing_nums else int(self.metadata.get("next_seq") or 1)
        speech_id = f"speech_{seq:03d}"
        rel_path = f"corpus/raw/{speech_id}.md"
        article = {
            "id": speech_id,
            "article_id": record["article_id"],
            "title": record["title"],
            "date": record.get("date"),
            "source": record.get("source") or "人民网",
            "origin": record.get("origin"),
            "url": record["url"],
            "retrieval_keywords": [record["_keyword"]] if record.get("_keyword") else [],
            "themes": [record["_theme_id"]] if record.get("_theme_id") else [],
            "keyword_hit_count": record.get("keyword_hit_count"),
            "path": rel_path,
            "retrieved_at": datetime.now(timezone.utc).astimezone().isoformat(
                timespec="seconds"
            ),
        }
        abs_path = self.repo_root / rel_path
        try:
            abs_path.write_text(render_markdown(article, body), encoding="utf-8")
        except OSError as exc:
            self.logger.error(f"Failed to write Markdown {abs_path}: {exc}")
            self.record_failure(record.get("url"), record.get("_keyword"), f"write_failed: {exc}")
            raise
        self.metadata["next_seq"] = seq + 1
        self.metadata["articles"].append(article)
        self.logger.info(f"Saved {speech_id}: {article['title']}")
        return article

    def record_failure(self, url: str | None, keyword: str | None, reason: str) -> None:
        self.failures.append(
            {
                "url": url,
                "keyword": keyword,
                "reason": reason,
                "timestamp": datetime.now(timezone.utc).astimezone().isoformat(
                    timespec="seconds"
                ),
            }
        )

    def saved_count(self) -> int:
        return len(self.metadata.get("articles") or [])

    def primary_theme_count(self, theme_id: str) -> int:
        count = 0
        for article in self.metadata.get("articles") or []:
            themes = article.get("themes") or []
            if themes and themes[0] == theme_id:
                count += 1
        return count

    def theme_hit_count(self, theme_id: str) -> int:
        return sum(
            1
            for article in self.metadata.get("articles") or []
            if theme_id in (article.get("themes") or [])
        )

    def keyword_count(self, keyword: str) -> int:
        return sum(
            1
            for article in self.metadata.get("articles") or []
            if keyword in (article.get("retrieval_keywords") or [])
        )

    def primary_keyword_count(self, keyword: str) -> int:
        """Articles first discovered by this keyword. Merges do not count."""
        count = 0
        for article in self.metadata.get("articles") or []:
            keywords = article.get("retrieval_keywords") or []
            if keywords and keywords[0] == keyword:
                count += 1
        return count
