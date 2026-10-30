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

from bench.sender import BusMessage, Load, LoadFailed, MediaSample, summarize_bus  # noqa: E402
from bench.sessions import SessionView  # noqa: E402

CASES_PATH = Path(__file__).resolve().parents[2] / "fixtures" / "media.json"
PLAYING = "PLAYING"
ERROR_TYPES = ("playbackerror", "connectionerror", "error")
# The receiver writes DirectStream for a static stream and Transcode otherwise, never DirectPlay,
# and the server turns a Transcode without a job into DirectPlay. Direct against transcoded is the
# one axis both sides express, so the verdict judges that and the row keeps the raw values.
DIRECT_PLAY_METHODS = ("DirectPlay", "DirectStream")
TRANSCODE = "Transcode"
# A case proves playback when its position moved for at least this share of the time it was
# watched: a start followed by a stall, or a frozen position, proves nothing.
MIN_ADVANCE_RATIO = 0.5
# Verdicts that fail the run: "incomplete" is a case that played without the evidence its
# expectation needs, the receiver's session on the server.
FAILING_VERDICTS = ("ko", "incomplete")
EXIT_NOTHING_PLAYED = 3


@dataclass
class Row:
    case_id: str
    expected: str | None
    observed_custom: str | None
    observed_server: str | None
    startup_seconds: float | None
    advanced_seconds: float | None
    reasons: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    verdict: str = "ko"
    # Whether the server ran a transcoding job for the receiver; None without its session.
    server_transcoding: bool | None = None


def load_cases(path: Path = CASES_PATH, ids: list[str] | None = None) -> list[dict]:
    cases = json.loads(Path(path).read_text())["cases"]
    if not ids:
        return cases
    by_id = {case["id"]: case for case in cases}
    unknown = [identifier for identifier in ids if identifier not in by_id]
    if unknown:
        raise ValueError(f"unknown case id(s): {', '.join(unknown)}; known: {', '.join(by_id)}")
    return [by_id[identifier] for identifier in ids]


def delivery(play_method: str | None) -> str | None:
    if play_method in DIRECT_PLAY_METHODS:
        return "direct"
    return "transcode" if play_method == TRANSCODE else None


def evaluate(
    case: dict,
    target_kind: str,
    samples: list[MediaSample],
    session: SessionView | None,
    bus: list[BusMessage],
    item_id: str | None = None,
    missing_item: bool = False,
) -> Row:
    """Judges one case from what was seen. `samples[0]` is the receiver's status before the PlayNow:
    the startup counts from it, and only the item asked for, under a play session the receiver did
    not have then, counts as this case."""
    expected = (case.get("expect") or {}).get(target_kind)
    # Only an item the server does not have is skipped; a play that timed out is a failure with its evidence.
    if missing_item:
        return Row(case["id"], expected, None, None, None, None, [], ["no item on the server"], "skipped")
    errors = [f"{m.type}: {m.message or ''}".rstrip(": ") for m in bus if m.type in ERROR_TYPES]
    observed_server = session.play_method if session else None
    server_transcoding = session.is_transcoding if session else None
    # Transcoding reasons explain the server's choice; they are information, not a failure.
    reasons = list(session.transcoding_reasons) if session else []
    before = samples[0] if samples else None
    load = Load(item_id, before.play_session_id) if item_id and before else None
    playing = [s for s in samples[1:] if load is not None and load.owns(s) and s.player_state == PLAYING]
    if not playing:
        errors.append("playback never started")
        return Row(case["id"], expected, None, observed_server, None, None, reasons, errors, "ko", server_transcoding)
    startup = playing[0].at - before.at
    advanced = playing[-1].current_time - playing[0].current_time
    watched = samples[-1].at - playing[0].at
    observed_custom = playing[-1].custom_data.get("playMethod")
    if advanced <= 0 or advanced < MIN_ADVANCE_RATIO * watched:
        errors.append(f"position advanced {advanced:.1f} s in {watched:.1f} s watched")
    wanted = delivery(expected)
    if expected and wanted is None:
        errors.append(f"expectation {expected} is not a play method")
    if wanted and delivery(observed_custom) != wanted:
        errors.append(f"expected {expected}, receiver says {observed_custom}")
    if wanted and session is not None and ("transcode" if server_transcoding else "direct") != wanted:
        errors.append(f"expected {expected}, server runs {'a transcode' if server_transcoding else 'no transcode'} ({observed_server})")
    verdict = "ko" if errors else "ok"
    if wanted and session is None:
        errors.append("no server session to confirm it")
        if verdict == "ok":
            verdict = "incomplete"
    return Row(case["id"], expected, observed_custom, observed_server, round(startup, 1), round(advanced, 1), reasons, errors, verdict, server_transcoding)


def measure(case: dict, target_kind: str, driver) -> Row:
    """One case, whatever fails: an error of the receiver, the server or the network becomes part
    of the row instead of ending the run and taking the cases already measured with it."""
    failures: list[str] = []

    def attempt(work, default=None):
        try:
            return work()
        except LoadFailed:
            # The receiver's own message is on the bus, which the row reports.
            return default
        except Exception as error:  # noqa: BLE001 - see the docstring
            failures.append(f"{type(error).__name__}: {error}")
            return default

    item = attempt(lambda: driver.resolve(case))
    if item is None:
        if failures:
            return Row(case["id"], (case.get("expect") or {}).get(target_kind), None, None, None, None, [], failures, "ko")
        return evaluate(case, target_kind, [], None, [], missing_item=True)
    samples, session, bus = [], None, []
    try:
        samples = attempt(lambda: driver.play(item, case), [])
        session = attempt(lambda: driver.server_view(item))
        bus = attempt(driver.bus_since_play, [])
    finally:
        # The receiver stops whatever happened, or the case keeps playing on the TV.
        attempt(driver.stop)
    row = evaluate(case, target_kind, samples, session, bus, item_id=item.get("Id"))
    if failures:
        row.errors.extend(failures)
        row.verdict = "ko"
    return row


def run(cases: list[dict], target_kind: str, driver, rows: list[Row] | None = None) -> list[Row]:
    """Rows land in `rows` as they are measured, so a run cut short still has the ones it got."""
    rows = [] if rows is None else rows
    for case in cases:
        rows.append(measure(case, target_kind, driver))
    return rows


def exit_code(rows: list[Row]) -> int:
    if any(row.verdict in FAILING_VERDICTS for row in rows):
        return 1
    # Nothing played, on a server without the lab's tags say: the run proves nothing.
    if all(row.verdict == "skipped" for row in rows):
        return EXIT_NOTHING_PLAYED
    return 0


def to_markdown(rows: list[Row]) -> str:
    def number(value: float | None) -> str:
        return "" if value is None else f"{value:.1f}"

    def yes_no(value: bool | None) -> str:
        return "" if value is None else ("oui" if value else "non")

    lines = [
        "| cas | attendu | customData | serveur | transcodage | raisons | démarrage s | avancé s | erreurs | verdict |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row.case_id} | {row.expected or ''} | {row.observed_custom or ''} | {row.observed_server or ''} | {yes_no(row.server_transcoding)} | "
            f"{', '.join(row.reasons)} | {number(row.startup_seconds)} | {number(row.advanced_seconds)} | {'; '.join(row.errors)} | {row.verdict} |"
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
        """The receiver's status before the send, its first one playing this item, then the watch."""
        before = self.sender.refresh_status(self.cast)
        self.bus_start = len(self.controller.bus)
        load = Load(item_id=item["Id"], previous_session=before.play_session_id, bus_start=self.bus_start)
        options = {"items": [self.sender.slim_item(item)], "startIndex": 0, "startPositionTicks": 0}
        self.controller.send(self.sender.build_message("PlayNow", self.server_url, self.session.token, self.session.user_id, options, self.receiver_name))
        samples = [before, self.sender.wait_for_playing(self.cast, load, self.controller.bus)]
        samples.extend(self.sender.watch(self.cast, self.watch_seconds))
        return samples

    def server_view(self, item: dict) -> SessionView | None:
        from bench.sender import to_receiver_device_name
        from bench.sessions import snapshot

        # The receiver registers with the server under the cleaned-up name, not the one sent.
        device = to_receiver_device_name(self.receiver_name)
        views = [v for v in snapshot(self.client.sessions(self.session.token), device=device) if v.item_id == item.get("Id")]
        return views[0] if views else None

    def bus_since_play(self) -> list[BusMessage]:
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
    from bench.config import BenchConfigError, load_config
    from bench.jellyfin import JellyfinClient
    from bench.report import Report

    try:
        config = load_config()
        server = config.server(args.server)
        target = config.chromecast(args.target)
        account = server.account(args.profile)
        cases = load_cases(ids=args.cases.split(",") if args.cases else None)
    except (BenchConfigError, ValueError) as error:
        print(f"matrix: {error}", file=sys.stderr)
        return 2
    client = JellyfinClient(server.url)
    session = client.authenticate(account)
    report = Report("matrix", redact=config.redact + [session.token])
    report.add("target", name=target.name, kind=target.kind, server=args.server, cases=[c["id"] for c in cases])
    rows: list[Row] = []
    controller = None
    try:
        cast = sender.connect(target)
        # The receiver keeps the name of the first sender that reached it: a running one is
        # restarted so that the server session is the matrix's own.
        report.add("receiver", restarted=cast.app_id == sender.RECEIVER_APP_ID)
        sender.launch(cast, fresh=True)
        controller = sender.attach(cast)
        receiver_name = sender.receiver_name_for({"friendlyName": target.name, "deviceId": None})
        driver = CastDriver(client, session, cast, controller, receiver_name, server.url, args.watch)
        run(cases, target.kind, driver, rows)
        cast.disconnect(timeout=5)
    finally:
        # Whatever ended the run, Ctrl-C included, the rows measured so far are saved, and before
        # the sign-out, which must not cost the run its report.
        try:
            table = to_markdown(rows)
            print(table)
            report.add("rows", rows=[asdict(r) for r in rows])
            report.add_markdown("table", table)
            if controller is not None:
                report.add("bus", **summarize_bus(controller.bus))
            paths = report.save()
            if args.keep:
                report.keep(args.keep, config.keep_dir)
            print(f"report: {paths.markdown}")
        finally:
            client.logout(session)
    return exit_code(rows)


if __name__ == "__main__":
    sys.exit(main())
