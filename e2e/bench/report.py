"""Run reports: raw JSON for the bench, redacted Markdown for anything that gets published."""

from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

MASK = "[masqué]"
SECRET_PATTERNS = (
    re.compile(r'(accessToken"?\s*[:=]\s*"?)([^"\s,}]+)', re.IGNORECASE),
    re.compile(r'(X-Emby-Token"?\s*[:=]?\s*"?)([^"\s,}]+)', re.IGNORECASE),
    re.compile(r"(api_key=)([^&\s\"']+)", re.IGNORECASE),
    re.compile(r'(Token=")([^"]+)'),
    re.compile(r'("Pw"\s*:\s*")([^"]+)'),
    re.compile(r'("password"\s*:\s*")([^"]+)', re.IGNORECASE),
)


def redact_text(text: str, extra: list[str] | tuple[str, ...] = ()) -> str:
    for pattern in SECRET_PATTERNS:
        text = pattern.sub(lambda match: match.group(1) + MASK, text)
    # Longest first: a configured suffix masked before the full host would leave its labels behind.
    for host in sorted({entry for entry in extra if entry}, key=len, reverse=True):
        text = text.replace(host, MASK)
    return text


@dataclass(frozen=True)
class ReportPaths:
    json: Path
    markdown: Path


class Report:
    def __init__(self, name: str, redact: list[str] | tuple[str, ...] = ()):
        self.name = name
        self.redact = list(redact)
        self.created_at = datetime.now(timezone.utc)
        self.steps: list[dict] = []
        self.paths: ReportPaths | None = None

    def add(self, step: str, **data) -> None:
        self.steps.append({"step": step, "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "data": data})

    def to_markdown(self) -> str:
        lines = [f"# {self.name}", "", f"Captured {self.created_at.isoformat(timespec='seconds')}", ""]
        for entry in self.steps:
            lines += [f"## {entry['step']} ({entry['at']})", "", "```json", json.dumps(entry["data"], indent=2, default=str), "```", ""]
        return redact_text("\n".join(lines), self.redact)

    def save(self, reports_dir: Path = Path("e2e/reports")) -> ReportPaths:
        folder = Path(reports_dir) / self.created_at.strftime("%Y-%m-%d")
        folder.mkdir(parents=True, exist_ok=True)
        stem = f"{self.name}-{self.created_at.strftime('%H%M')}"
        json_path = folder / f"{stem}.json"
        markdown_path = folder / f"{stem}.md"
        json_path.write_text(json.dumps({"name": self.name, "createdAt": self.created_at.isoformat(), "steps": self.steps}, indent=2, default=str) + "\n")
        markdown_path.write_text(self.to_markdown())
        self.paths = ReportPaths(json=json_path, markdown=markdown_path)
        return self.paths

    def keep(self, subject: str, keep_dir: Path) -> Path:
        """Copy the redacted Markdown, never the raw JSON, into the durable evidence folder."""
        if self.paths is None:
            raise RuntimeError("save() the report before keep()")
        target_dir = Path(keep_dir).expanduser() / subject
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / self.paths.markdown.name
        shutil.copyfile(self.paths.markdown, target)
        return target
