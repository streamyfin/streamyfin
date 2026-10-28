"""Playback matrix: plays the cases of e2e/fixtures/media.json on one Cast target and records
what the receiver and the server say about each one.

Expectations are hypotheses: a mismatch is reported with both values, never hidden.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from bench.sender import BusMessage, MediaSample, SenderTimeout, summarize_bus  # noqa: E402
from bench.sessions import SessionView  # noqa: E402

CASES_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "media.json"
PLAYING = "PLAYING"
ERROR_TYPES = ("playbackerror", "connectionerror", "error")


@dataclass
class Row:
    case_id: str
    expected: str | None
    observed_custom: str | None
    observed_server: str | None
    startup_seconds: float | None
    advanced_seconds: float | None
    errors: list[str] = field(default_factory=list)
    verdict: str = "ko"


def load_cases(path: Path = CASES_PATH, ids: list[str] | None = None) -> list[dict]:
    cases = json.loads(Path(path).read_text())["cases"]
    if not ids:
        return cases
    by_id = {case["id"]: case for case in cases}
    unknown = [identifier for identifier in ids if identifier not in by_id]
    if unknown:
        raise ValueError(f"unknown case id(s): {', '.join(unknown)}; known: {', '.join(by_id)}")
    return [by_id[identifier] for identifier in ids]


def evaluate(case: dict, target_kind: str, samples: list[MediaSample], session: SessionView | None, bus: list[BusMessage]) -> Row:
    expected = (case.get("expect") or {}).get(target_kind)
    if not samples:
        return Row(case["id"], expected, None, None, None, None, ["no item or no sample"], "skipped")
    errors = [f"{m.type}: {m.message or ''}".rstrip(": ") for m in bus if m.type in ERROR_TYPES]
    playing = [s for s in samples if s.player_state == PLAYING]
    observed_server = session.play_method if session else None
    reasons = session.transcoding_reasons if session else []
    if not playing:
        errors.append("playback never started")
        return Row(case["id"], expected, None, observed_server, None, None, errors, "ko")
    startup = playing[0].at - samples[0].at
    advanced = playing[-1].current_time - playing[0].current_time
    observed_custom = playing[-1].custom_data.get("playMethod")
    if expected and observed_custom != expected:
        errors.append(f"expected {expected}, receiver says {observed_custom}")
    if (expected and observed_server and observed_server != expected) or reasons:
        errors.append(f"server: {observed_server}, reasons {', '.join(reasons) or 'none'}")
    return Row(case["id"], expected, observed_custom, observed_server, round(startup, 1), round(advanced, 1), errors, "ok" if not errors else "ko")


def run(cases: list[dict], target_kind: str, driver, watch_seconds: float = 20.0) -> list[Row]:
    rows = []
    for case in cases:
        item = driver.resolve(case)
        if item is None:
            rows.append(evaluate(case, target_kind, [], None, []))
            continue
        started = time.monotonic()
        samples: list[MediaSample] = []
        timeout_error = None
        try:
            samples = driver.play(item, case)
        except SenderTimeout as timeout:
            timeout_error = str(timeout)
        finally:
            session = driver.server_view(item)
            bus = driver.bus_since(started)
            driver.stop()
        row = evaluate(case, target_kind, samples, session, bus)
        if timeout_error:
            row.errors.append(timeout_error)
            row.verdict = "ko"
        rows.append(row)
    return rows


def to_markdown(rows: list[Row]) -> str:
    def number(value: float | None) -> str:
        return "" if value is None else f"{value:.1f}"

    lines = ["| cas | attendu | customData | serveur | démarrage s | avancé s | erreurs | verdict |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for row in rows:
        lines.append(
            f"| {row.case_id} | {row.expected or ''} | {row.observed_custom or ''} | {row.observed_server or ''} | "
            f"{number(row.startup_seconds)} | {number(row.advanced_seconds)} | {'; '.join(row.errors)} | {row.verdict} |"
        )
    return "\n".join(lines)


class CastDriver:
    """Drives one Cast target with the Python sender and reads the server through the bench client."""

    def __init__(self, client, session, cast, controller, receiver_name: str, server_url: str, watch_seconds: float):
        from bench import sender

        self.sender = sender
        self.client = client
        self.session = session
        self.cast = cast
        self.controller = controller
        self.receiver_name = receiver_name
        self.server_url = server_url
        self.watch_seconds = watch_seconds
        self.bus_start = 0

    def resolve(self, case: dict) -> dict | None:
        match = case["match"]
        if "code" in match:
            return self.client.find_item(self.session, match["code"])
        if "channel" in match:
            return next((c for c in self.client.channels(self.session) if c.get("Name") == match["channel"]), None)
        if "audioContainer" in match:
            result = self.client.get("/Items", params={"IncludeItemTypes": "Audio", "Recursive": "true", "Fields": "MediaSources", "userId": self.session.user_id, "Limit": "500"}, token=self.session.token)
            for item in result.get("Items", []):
                if (item.get("MediaSources") or [{}])[0].get("Container") == match["audioContainer"]:
                    return item
        return None

    def play(self, item: dict, case: dict) -> list[MediaSample]:
        self.bus_start = len(self.controller.bus)
        options = {"items": [self.sender.slim_item(item)], "startIndex": 0, "startPositionTicks": 0}
        self.controller.send(self.sender.build_message("PlayNow", self.server_url, self.session.token, self.session.user_id, options, self.receiver_name))
        samples = [self.sender.sample(self.cast)]
        samples.append(self.sender.wait_for_playing(self.cast))
        samples.extend(self.sender.watch(self.cast, self.watch_seconds))
        return samples

    def server_view(self, item: dict) -> SessionView | None:
        from bench.sender import to_receiver_device_name
        from bench.sessions import snapshot

        # The receiver registers with the server under the cleaned-up name, not the one sent.
        device = to_receiver_device_name(self.receiver_name)
        views = [v for v in snapshot(self.client.sessions(self.session.token), device=device) if v.item_id == item.get("Id")]
        return views[0] if views else None

    def bus_since(self, started: float) -> list[BusMessage]:
        return list(self.controller.bus[self.bus_start :])

    def stop(self) -> None:
        self.controller.send(self.sender.build_message("Stop", self.server_url, self.session.token, self.session.user_id, {}, self.receiver_name))
        time.sleep(2)
        self.sender.refresh_status(self.cast)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True)
    parser.add_argument("--profile", default="test")
    parser.add_argument("--target", required=True)
    parser.add_argument("--cases", help="Comma separated case ids, all by default")
    parser.add_argument("--watch", type=float, default=20.0)
    parser.add_argument("--keep", help="Copy the report to the keep directory under this subject")
    args = parser.parse_args(argv)

    from bench import sender
    from bench.config import load_config
    from bench.jellyfin import JellyfinClient
    from bench.report import Report

    config = load_config()
    server = config.servers[args.server]
    target = next(t for t in config.targets.chromecasts if t.name == args.target)
    cases = load_cases(ids=args.cases.split(",") if args.cases else None)
    client = JellyfinClient(server.url)
    session = client.authenticate(server.accounts[args.profile])
    report = Report("matrix", redact=config.redact + [session.token])
    try:
        cast = sender.connect(target)
        sender.launch(cast)
        controller = sender.attach(cast)
        receiver_name = sender.receiver_name_for({"friendlyName": target.name, "deviceId": None})
        driver = CastDriver(client, session, cast, controller, receiver_name, server.url, args.watch)
        rows = run(cases, target.kind, driver, args.watch)
        table = to_markdown(rows)
        print(table)
        report.add("target", name=target.name, kind=target.kind, server=args.server, cases=[c["id"] for c in cases])
        report.add("rows", rows=[asdict(r) for r in rows])
        report.add("table", markdown=table)
        report.add("bus", **summarize_bus(controller.bus))
        cast.disconnect(timeout=5)
    finally:
        client.logout(session)
        paths = report.save()
        if args.keep:
            report.keep(args.keep, config.keep_dir)
        print(f"report: {paths.markdown}")
    return 1 if any(r.verdict == "ko" for r in rows) else 0


if __name__ == "__main__":
    sys.exit(main())
