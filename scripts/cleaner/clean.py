#!/usr/bin/env python3
"""Raw Capture → Canonical Document cleaner.

Smoke test:
    python scripts/cleaner/clean.py --smoke

Full corpus:
    python scripts/cleaner/clean.py --all

Does not modify corpus/raw/. Does not rewrite speech body characters.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from markdown_io import parse_raw_markdown, render_canonical  # noqa: E402
from rules import (  # noqa: E402
    classify_paragraph,
    join_paragraphs,
    note_text,
    split_paragraphs,
)


REPO_ROOT = HERE.parents[1]
RAW_DIR = REPO_ROOT / "corpus" / "raw"
CLEAN_DIR = REPO_ROOT / "corpus" / "cleaned"
DEDUP_PATH = REPO_ROOT / "corpus" / "dedup.json"
SMOKE_IDS = ("speech_001", "speech_002", "speech_003")

INLINE_NOISE = re.compile(
    r"（新华社[^）]{0,40}电）|/摄|新华社记者|《\s*人民日报\s*》|全文如下"
)
NEWS_TITLE = re.compile(
    r"强调|主持|在京召开|作出重要指示|李克强主持|看望慰问"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean Raw Capture into Canonical Documents")
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Clean only speech_001 to speech_003",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Clean every speech_*.md under corpus/raw/",
    )
    parser.add_argument(
        "--ids",
        nargs="+",
        default=None,
        help="Explicit speech ids, e.g. speech_001 speech_002",
    )
    return parser.parse_args()


def dropped_ids() -> set[str]:
    if not DEDUP_PATH.exists():
        return set()
    data = json.loads(DEDUP_PATH.read_text(encoding="utf-8"))
    return set((data.get("dropped") or {}).keys())


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def list_raw_ids() -> list[str]:
    ids = []
    for path in sorted(RAW_DIR.glob("speech_*.md")):
        ids.append(path.stem)
    return ids


def review_flags(title: str, full_text: str, kept_count: int) -> list[str]:
    flags: list[str] = []
    compact = re.sub(r"\s+", "", full_text or "")
    if kept_count == 0 or not compact:
        flags.append("empty_body")
    elif len(compact) < 200:
        flags.append("short_body")
    if INLINE_NOISE.search(full_text or ""):
        flags.append("inline_noise_left")
    if NEWS_TITLE.search(title or ""):
        flags.append("news_like_title")
    return flags


def clean_one(speech_id: str) -> dict:
    raw_path = RAW_DIR / f"{speech_id}.md"
    if not raw_path.exists():
        raise FileNotFoundError(raw_path)
    raw_bytes = raw_path.read_bytes()
    raw_text = raw_bytes.decode("utf-8")
    parsed = parse_raw_markdown(raw_text)
    title = parsed.get("title") or ""
    body = parsed.get("body") or ""
    paragraphs = split_paragraphs(body)
    kept: list[str] = []
    removed: list[dict[str, str]] = []
    notes: list[str] = []
    for para in paragraphs:
        action, reason = classify_paragraph(para, title)
        if action == "keep":
            kept.append(para)
        elif action == "note":
            notes.append(note_text(para))
            removed.append({"reason": f"moved:{reason}", "text": para})
        else:
            removed.append({"reason": reason or "drop", "text": para})
    full_text = join_paragraphs(kept)
    note = "\n".join(notes) if notes else None
    record = {
        "speechId": parsed.get("id") or speech_id,
        "title": title,
        "date": parsed.get("date"),
        "source": parsed.get("source") or "人民网",
        "origin": parsed.get("origin"),
        "url": parsed.get("url"),
        "article_id": parsed.get("article_id"),
        "canonical_note": note,
        "sha256": sha256_text(full_text),
        "raw_path": f"corpus/raw/{speech_id}.md",
    }
    CLEAN_DIR.mkdir(parents=True, exist_ok=True)
    out_path = CLEAN_DIR / f"{speech_id}.md"
    out_path.write_text(render_canonical(record, full_text), encoding="utf-8")
    after_raw = raw_path.read_bytes()
    if after_raw != raw_bytes:
        raise RuntimeError(f"raw file was modified: {raw_path}")
    flags = review_flags(title, full_text, len(kept))
    return {
        "speechId": record["speechId"],
        "title": title,
        "raw_path": str(raw_path),
        "cleaned_path": str(out_path),
        "sha256": record["sha256"],
        "canonical_note": note,
        "paragraphs_in": len(paragraphs),
        "paragraphs_kept": len(kept),
        "paragraphs_removed": len(removed),
        "chars_in": len(body),
        "chars_out": len(full_text),
        "removed": removed,
        "flags": flags,
    }


def print_detail(result: dict) -> None:
    print("=" * 72)
    print(f"{result['speechId']}  {result['title']}")
    print(f"cleaned:  {result['cleaned_path']}")
    print(f"sha256:   {result['sha256']}")
    print(
        f"paragraphs: {result['paragraphs_in']} → {result['paragraphs_kept']} "
        f"(removed {result['paragraphs_removed']})"
    )
    if result.get("canonical_note"):
        print(f"canonical_note: {result['canonical_note']}")
    if result["flags"]:
        print(f"review_flags: {', '.join(result['flags'])}")
    if result["removed"]:
        print("removed/moved:")
        for i, item in enumerate(result["removed"], 1):
            preview = item["text"].replace("\n", "\\n")
            if len(preview) > 160:
                preview = preview[:160] + "…"
            print(f"  [{i}] {item['reason']}: {preview}")


def main() -> int:
    args = parse_args()
    if args.ids:
        ids = list(args.ids)
    elif args.smoke:
        ids = list(SMOKE_IDS)
    elif args.all:
        skip = dropped_ids()
        ids = [sid for sid in list_raw_ids() if sid not in skip]
        if skip:
            print(f"Skip {len(skip)} duplicate ids listed in corpus/dedup.json")
    else:
        print("Specify --smoke, --all, or --ids.")
        return 2

    CLEAN_DIR.mkdir(parents=True, exist_ok=True)
    ok = 0
    errors: list[tuple[str, str]] = []
    review: list[dict] = []
    for speech_id in ids:
        try:
            result = clean_one(speech_id)
        except Exception as exc:
            errors.append((speech_id, str(exc)))
            print(f"[ERROR] {speech_id}: {exc}")
            continue
        ok += 1
        if args.smoke or args.ids:
            print_detail(result)
        elif result["flags"] or result.get("canonical_note"):
            note = f" note={result['canonical_note'][:40]}…" if result.get("canonical_note") and len(result.get("canonical_note") or "") > 40 else (
                f" note={result['canonical_note']}" if result.get("canonical_note") else ""
            )
            flags = ",".join(result["flags"]) if result["flags"] else ""
            print(f"[OK] {result['speechId']} removed={result['paragraphs_removed']}{note} {flags}".rstrip())
        if result["flags"]:
            review.append(result)

    print("=" * 72)
    print(f"success: {ok}")
    print(f"errors:  {len(errors)}")
    if errors:
        for speech_id, message in errors:
            print(f"  {speech_id}: {message}")
    print(f"review:  {len(review)}")
    for item in review:
        print(f"  {item['speechId']}: {', '.join(item['flags'])} | {item['title'][:80]}")
    print("Raw Capture files were not modified.")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
