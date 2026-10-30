"""Private bench configuration: servers, accounts and cast targets.

The real file never enters git. `E2E_BENCH_CONFIG` points at it, otherwise
`e2e/bench/config.local.json` is read; `config.example.json` documents the shape.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

BENCH_DIR = Path(__file__).resolve().parent
EXAMPLE_PATH = BENCH_DIR / "config.example.json"
DEFAULT_PATH = BENCH_DIR / "config.local.json"
ENV_VAR = "E2E_BENCH_CONFIG"
CAST_KINDS = ("chromecast-gen3", "google-tv-streamer", "cast-audio")


class BenchConfigError(Exception):
    """Names the file and the dotted field that made the configuration unusable."""


@dataclass
class Account:
    username: str
    password: str = field(repr=False)

    def __str__(self) -> str:
        return f"Account(username={self.username!r}, password=[masked])"

    __repr__ = __str__


@dataclass
class Server:
    name: str
    url: str
    label: str
    accounts: dict[str, Account]

    def account(self, profile: str) -> Account:
        if profile not in self.accounts:
            raise BenchConfigError(f"server {self.name} has no account profile {profile!r}; known: {', '.join(sorted(self.accounts))}")
        return self.accounts[profile]


@dataclass
class CastTarget:
    name: str
    host: str
    kind: str


@dataclass
class Targets:
    chromecasts: list[CastTarget]


@dataclass
class BenchConfig:
    servers: dict[str, Server]
    targets: Targets
    keep_dir: Path
    redact: list[str]

    def server(self, name: str) -> Server:
        if name not in self.servers:
            raise BenchConfigError(f"no server {name!r} in the bench configuration; known: {', '.join(self.servers)}")
        return self.servers[name]

    def chromecast(self, name: str) -> CastTarget:
        for target in self.targets.chromecasts:
            if target.name == name:
                return target
        known = ", ".join(t.name for t in self.targets.chromecasts) or "none"
        raise BenchConfigError(f"no cast target {name!r} in the bench configuration; known: {known}")


def _require(node: Any, key: str, path: str, file: Path, expected: type = str) -> Any:
    if not isinstance(node, dict) or key not in node:
        raise BenchConfigError(f"{file}: missing field {path}.{key}" if path else f"{file}: missing field {key}")
    value = node[key]
    if not isinstance(value, expected):
        raise BenchConfigError(f"{file}: field {path}.{key} must be {expected.__name__}")
    return value


def _parse_accounts(raw: dict, path: str, file: Path) -> dict[str, Account]:
    accounts = {}
    for profile, entry in raw.items():
        accounts[profile] = Account(
            username=_require(entry, "username", f"{path}.{profile}", file),
            password=_require(entry, "password", f"{path}.{profile}", file),
        )
    return accounts


def _parse_servers(raw: dict, file: Path) -> dict[str, Server]:
    servers = {}
    for name, entry in raw.items():
        path = f"servers.{name}"
        servers[name] = Server(
            name=name,
            url=_require(entry, "url", path, file).rstrip("/"),
            label=_require(entry, "label", path, file),
            accounts=_parse_accounts(_require(entry, "accounts", path, file, dict), f"{path}.accounts", file),
        )
    return servers


def _parse_targets(raw: dict, file: Path) -> Targets:
    chromecasts = []
    for index, entry in enumerate(_require(raw, "chromecasts", "targets", file, list)):
        path = f"targets.chromecasts[{index}]"
        kind = _require(entry, "kind", path, file)
        if kind not in CAST_KINDS:
            raise BenchConfigError(f"{file}: field {path}.kind must be one of {', '.join(CAST_KINDS)}")
        chromecasts.append(CastTarget(name=_require(entry, "name", path, file), host=_require(entry, "host", path, file), kind=kind))
    return Targets(chromecasts=chromecasts)


def resolve_path(path: Path | None = None) -> Path:
    if path is not None:
        return Path(path)
    if os.environ.get(ENV_VAR):
        return Path(os.environ[ENV_VAR])
    return DEFAULT_PATH


def load_config(path: Path | None = None) -> BenchConfig:
    file = resolve_path(path)
    if not file.is_file():
        raise BenchConfigError(
            f"{file}: bench configuration not found; copy {EXAMPLE_PATH} to this path, or point {ENV_VAR} at your file"
        )
    try:
        raw = json.loads(file.read_text())
    except json.JSONDecodeError as error:
        raise BenchConfigError(f"{file}: invalid JSON ({error})") from error
    servers = _parse_servers(_require(raw, "servers", "", file, dict), file)
    targets = _parse_targets(_require(raw, "targets", "", file, dict), file)
    keep_dir = Path(_require(raw, "keep_dir", "", file)).expanduser()
    return BenchConfig(servers=servers, targets=targets, keep_dir=keep_dir, redact=_redaction_list(raw, servers, targets, file))


def _redaction_list(raw: dict, servers: dict[str, Server], targets: Targets, file: Path) -> list[str]:
    """Every private host of the configuration, so reports mask them without anyone listing them."""
    listed = raw.get("redact", [])
    # A bare string would be masked letter by letter, and null would fail far from the file.
    if not isinstance(listed, list) or not all(isinstance(entry, str) for entry in listed):
        raise BenchConfigError(f"{file}: field redact must be a list of strings")
    entries = list(listed)
    for server in servers.values():
        host = urlparse(server.url).hostname
        if host:
            entries.append(host)
    entries.extend(target.host for target in targets.chromecasts)
    return list(dict.fromkeys(entry for entry in entries if entry))
