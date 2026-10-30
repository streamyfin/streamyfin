"""Read what the Jellyfin server records about playback sessions, and assert on it.

Jellyfin advances the position of a playing session itself once a second, so a skew between
two sessions is only trustworthy while they are paused: `check` refuses to judge it otherwise.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

TICKS_PER_SECOND = 10_000_000


@dataclass
class SessionView:
    id: str
    device: str
    client: str
    user: str | None
    item_id: str | None
    item_name: str | None
    position_seconds: float | None
    is_paused: bool | None
    play_method: str | None
    transcoding_reasons: list[str]
    last_activity: datetime | None
    group_id: str | None
    # Whether the server runs a transcoding job for the session. The play method is only what the
    # client reported, and the server turns a Transcode without a job into DirectPlay.
    is_transcoding: bool = False

    @property
    def is_playing_something(self) -> bool:
        return self.item_id is not None


def parse_timestamp(value: str | None) -> datetime | None:
    if not value or value.startswith("0001-"):
        return None
    # Jellyfin writes seven fractional digits; fromisoformat takes at most six.
    trimmed = value.replace("Z", "+00:00")
    if "." in trimmed:
        head, tail = trimmed.split(".", 1)
        fraction, _, zone = tail.partition("+")
        trimmed = f"{head}.{fraction[:6]}+{zone}" if zone else f"{head}.{fraction[:6]}"
    parsed = datetime.fromisoformat(trimmed)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def same_device(recorded: str, asked: str) -> bool:
    """A Cast receiver registers under the name it was sent with the punctuation stripped and the
    spaces around it left in place, so a name matches as given or as the receiver cleans it,
    whitespace runs counting as one space."""
    from bench.sender import to_receiver_device_name

    def spaced(name: str) -> str:
        return " ".join(name.split())

    return spaced(recorded) in (spaced(asked), spaced(to_receiver_device_name(asked)))


def snapshot(sessions: list[dict], device: str | list[str] | None = None) -> list[SessionView]:
    wanted = [device] if isinstance(device, str) else list(device or [])
    views = []
    for session in sessions:
        if wanted and not any(same_device(session.get("DeviceName") or "", name) for name in wanted):
            continue
        state = session.get("PlayState") or {}
        item = session.get("NowPlayingItem") or {}
        ticks = state.get("PositionTicks")
        views.append(
            SessionView(
                id=session.get("Id", ""),
                device=session.get("DeviceName", ""),
                client=session.get("Client", ""),
                user=session.get("UserName"),
                item_id=item.get("Id"),
                item_name=item.get("Name"),
                position_seconds=ticks / TICKS_PER_SECOND if ticks is not None and item else None,
                is_paused=state.get("IsPaused") if item else None,
                play_method=state.get("PlayMethod") if item else None,
                transcoding_reasons=list((session.get("TranscodingInfo") or {}).get("TranscodeReasons") or []),
                last_activity=parse_timestamp(session.get("LastActivityDate")),
                group_id=session.get("SyncPlayGroupId"),
                is_transcoding=bool(session.get("TranscodingInfo")),
            )
        )
    return views


def skew_seconds(views: list[SessionView]) -> float | None:
    positions = [v.position_seconds for v in views if v.is_playing_something and v.position_seconds is not None]
    if len(positions) < 2:
        return None
    return max(positions) - min(positions)


def check(
    views: list[SessionView],
    expect_item: str | None = None,
    expect_paused: bool | None = None,
    expect_play_method: str | None = None,
    expect_active: int = 1,
    max_skew_seconds: float | None = None,
    expect_members: int | None = None,
    groups: list[dict] | None = None,
) -> list[str]:
    failures = []
    playing = [v for v in views if v.is_playing_something]
    # A group is joined before anything plays, so the active count only applies to an assertion about
    # what plays: with no active session, such an assertion would pass on nothing.
    asserts_playback = any(value is not None for value in (expect_item, expect_paused, expect_play_method, max_skew_seconds))
    if asserts_playback and len(playing) < expect_active:
        failures.append(f"Active playback sessions {len(playing)}, expected at least {expect_active}")
    if expect_item is not None and any(v.item_id != expect_item for v in playing):
        failures.append(f"Expected every active session on item {expect_item}, got {[v.item_id for v in playing]}")
    if expect_paused is not None and any(v.is_paused != expect_paused for v in playing):
        failures.append(f"Expected paused={expect_paused} on every active session, got {[v.is_paused for v in playing]}")
    if expect_play_method is not None and any(v.play_method != expect_play_method for v in playing):
        failures.append(f"Expected play method {expect_play_method}, got {[v.play_method for v in playing]}")
    if max_skew_seconds is not None:
        if any(not v.is_paused for v in playing):
            failures.append("Skew is only measurable between paused sessions; some are playing")
        else:
            skew = skew_seconds(playing)
            if skew is None or skew > max_skew_seconds:
                failures.append(f"Playback skew {skew}, maximum {max_skew_seconds}s")
    if expect_members is not None:
        actual = max((len(group.get("Participants") or []) for group in groups or []), default=0)
        if actual != expect_members:
            failures.append(f"Group members {actual}, expected {expect_members}")
    return failures


def add_check_arguments(parser: argparse.ArgumentParser, expect_active: int = 1) -> None:
    """The assertions of `check`, declared once for this observer and the SyncPlay one."""
    parser.add_argument("--expect-item")
    parser.add_argument("--expect-paused", choices=("true", "false"))
    parser.add_argument("--expect-play-method", choices=("DirectPlay", "DirectStream", "Transcode"))
    parser.add_argument(
        "--expect-active", type=int, default=expect_active, help="Minimum active playback sessions for the item, pause, play method and skew assertions"
    )
    parser.add_argument("--max-skew", type=float)
    parser.add_argument("--expect-members", type=int)


def check_options(args: argparse.Namespace) -> dict:
    return {
        "expect_item": args.expect_item,
        "expect_paused": None if args.expect_paused is None else args.expect_paused == "true",
        "expect_play_method": args.expect_play_method,
        "expect_active": args.expect_active,
        "max_skew_seconds": args.max_skew,
        "expect_members": args.expect_members,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True)
    parser.add_argument("--profile", default="test")
    parser.add_argument("--device", action="append", help="Only this device name, as given or as a Cast receiver registers it; repeat for several")
    parser.add_argument("--label", default="snapshot")
    add_check_arguments(parser)
    parser.add_argument("--keep", help="Copy the report to the keep directory under this subject")
    args = parser.parse_args(argv)

    from bench.config import BenchConfigError, load_config
    from bench.jellyfin import JellyfinClient
    from bench.report import Report

    try:
        config = load_config()
        server = config.server(args.server)
        account = server.account(args.profile)
    except BenchConfigError as error:
        print(f"sessions: {error}", file=sys.stderr)
        return 2
    client = JellyfinClient(server.url)
    session = client.authenticate(account)
    try:
        views = snapshot(client.sessions(session.token), device=args.device)
        groups = client.get("/SyncPlay/List", token=session.token) if args.expect_members is not None else None
        failures = check(views, groups=groups, **check_options(args))
        # The Markdown copy is the one quoted in issues: without a device to name them, only the
        # sessions of the bench's own accounts go in, never the other users of the server.
        bench_users = {entry.username for entry in server.accounts.values()}
        under_test = views if args.device else [v for v in views if v.user in bench_users]
        observation = {
            "label": args.label,
            "capturedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "server": args.server,
            "sessions": [{**asdict(v), "last_activity": v.last_activity.isoformat() if v.last_activity else None} for v in under_test],
            "otherSessions": len(views) - len(under_test),
            "skewSeconds": skew_seconds(views),
            "failures": failures,
        }
        report = Report(f"sessions-{args.label}", redact=config.redact)
        report.add("observation", **observation)
        paths = report.save()
        if args.keep:
            report.keep(args.keep, config.keep_dir)
        print(json.dumps(observation, indent=2, default=str))
        print(f"report: {paths.markdown}")
    finally:
        # The observation is out before the sign-out, which must not cost the run its evidence.
        try:
            client.logout(session)
        except Exception as error:  # noqa: BLE001 - a failed sign-out only leaves the token behind
            print(f"sessions: sign-out failed, the token stays on the server ({error})", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    # Run as `python3 e2e/bench/sessions.py`: put `e2e/` on the path so `bench.*` imports work.
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.exit(main())
