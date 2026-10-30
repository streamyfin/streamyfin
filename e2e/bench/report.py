"""Run reports: raw JSON for the bench, redacted Markdown for anything that gets published."""

from __future__ import annotations

import json
import re
import shutil
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

MASK = "[masqué]"
# Anchored on the bench, not on the working directory: a run started from e2e/ would otherwise
# write to e2e/e2e/reports, which neither git nor Biome ignores.
REPORTS_DIR = Path(__file__).resolve().parents[1] / "reports"
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
        self.steps.append({"step": step, "at": _now(), "data": data})

    def add_markdown(self, step: str, text: str) -> None:
        """A section already written in Markdown, a table say: published as it is, not as a JSON string."""
        self.steps.append({"step": step, "at": _now(), "markdown": text})

    def to_markdown(self) -> str:
        lines = [f"# {self.name}", "", f"Captured {self.created_at.isoformat(timespec='seconds')}", ""]
        for entry in self.steps:
            lines += [f"## {entry['step']} ({entry['at']})", ""]
            if "markdown" in entry:
                lines += [entry["markdown"], ""]
            else:
                lines += ["```json", json.dumps(entry["data"], indent=2, default=str), "```", ""]
        return redact_text("\n".join(lines), self.redact)

    def save(self, reports_dir: Path | None = None) -> ReportPaths:
        if self.paths is None:
            folder = Path(reports_dir or REPORTS_DIR) / self.created_at.strftime("%Y-%m-%d")
            folder.mkdir(parents=True, exist_ok=True)
            self.paths = _new_paths(folder, f"{self.name}-{self.created_at.strftime('%H%M%S')}")
        self.paths.json.write_text(json.dumps({"name": self.name, "createdAt": self.created_at.isoformat(), "steps": self.steps}, indent=2, default=str) + "\n")
        self.paths.markdown.write_text(self.to_markdown())
        return self.paths

    def keep(self, subject: str, keep_dir: Path) -> Path:
        """Copy the redacted Markdown, never the raw JSON, into the durable evidence folder. The folder
        gathers the runs of many days, so the copy carries its date and never replaces another one."""
        if self.paths is None:
            raise RuntimeError("save() the report before keep()")
        target_dir = Path(keep_dir).expanduser() / subject
        target_dir.mkdir(parents=True, exist_ok=True)
        name = f"{self.created_at.strftime('%Y-%m-%d')}-{self.paths.markdown.stem}"
        target = target_dir / f"{name}.md"
        counter = 2
        while target.exists():
            target = target_dir / f"{name}-{counter}.md"
            counter += 1
        shutil.copyfile(self.paths.markdown, target)
        return target


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _new_paths(folder: Path, stem: str) -> ReportPaths:
    # Two runs of one tool in the same second, an observation before and after a pause say, must not
    # share a file: a short random suffix keeps them apart, and one already taken is drawn again.
    while True:
        name = f"{stem}-{uuid.uuid4().hex[:4]}"
        paths = ReportPaths(json=folder / f"{name}.json", markdown=folder / f"{name}.md")
        if not paths.json.exists() and not paths.markdown.exists():
            return paths
