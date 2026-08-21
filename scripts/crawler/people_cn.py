from __future__ import annotations

import random
import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import requests
from bs4 import BeautifulSoup, NavigableString, Tag


# Confirmed from live HTML on jhsjk.people.cn/result:
# - search form GET /result with keywords/isFuzzy/form/page
# - result links are relative: article/{numeric_id}
# - detail title is div.d2txt h1; date/source in div.d2txt_1
# - body is div.d2txt_con; editor line is div.editor (outside body)


DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
ARTICLE_ID_RE = re.compile(r"(?:article/)?(\d{5,})")


@dataclass
class SearchHit:
    article_id: str
    title: str
    url: str
    date: str | None
    origin: str | None
    snippet: str


class FetchError(Exception):
    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class PeopleCnClient:
    def __init__(self, crawler_cfg: dict[str, Any], logger) -> None:
        self.base_url = crawler_cfg["base_url"].rstrip("/")
        self.timeout = float(crawler_cfg.get("timeout_seconds") or 20)
        self.interval_min = float(crawler_cfg.get("request_interval_min") or 2)
        self.interval_max = float(crawler_cfg.get("request_interval_max") or 5)
        if self.interval_max < self.interval_min:
            self.interval_max = self.interval_min
        self.retry_max = int(crawler_cfg.get("http_403_retries") or 2)
        self.forbidden_wait_min = float(crawler_cfg.get("http_403_wait_min") or 30)
        self.forbidden_wait_max = float(crawler_cfg.get("http_403_wait_max") or 60)
        self.interval = self.interval_min
        self.is_fuzzy = str(crawler_cfg.get("is_fuzzy", 1))
        self.search_area = str(crawler_cfg.get("search_area", 0))
        self.sort_type = str(crawler_cfg.get("sort_type", 2))
        self.speech_form = str(crawler_cfg.get("speech_form") or "706")
        self.use_speech_form = bool(crawler_cfg.get("use_speech_form_filter", True))
        self.logger = logger
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": crawler_cfg.get(
                    "user_agent",
                    "Mozilla/5.0 (compatible; SpeechMatchingPlatformCorpusBot/0.1)",
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Referer": f"{self.base_url}/",
            }
        )
        self._last_request_at = 0.0

    def close(self) -> None:
        self.session.close()

    def _sleep(self) -> None:
        wait = random.uniform(self.interval_min, self.interval_max)
        elapsed = time.monotonic() - self._last_request_at
        remain = wait - elapsed
        if remain > 0:
            time.sleep(remain)

    def get(self, url: str) -> str:
        """Fetch URL. 403 is retried a few times with a 30-60s pause, then fails."""
        attempts = 1 + max(self.retry_max, 0)
        last_error: FetchError | None = None
        for attempt in range(1, attempts + 1):
            if attempt == 1:
                self._sleep()
            self._last_request_at = time.monotonic()
            try:
                response = self.session.get(url, timeout=self.timeout)
            except requests.RequestException as exc:
                last_error = FetchError(f"network_error: {exc}")
                if attempt < attempts:
                    pause = random.uniform(self.interval_min, self.interval_max)
                    self.logger.warn(
                        f"Network error, retry {attempt}/{self.retry_max} in {pause:.1f}s: {url}"
                    )
                    time.sleep(pause)
                    continue
                raise last_error from exc

            if response.status_code == 200:
                response.encoding = response.apparent_encoding or "utf-8"
                return response.text

            last_error = FetchError(
                f"http_{response.status_code}",
                status=response.status_code,
            )
            if response.status_code == 403 and attempt < attempts:
                pause = random.uniform(self.forbidden_wait_min, self.forbidden_wait_max)
                self.logger.warn(
                    f"HTTP 403 attempt {attempt}/{attempts}, wait {int(pause)}s then retry: {url}"
                )
                time.sleep(pause)
                continue
            if attempt < attempts and response.status_code >= 500:
                pause = random.uniform(self.interval_min, self.interval_max)
                self.logger.warn(
                    f"HTTP {response.status_code}, retry {attempt}/{self.retry_max} in {pause:.1f}s: {url}"
                )
                time.sleep(pause)
                continue
            break
        assert last_error is not None
        raise last_error

    def search_url(self, keyword: str, page: int = 1) -> str:
        params = {
            "keywords": keyword,
            "isFuzzy": self.is_fuzzy,
            "searchArea": self.search_area,
            "sortType": self.sort_type,
            "page": str(page),
        }
        if self.use_speech_form:
            # HTML: 类型“讲话” = form data-value="706"
            params["form"] = self.speech_form
        return f"{self.base_url}/result?{urlencode(params)}"

    def article_url(self, article_id: str) -> str:
        return f"{self.base_url}/article/{article_id}"

    def parse_search_results(self, html: str) -> tuple[list[SearchHit], int | None]:
        soup = BeautifulSoup(html, "html.parser")
        total = None
        total_el = soup.find(id="totalCount")
        if total_el and total_el.get_text(strip=True).isdigit():
            total = int(total_el.get_text(strip=True))

        hits: list[SearchHit] = []
        news_list = soup.find(id="news_list")
        if news_list is None:
            raise FetchError("search_parse_failed: missing #news_list")

        last_hit: SearchHit | None = None
        for li in news_list.find_all("li"):
            link = li.find("a", href=True)
            if link is not None:
                href = str(link.get("href") or "")
                article_id = extract_article_id(href)
                if not article_id:
                    continue
                title = _visible_text(link)
                origin, date = _parse_result_meta(li)
                last_hit = SearchHit(
                    article_id=article_id,
                    title=title,
                    url=self.article_url(article_id),
                    date=date,
                    origin=origin,
                    snippet="",
                )
                hits.append(last_hit)
                continue
            if last_hit is not None and not last_hit.snippet:
                paragraph = li.find("p")
                if paragraph is not None:
                    last_hit.snippet = _visible_text(paragraph)
        return hits, total

    def parse_detail(self, html: str, url: str) -> dict[str, Any]:
        soup = BeautifulSoup(html, "html.parser")
        container = soup.select_one("div.d2txt")
        if container is None:
            raise FetchError("detail_parse_failed: missing div.d2txt")

        h1 = container.find("h1")
        title = _visible_text(h1) if h1 else ""
        h3 = container.find("h3")
        subtitle = _visible_text(h3) if h3 else ""
        if subtitle and subtitle not in title:
            full_title = f"{title} {subtitle}".strip() if title else subtitle
        else:
            full_title = title

        origin = None
        date = None
        for meta in container.select("div.d2txt_1"):
            raw = _visible_text(meta)
            origin = origin or _extract_origin(raw)
            date = date or _extract_date(raw)

        body_el = container.select_one("div.d2txt_con")
        if body_el is None:
            raise FetchError("detail_parse_failed: missing div.d2txt_con")
        body = extract_body_text(body_el)
        if not title:
            raise FetchError("missing_title")
        if not body.strip():
            raise FetchError("empty_body")
        return {
            "title": full_title or title,
            "subtitle": subtitle or None,
            "date": date,
            "origin": origin,
            "source": "人民网",
            "url": url,
            "body": body,
        }


def extract_article_id(href: str) -> str | None:
    match = ARTICLE_ID_RE.search(href or "")
    return match.group(1) if match else None


def _visible_text(el: Tag | None) -> str:
    if el is None:
        return ""
    for br in el.find_all("br"):
        br.replace_with("\n")
    text = el.get_text("", strip=False)
    text = text.replace("\xa0", " ")
    # Collapse only HTML layout newlines/tabs; keep ideographic indent spaces.
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip(" \t\r\n")


def _parse_result_meta(li: Tag) -> tuple[str | None, str | None]:
    raw = _visible_text(li)
    return _extract_origin(raw), _extract_date(raw)


def _extract_origin(raw: str) -> str | None:
    match = re.search(r"来源：\s*(.+?)(?:\s*发布时间|\s*\[\d{4}-|\s*$)", raw)
    if not match:
        return None
    origin = match.group(1).strip(" \t\r\n")
    return origin or None


def _extract_date(raw: str) -> str | None:
    match = re.search(r"发布时间：\s*(\d{4}-\d{2}-\d{2})", raw)
    if match:
        return match.group(1)
    match = DATE_RE.search(raw or "")
    if not match:
        return None
    return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"


def extract_body_text(container: Tag) -> str:
    """Extract article body without rewriting characters.

    Only drops clearly non-body chrome (images, scripts, buttons). Nested
    wrapper <p> tags are skipped so inner paragraphs are not duplicated.
    Photo captions, Xinhua datelines, and newspaper edition lines inside
    the body container are kept unchanged for later Canonical cleaning.
    """
    work = BeautifulSoup(str(container), "html.parser")
    root = work.find()
    if root is None:
        return ""

    for junk in root.find_all(["script", "style", "img", "video", "button", "input"]):
        junk.decompose()
    for br in root.find_all("br"):
        br.replace_with("\n")

    paragraphs: list[str] = []
    p_tags = root.find_all("p")
    if p_tags:
        for p in p_tags:
            if p.find("p"):
                continue
            text = _paragraph_text(p)
            if text:
                paragraphs.append(text)
    else:
        text = _paragraph_text(root)
        if text:
            paragraphs.append(text)

    return "\n\n".join(paragraphs)


def _paragraph_text(el: Tag) -> str:
    chunks: list[str] = []
    for child in el.descendants:
        if isinstance(child, NavigableString):
            parent = child.parent
            if isinstance(parent, Tag) and parent.name in {"script", "style"}:
                continue
            chunks.append(str(child))
    text = "".join(chunks)
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    # Keep published fullwidth indent; only trim ASCII edges from HTML.
    text = text.strip(" \t\r\n")
    return text
