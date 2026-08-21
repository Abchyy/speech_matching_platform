"""Conservative Raw → Canonical noise rules.

Only whole-paragraph deletion or relocation. Kept paragraph strings are
copied unchanged: no punctuation fix, no 简繁 conversion, no rewrite.
"""

from __future__ import annotations

import re


ASCII_EDGE = " \t\r\n"

# （新华社上海7月17日电） / 新华社北京5月28日电
XINHUA_WIRE = re.compile(r"^（?新华社[^）\n]{1,40}电）?$")

# 《 人民日报 》（ 2026年07月18日 02 版）
PEOPLE_DAILY_EDITION = re.compile(
    r"^《\s*人民日报\s*》\s*（\s*\d{4}年\d{1,2}月\d{1,2}日[^）]*版\s*）$"
)

PHOTO_CREDIT = re.compile(
    r"(新华社记者|本报记者|新华社发|记者).{0,80}[／/]?\s*摄\s*$"
)
PHOTO_CAPTION = re.compile(
    r"(图为|这是\d|资料照片|资料图).{0,400}[／/]?\s*摄\s*$"
)

EDITOR_LINE = re.compile(
    r"^(（?\s*(责任编辑|责编|编辑)\s*[：:].+）?)$"
)

EDITOR_FOOTNOTE = re.compile(r"^※")
AUTHOR_BYLINE = re.compile(r"^(习近平|习近平主席)$")
SPEECH_DATE_LINE = re.compile(
    r"^（\d{4}年\d{1,2}月\d{1,2}日[^）]{0,40}）$"
)
XINHUA_LEAD = re.compile(r"^新华社.{0,40}电")
PULL_QUOTE = re.compile(r"^■")
THE_END = re.compile(r"^（完）$")
SPEAKER_PREFIX = re.compile(r"^习近平[：:]")


def _compact(paragraph: str) -> str:
    """ASCII-trim plus drop leading ideographic indents for matching only."""
    text = (paragraph or "").strip(ASCII_EDGE)
    return text.lstrip("\u3000")


def note_text(paragraph: str) -> str:
    """Keep note characters/punctuation; only strip layout indent."""
    return _compact(paragraph)


def is_duplicate_title(paragraph: str, title: str) -> bool:
    compact = _compact(paragraph).rstrip("※").strip(ASCII_EDGE)
    expected = (title or "").strip(ASCII_EDGE)
    if not expected or not compact:
        return False
    if compact == expected:
        return True
    without_speaker = SPEAKER_PREFIX.sub("", expected).strip(ASCII_EDGE)
    return bool(without_speaker) and compact == without_speaker


def classify_paragraph(paragraph: str, title: str | None = None) -> tuple[str, str | None]:
    """Return (action, reason). action is keep, drop, or note."""
    compact = _compact(paragraph)
    if not compact:
        return "drop", "empty_paragraph"
    heading = compact[2:].strip(ASCII_EDGE) if compact.startswith("#") else compact
    if title and (
        is_duplicate_title(paragraph, title) or is_duplicate_title(heading, title)
    ):
        return "drop", "duplicate_title"
    if AUTHOR_BYLINE.match(compact):
        return "drop", "author_byline"
    if XINHUA_WIRE.match(compact):
        return "drop", "xinhua_dateline"
    if PEOPLE_DAILY_EDITION.match(compact):
        return "drop", "people_daily_edition"
    if PHOTO_CREDIT.search(compact) or PHOTO_CAPTION.search(compact):
        return "drop", "photo_caption"
    if EDITOR_FOOTNOTE.match(compact):
        return "note", "source_note"
    if SPEECH_DATE_LINE.match(compact):
        return "note", "speech_date_line"
    if EDITOR_LINE.match(compact):
        return "drop", "editor_line"
    if PULL_QUOTE.match(compact):
        return "drop", "pull_quote"
    if THE_END.match(compact):
        return "drop", "the_end"
    if XINHUA_LEAD.match(compact) and "全文如下" in compact:
        return "drop", "xinhua_lead"
    return "keep", None


def split_paragraphs(body: str) -> list[str]:
    """Split on blank lines. Do not rewrite characters inside a paragraph."""
    if not body:
        return []
    parts = re.split(r"\n[ \t]*\n+", body.replace("\r\n", "\n").replace("\r", "\n"))
    return [part for part in parts if part.strip(ASCII_EDGE)]


def join_paragraphs(paragraphs: list[str]) -> str:
    return "\n\n".join(paragraphs)
