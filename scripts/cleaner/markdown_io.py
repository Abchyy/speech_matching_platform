from __future__ import annotations

from typing import Any

from rules import ASCII_EDGE


def yaml_scalar(value: Any) -> str:
    if value is None:
        return "null"
    text = str(value)
    if text == "" or any(ch in text for ch in ":#{}[]&*!|>'\"%@`") or text[:1] in "-?":
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return text


def parse_raw_markdown(text: str) -> dict[str, Any]:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("raw markdown missing YAML front matter")
    front = parts[1]
    rest = parts[2].lstrip("\n")

    fields: dict[str, Any] = {}
    for raw_line in front.splitlines():
        line = raw_line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("-"):
            continue
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip().strip('"')
        if key in {"retrieval_keywords", "themes"}:
            continue
        if value in {"", "[]"}:
            continue
        fields[key] = value if value != "null" else None

    title = fields.get("title") or ""
    body = rest
    if body.startswith("#"):
        first, _, remainder = body.partition("\n")
        heading = first[1:].strip(ASCII_EDGE)
        if not title:
            fields["title"] = heading
        body = remainder.lstrip("\n")
    fields["body"] = body.rstrip("\n")
    return fields


def render_canonical(record: dict[str, Any], full_text: str) -> str:
    lines = ["---"]
    for key in (
        "speechId",
        "title",
        "date",
        "source",
        "origin",
        "url",
        "article_id",
        "canonical_note",
        "sha256",
        "raw_path",
    ):
        if record.get(key) not in (None, ""):
            lines.append(f"{key}: {yaml_scalar(record[key])}")
    lines.append("---")
    lines.append("")
    title = (record.get("title") or "").strip(ASCII_EDGE)
    lines.append(f"# {title}" if title else "#")
    lines.append("")
    lines.append(full_text.rstrip("\n"))
    lines.append("")
    return "\n".join(lines)
