from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")


class Logger:
    """Simple [INFO]/[SKIP]/[WARN]/[ERROR] logger for crawler runs."""

    def __init__(self, log_path: Path | None = None) -> None:
        self.log_path = log_path
        if log_path is not None:
            log_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass

    def _write(self, level: str, message: str) -> None:
        line = f"[{level}] {message}"
        print(line, flush=True)
        if self.log_path is not None:
            with self.log_path.open("a", encoding="utf-8") as fh:
                fh.write(f"{_now()} {line}\n")

    def info(self, message: str) -> None:
        self._write("INFO", message)

    def skip(self, message: str) -> None:
        self._write("SKIP", message)

    def warn(self, message: str) -> None:
        self._write("WARN", message)

    def error(self, message: str) -> None:
        self._write("ERROR", message)
