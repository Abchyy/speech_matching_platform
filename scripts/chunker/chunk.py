#!/usr/bin/env python3
"""Canonical Document → Chunk.

    python scripts/chunker/chunk.py

Reads corpus/cleaned/, writes corpus/chunks/{speechId}.json.
Does not modify cleaned files. Does not embed.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
CLEANER = HERE.parent / "cleaner"
for extra in (HERE, CLEANER):
    if str(extra) not in sys.path:
        sys.path.insert(0, str(extra))

from markdown_io import parse_raw_markdown  # noqa: E402
from split import MAX_CHARS, MIN_CHARS, chunk_spans, measure  # noqa: E402


REPO_ROOT = HERE.parents[1]
CLEAN_DIR = REPO_ROOT / "corpus" / "cleaned"
CHUNK_DIR = REPO_ROOT / "corpus" / "chunks"
DEDUP_PATH = REPO_ROOT / "corpus" / "dedup.json"

SHORT_FLAG = 120
LONG_FLAG = 1000


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Split Canonical Documents into chunks")
    parser.add_argument(
        "--ids",
        nargs="+",
        default=None,
        help="Optional speech ids; default is all cleaned files",
    )
    return parser.parse_args()


def dropped_ids() -> set[str]:
    if not DEDUP_PATH.exists():
        return set()
    data = json.loads(DEDUP_PATH.read_text(encoding="utf-8"))
    return set((data.get("dropped") or {}).keys())


def list_speech_ids() -> list[str]:
    skip = dropped_ids()
    return [
        path.stem
        for path in sorted(CLEAN_DIR.glob("speech_*.md"))
        if path.stem not in skip
    ]


def chunk_document(speech_id: str) -> dict:
    path = CLEAN_DIR / f"{speech_id}.md"
    raw_bytes = path.read_bytes()
    parsed = parse_raw_markdown(raw_bytes.decode("utf-8"))
    full_text = parsed.get("body") or ""
    title = parsed.get("title") or ""
    date = parsed.get("date")
    source = parsed.get("source") or "人民网"
    url = parsed.get("url")
    doc_id = parsed.get("speechId") or parsed.get("id") or speech_id

    chunks: list[dict] = []
    issues: list[str] = []
    for index, (start, end) in enumerate(chunk_spans(full_text)):
        text = full_text[start:end]
        if full_text[start:end] != text or text not in full_text:
            issues.append(f"not_substring:{index}")
        length = measure(text)
        flags: list[str] = []
        if not length:
            flags.append("empty")
        if length and length < SHORT_FLAG:
            flags.append("short")
        if length > LONG_FLAG:
            flags.append("long")
        chunk_id = f"{doc_id}_c{index:03d}"
        chunks.append(
            {
                "chunkId": chunk_id,
                "speechId": doc_id,
                "chunkIndex": index,
                "title": title,
                "date": date,
                "source": source,
                "url": url,
                "text": text,
                "charStart": start,
                "charEnd": end,
                "charCount": length,
            }
        )
        if flags:
            issues.extend(f"{chunk_id}:{flag}" for flag in flags)

    if path.read_bytes() != raw_bytes:
        raise RuntimeError(f"cleaned file was modified: {path}")

    out_path = CHUNK_DIR / f"{doc_id}.json"
    out_path.write_text(
        json.dumps(chunks, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "speechId": doc_id,
        "title": title,
        "n_chunks": len(chunks),
        "full_chars": measure(full_text),
        "chunks": chunks,
        "issues": issues,
        "missing_title": not bool(title),
        "missing_date": not bool(date),
        "missing_source": not bool(source),
        "missing_url": not bool(url),
    }


def main() -> int:
    args = parse_args()
    ids = args.ids or list_speech_ids()
    CHUNK_DIR.mkdir(parents=True, exist_ok=True)
    for dropped in dropped_ids():
        leftover = CHUNK_DIR / f"{dropped}.json"
        if leftover.exists():
            leftover.unlink()

    docs = 0
    all_chunks: list[dict] = []
    anomalies: list[str] = []
    errors: list[tuple[str, str]] = []

    for speech_id in ids:
        try:
            result = chunk_document(speech_id)
        except Exception as exc:
            errors.append((speech_id, str(exc)))
            continue
        docs += 1
        all_chunks.extend(result["chunks"])
        if result["n_chunks"] == 0:
            anomalies.append(f"{speech_id}:no_chunks")
        if result["missing_title"]:
            anomalies.append(f"{speech_id}:missing_title")
        if result["missing_date"]:
            anomalies.append(f"{speech_id}:missing_date")
        if result["missing_source"]:
            anomalies.append(f"{speech_id}:missing_source")
        anomalies.extend(result["issues"])

    empty = [c["chunkId"] for c in all_chunks if measure(c["text"]) == 0]
    short = [c["chunkId"] for c in all_chunks if 0 < measure(c["text"]) < SHORT_FLAG]
    long = [c["chunkId"] for c in all_chunks if measure(c["text"]) > LONG_FLAG]

    text_counts = Counter(c["text"] for c in all_chunks)
    dup_groups = {text: [] for text, n in text_counts.items() if n > 1}
    for chunk in all_chunks:
        if chunk["text"] in dup_groups:
            dup_groups[chunk["text"]].append(chunk["chunkId"])
    dup_chunks = [cid for ids in dup_groups.values() for cid in ids]
    pair_counts: Counter[tuple[str, ...]] = Counter()
    for ids in dup_groups.values():
        speeches = tuple(sorted({cid.rsplit("_c", 1)[0] for cid in ids}))
        pair_counts[speeches] += 1

    within_dup: list[str] = []
    by_speech: dict[str, list[str]] = {}
    for chunk in all_chunks:
        by_speech.setdefault(chunk["speechId"], []).append(chunk["text"])
    for speech_id, texts in by_speech.items():
        counted = Counter(texts)
        for text, n in counted.items():
            if n > 1:
                within_dup.append(speech_id)

    not_substr = []
    for chunk in all_chunks:
        cleaned = (CLEAN_DIR / f"{chunk['speechId']}.md").read_text(encoding="utf-8")
        parsed = parse_raw_markdown(cleaned)
        full = parsed.get("body") or ""
        start = chunk["charStart"]
        end = chunk["charEnd"]
        if full[start:end] != chunk["text"] or chunk["text"] not in full:
            not_substr.append(chunk["chunkId"])

    below_min = [c["chunkId"] for c in all_chunks if 0 < measure(c["text"]) < MIN_CHARS]
    over_max = [c["chunkId"] for c in all_chunks if measure(c["text"]) > MAX_CHARS]

    print("=" * 72)
    print(f"documents: {docs}")
    print(f"chunks:    {len(all_chunks)}")
    print(f"target:    {MIN_CHARS}–{MAX_CHARS} non-whitespace chars; no overlap")
    print(f"errors:    {len(errors)}")
    for speech_id, message in errors:
        print(f"  {speech_id}: {message}")
    print(f"empty:     {len(empty)}")
    print(f"short(<{SHORT_FLAG}): {len(short)}")
    if short:
        print("  " + ", ".join(short[:20]) + (" …" if len(short) > 20 else ""))
    print(f"below_target(<{MIN_CHARS}): {len(below_min)}")
    print(f"over_target(>{MAX_CHARS}): {len(over_max)}")
    print(f"long(>{LONG_FLAG}): {len(long)}")
    if long:
        print("  " + ", ".join(long[:20]) + (" …" if len(long) > 20 else ""))
    print(f"within_speech_duplicates: {len(set(within_dup))}")
    print(f"cross_doc_duplicate_groups: {len(dup_groups)}")
    print(f"cross_doc_duplicate_chunks: {len(dup_chunks)}")
    for pair, n in pair_counts.most_common():
        print(f"  {pair}: {n} shared chunks")
    print(f"not_substring: {len(not_substr)}")
    split_anomalies = (
        len(errors)
        + len(empty)
        + len(short)
        + len(long)
        + len(set(within_dup))
        + len(not_substr)
        + len([a for a in anomalies if a.endswith(":no_chunks")])
    )
    print(f"split_anomalies: {split_anomalies}")
    print("Canonical files were not modified. Embedding / LanceDB not started.")
    return 1 if errors or not_substr or empty else 0


if __name__ == "__main__":
    raise SystemExit(main())
