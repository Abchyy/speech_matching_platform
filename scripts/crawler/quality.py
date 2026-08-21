from __future__ import annotations

import re


SPEECH_TITLE_HINT = re.compile(
    r"讲话|主旨演讲|主旨发言|书面演讲|署名|重要文章|习近平："
)

# Extra phrases used only for relevance / listing prefilter, not as search jobs.
# Keep these specific so diplomatic speeches with one incidental hit are dropped.
THEME_RELATED_TERMS: dict[str, list[str]] = {
    "tech_innovation": [
        "科技强国",
        "新型举国体制",
        "基础研究",
        "未来产业",
        "关键核心技术",
        "高水平科技自立自强",
    ],
    "high_quality_development": [
        "新发展格局",
        "新发展理念",
        "现代化产业",
        "实体经济",
        "制造业高质量发展",
        "产业升级",
    ],
    "private_economy": [
        "两个毫不动摇",
        "民营企业",
        "民营经济",
        "企业家",
        "亲清",
        "市场准入",
    ],
    "rural_revitalization": [
        "农业强国",
        "三农",
        "脱贫攻坚",
        "农业农村现代化",
        "粮食安全",
        "耕地保护",
        "种业振兴",
    ],
    "education_talent": [
        "思政课",
        "教育强国",
        "人才强国",
        "世界重要人才中心",
        "青年科技人才",
        "教育现代化",
        "人才培养",
    ],
    "party_soe": [
        "国有企业",
        "国企改革",
        "国资",
        "中央八项规定",
        "作风建设",
        "以人民为中心",
        "共同富裕",
    ],
    "chinese_modernization": [
        "中国式现代化",
        "强国建设",
        "民族复兴",
        "全面深化改革",
        "中心任务",
        "五年规划",
    ],
    "green_development": [],
    "culture": [],
    "opening_up": [],
}


def related_terms_for_theme(theme_id: str | None) -> list[str]:
    return list(THEME_RELATED_TERMS.get(theme_id or "", []) or [])


def title_should_skip(title: str, patterns: list[str]) -> str | None:
    """Return the matched exclude pattern, or None if the title may be kept.

    会见 / 学习贯彻 keep full speech titles (会见…时的讲话, 研讨班上的讲话)
    and still drop news wrappers (会见…, 考察时强调, 发表重要讲话强调).
    """
    text = (title or "").strip()
    if not text:
        return "empty_title"
    for pattern in patterns:
        if pattern == "会见":
            if "会见" not in text:
                continue
            if re.search(r"会见.{0,80}时的(?:讲话|演讲)", text):
                continue
            return "会见"
        if pattern == "学习贯彻":
            if "学习贯彻" not in text:
                continue
            if re.search(r"上的讲话", text) and not re.search(
                r"强调|考察时|主持召开|在京召开", text
            ):
                continue
            return "学习贯彻"
        if re.search(pattern, text):
            return pattern
    return None


def body_too_short(body: str, min_chars: int) -> bool:
    compact = re.sub(r"\s+", "", body or "")
    return len(compact) < min_chars


def count_exact_phrase(text: str, phrase: str) -> int:
    if not text or not phrase:
        return 0
    return text.count(phrase)


def theme_keywords_in_title(title: str, theme_keywords: list[str]) -> list[str]:
    hits: list[str] = []
    seen: set[str] = set()
    for keyword in theme_keywords or []:
        if keyword and keyword not in seen and keyword in (title or ""):
            hits.append(keyword)
            seen.add(keyword)
    return hits


def _unique_phrase_hits(text: str, phrases: list[str]) -> list[str]:
    hits: list[str] = []
    seen: set[str] = set()
    for phrase in phrases:
        if phrase and phrase not in seen and phrase in (text or ""):
            hits.append(phrase)
            seen.add(phrase)
    return hits


def _signal_phrases(keyword: str, theme_keywords: list[str], related: list[str]) -> list[str]:
    phrases: list[str] = []
    seen: set[str] = set()
    for phrase in [keyword, *(theme_keywords or []), *(related or [])]:
        if phrase and phrase not in seen:
            phrases.append(phrase)
            seen.add(phrase)
    return phrases


def listing_should_skip(
    title: str,
    snippet: str,
    keyword: str,
    theme_keywords: list[str],
    related_terms: list[str] | None = None,
) -> str | None:
    """Skip search hits with no theme signal in title or snippet.

    Does not require the search keyword itself; a same-theme keyword or
    related term is enough to fetch the body for a stronger check.
    """
    blob = f"{title or ''}\n{snippet or ''}"
    phrases = _signal_phrases(keyword, theme_keywords, related_terms or [])
    if _unique_phrase_hits(blob, phrases):
        return None
    return "no_theme_signal_in_title_or_snippet"


def is_speech_like_title(title: str) -> bool:
    return bool(SPEECH_TITLE_HINT.search(title or ""))


def relevance_should_skip(
    title: str,
    body: str,
    keyword: str,
    theme_keywords: list[str],
    min_body_hits: int = 3,
    related_terms: list[str] | None = None,
    min_distinct_signals: int = 2,
) -> str | None:
    """Skip articles that only incidentally mention the theme.

    Keep when:
    1. Title looks like a speech / signed article, or carries a theme signal; and
    2. Body actually discusses the theme (several distinct related phrases, or
       repeated exact hits), not a single passing mention.

    Photo captions and wire datelines in the body are not stripped here.
    """
    title = title or ""
    body = body or ""
    related_terms = related_terms or []
    phrases = _signal_phrases(keyword, theme_keywords, related_terms)
    title_hits = _unique_phrase_hits(title, phrases)
    body_hits_list = _unique_phrase_hits(body, phrases)
    body_hit_total = sum(count_exact_phrase(body, phrase) for phrase in phrases)
    search_body_hits = count_exact_phrase(body, keyword)

    speech_like = is_speech_like_title(title)
    if not speech_like and not title_hits:
        return "not_speech_or_theme_title"

    if title_hits and (body_hits_list or keyword in title):
        return None

    if speech_like:
        if len(body_hits_list) >= min_distinct_signals and body_hit_total >= 3:
            return None
        if keyword and search_body_hits >= min_body_hits:
            return None

    hint = ""
    if title_hits:
        hint += f",title_theme={title_hits[0]}"
    if speech_like:
        hint += ",speech_like_title"
    return (
        f"weak_topic_match:distinct={len(body_hits_list)}"
        f",hits={body_hit_total},keyword_hits={search_body_hits}{hint}"
    )
