"""Canonical fullText → chunk spans.

Architecture 7.2 / 7.3:
- Natural paragraph first, then sentence boundaries (。！？；)
- Never cut inside a sentence
- Target about 300–800 non-whitespace characters
- No fixed overlap (MVP)

Chunk text is always fullText[start:end], unmodified.
"""

from __future__ import annotations

import re

MIN_CHARS = 300
MAX_CHARS = 800
SENTENCE_END = frozenset("。！？；")
PARA_SPLIT = re.compile(r"\n[ \t]*\n+")


def measure(text: str) -> int:
    return len(re.sub(r"\s+", "", text or ""))


def paragraph_spans(full_text: str) -> list[tuple[int, int]]:
    text = full_text or ""
    spans: list[tuple[int, int]] = []
    start = 0
    for match in PARA_SPLIT.finditer(text):
        if start < match.start() and text[start : match.start()].strip(" \t\r\n"):
            spans.append((start, match.start()))
        start = match.end()
    if start < len(text) and text[start:].strip(" \t\r\n"):
        spans.append((start, len(text)))
    return spans


def sentence_spans(full_text: str, start: int, end: int) -> list[tuple[int, int]]:
    text = full_text[start:end]
    if not text:
        return []
    cuts: list[int] = []
    i = 0
    while i < len(text):
        if text[i] in SENTENCE_END:
            j = i + 1
            while j < len(text) and text[j] in " \t\u3000":
                j += 1
            cuts.append(j)
            i = j
            continue
        i += 1
    if not cuts or cuts[-1] != len(text):
        cuts.append(len(text))
    spans: list[tuple[int, int]] = []
    prev = 0
    for cut in cuts:
        if cut > prev:
            spans.append((start + prev, start + cut))
            prev = cut
    return spans or [(start, end)]


def pack_spans(
    full_text: str,
    units: list[tuple[int, int]],
    min_chars: int = MIN_CHARS,
    max_chars: int = MAX_CHARS,
) -> list[tuple[int, int]]:
    packed: list[tuple[int, int]] = []
    cur_start: int | None = None
    cur_end: int | None = None
    for unit_start, unit_end in units:
        incoming_len = measure(full_text[unit_start:unit_end])
        if cur_start is None:
            cur_start, cur_end = unit_start, unit_end
            continue
        merged_len = measure(full_text[cur_start:unit_end])
        current_len = measure(full_text[cur_start:cur_end])
        if merged_len <= max_chars:
            cur_end = unit_end
        elif current_len < min_chars and incoming_len < min_chars:
            cur_end = unit_end
        else:
            packed.append((cur_start, cur_end))
            cur_start, cur_end = unit_start, unit_end
    if cur_start is not None and cur_end is not None:
        packed.append((cur_start, cur_end))
    return _absorb_short(full_text, packed, min_chars)


def _absorb_short(
    full_text: str,
    packed: list[tuple[int, int]],
    min_chars: int,
) -> list[tuple[int, int]]:
    """Merge leftover short chunks into a neighbor so closings are not orphaned."""
    if len(packed) <= 1:
        return packed
    result = list(packed)
    i = 0
    while i < len(result):
        start, end = result[i]
        if measure(full_text[start:end]) >= min_chars:
            i += 1
            continue
        if i > 0:
            prev_start, _prev_end = result[i - 1]
            result[i - 1] = (prev_start, end)
            result.pop(i)
            continue
        if i + 1 < len(result):
            _next_start, next_end = result[i + 1]
            result[i] = (start, next_end)
            result.pop(i + 1)
            continue
        i += 1
    return result


def chunk_spans(full_text: str) -> list[tuple[int, int]]:
    units: list[tuple[int, int]] = []
    for start, end in paragraph_spans(full_text):
        if measure(full_text[start:end]) <= MAX_CHARS:
            units.append((start, end))
        else:
            units.extend(
                pack_spans(
                    full_text,
                    sentence_spans(full_text, start, end),
                    min_chars=1,
                    max_chars=MAX_CHARS,
                )
            )
    if not units:
        return []
    return pack_spans(full_text, units)
