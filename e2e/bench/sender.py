"""Cast sender for the Jellyfin receiver, without the app.

Talks to the receiver (`F007D354`) over its command channel exactly as the app does, so the
receiver and the server can be tested on their own, and every message is replayed against the
shared vectors in e2e/fixtures/receiver-protocol. pychromecast is imported lazily: the pure
parts (message building, names, bus parsing, waiting) work without it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Callable

RECEIVER_APP_ID = "F007D354"
RECEIVER_NAMESPACE = "urn:x-cast:com.connectsdk"
FALLBACK_NAME = "Chromecast"
FALLBACK_ID_LENGTH = 8
CAST_PORT = 8009
PLAYER_STATE_PLAYING = "PLAYING"
TICKS_PER_SECOND = 10_000_000


class SenderTimeout(Exception):
    def __init__(self, what: str):
        super().__init__(f"timed out waiting for {what}")
        self.what = what


@dataclass(frozen=True)
class BusMessage:
    type: str
    message: str | None = None
    data: str | None = None


def parse_bus_message(raw: str) -> BusMessage:
    try:
        payload = json.loads(raw)
    except ValueError:
        return BusMessage(type="invalid", message=raw)
    if not isinstance(payload, dict):
        return BusMessage(type="invalid", message=raw)
    return BusMessage(type=str(payload.get("type", "unknown")), message=payload.get("message"), data=payload.get("data"))


def build_message(
    command: str,
    server_url: str,
    token: str,
    user_id: str,
    options: dict,
    receiver_name: str | None = None,
    max_bitrate: int | None = None,
) -> dict:
    """The envelope the receiver expects on every message, keys in the order the app sends them."""
    message: dict[str, Any] = {"command": command, "serverAddress": server_url, "accessToken": token, "userId": user_id}
    if receiver_name:
        message["receiverName"] = receiver_name
    if max_bitrate:
        message["maxBitrate"] = max_bitrate
    message["options"] = options
    return message


def to_receiver_device_name(name: str) -> str:
    # Same cleanup as the receiver: ASCII letters, digits, underscore and any whitespace stay.
    return re.sub(r"[^A-Za-z0-9_\s]", "", name)


def receiver_name_for(device: dict | None) -> str | None:
    if device is None:
        return None
    name = "".join(" " if (ch.isspace() and ord(ch) > 0xFF) else ch for ch in device.get("friendlyName") or "")
    if to_receiver_device_name(name).strip():
        return name
    tail = re.sub(r"[^a-zA-Z0-9]", "", device.get("deviceId") or "")[-FALLBACK_ID_LENGTH:]
    return f"{FALLBACK_NAME} {tail}" if tail else FALLBACK_NAME


@dataclass(frozen=True)
class MediaSample:
    at: float
    player_state: str
    current_time: float
    custom_data: dict


def sample(cast: Any) -> MediaSample:
    status = cast.media_controller.status
    return MediaSample(
        at=time.monotonic(),
        player_state=str(status.player_state),
        current_time=float(status.current_time or 0.0),
        custom_data=dict(status.media_custom_data or {}),
    )


def wait_for(cast: Any, predicate: Callable[[MediaSample], bool], timeout: float, what: str, every: float = 0.5) -> MediaSample:
    deadline = time.monotonic() + timeout
    while True:
        current = sample(cast)
        if predicate(current):
            return current
        if time.monotonic() >= deadline:
            raise SenderTimeout(what)
        time.sleep(every)
        cast.media_controller.update_status()


def wait_for_playing(cast: Any, timeout: float = 45.0, every: float = 0.5) -> MediaSample:
    return wait_for(cast, lambda s: s.player_state == PLAYER_STATE_PLAYING, timeout, "playing", every)


def watch(cast: Any, seconds: float, every: float = 2.0) -> list[MediaSample]:
    samples = [sample(cast)]
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        time.sleep(every)
        cast.media_controller.update_status()
        samples.append(sample(cast))
    return samples


class BusCollector:
    """Keeps every message the receiver sends on its channel, parsed."""

    def __init__(self) -> None:
        self.bus: list[BusMessage] = []

    def collect(self, payload_utf8: str) -> BusMessage:
        parsed = parse_bus_message(payload_utf8)
        self.bus.append(parsed)
        return parsed


def receiver_controller_class():
    from pychromecast.controllers import BaseController

    class JellyfinReceiverController(BusCollector, BaseController):
        def __init__(self) -> None:
            BusCollector.__init__(self)
            BaseController.__init__(self, RECEIVER_NAMESPACE, supporting_app_id=RECEIVER_APP_ID)

        def receive_message(self, message, data: dict) -> bool:  # noqa: ARG002 - pychromecast callback shape
            self.collect(message.payload_utf8)
            return True

        def send(self, message: dict) -> None:
            # The receiver reads nothing but its own keys; a requestId would only clutter the proofs.
            self.send_message(message, no_add_request_id=True)

    return JellyfinReceiverController


def connect(target, timeout: float = 10.0):
    import pychromecast

    cast = pychromecast.get_chromecast_from_host((target.host, CAST_PORT, None, None, None), timeout=timeout)
    cast.wait(timeout=timeout)
    return cast


def launch(cast, timeout: float = 20.0) -> None:
    if cast.app_id != RECEIVER_APP_ID:
        cast.start_app(RECEIVER_APP_ID, timeout=timeout)
    deadline = time.monotonic() + timeout
    while cast.app_id != RECEIVER_APP_ID:
        if time.monotonic() >= deadline:
            raise SenderTimeout(f"receiver app {RECEIVER_APP_ID}")
        time.sleep(0.5)


def attach(cast):
    controller = receiver_controller_class()()
    cast.register_handler(controller)
    return controller


@dataclass
class Journal:
    steps: list[dict] = field(default_factory=list)

    def note(self, step: str, **data) -> None:
        self.steps.append({"step": step, "at": time.strftime("%H:%M:%S"), **data})
        print(json.dumps(self.steps[-1], default=str))


def slim_item(item: dict) -> dict:
    return {"Id": item.get("Id"), "Name": item.get("Name"), "Type": item.get("Type"), "MediaType": item.get("MediaType"), "IsFolder": item.get("IsFolder", False)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True)
    parser.add_argument("--profile", default="test")
    parser.add_argument("--target", required=True, help="Cast target name from the bench configuration")
    parser.add_argument("--keep", help="Copy the report to the keep directory under this subject")
    sub = parser.add_subparsers(dest="action", required=True)
    play = sub.add_parser("play-now")
    play.add_argument("--item", required=True, help="Lab code or name prefix, or a channel name with --channel")
    play.add_argument("--channel", action="store_true")
    play.add_argument("--start-seconds", type=float, default=0.0)
    play.add_argument("--watch", type=float, default=20.0)
    play.add_argument("--max-bitrate", type=int)
    for name in ("identify", "pause", "unpause", "stop", "status"):
        sub.add_parser(name)
    seek = sub.add_parser("seek")
    seek.add_argument("--seconds", type=float, required=True)
    for name in ("subtitle", "audio"):
        track = sub.add_parser(name)
        track.add_argument("--index", type=int, required=True)
    args = parser.parse_args(argv)

    from bench.config import load_config
    from bench.jellyfin import JellyfinClient
    from bench.report import Report

    config = load_config()
    server = config.servers[args.server]
    target = next(t for t in config.targets.chromecasts if t.name == args.target)
    client = JellyfinClient(server.url)
    session = client.authenticate(server.accounts[args.profile])
    journal = Journal()
    report = Report(f"sender-{args.action}", redact=config.redact + [session.token])
    receiver_name = receiver_name_for({"friendlyName": target.name, "deviceId": None})
    exit_code = 0
    try:
        cast = connect(target)
        journal.note("connected", target=target.name, app=cast.app_display_name)
        launch(cast)
        controller = attach(cast)
        journal.note("receiver", app_id=cast.app_id)

        def send(command: str, options: dict | None = None, max_bitrate: int | None = None) -> None:
            controller.send(build_message(command, server.url, session.token, session.user_id, options or {}, receiver_name, max_bitrate))
            journal.note("sent", command=command, options=options or {})

        if args.action == "play-now":
            if args.channel:
                item = next((c for c in client.channels(session) if c.get("Name") == args.item), None)
            else:
                item = client.find_item(session, args.item)
            if item is None:
                journal.note("item", found=False, query=args.item)
                return 2
            journal.note("item", found=True, id=item["Id"], name=item["Name"])
            options = {"items": [slim_item(item)], "startIndex": 0, "startPositionTicks": int(args.start_seconds * TICKS_PER_SECOND)}
            send("PlayNow", options, args.max_bitrate)
            try:
                first = wait_for_playing(cast)
                journal.note("playing", after_seconds=round(first.at, 1), custom_data=first.custom_data)
            except SenderTimeout as timeout:
                journal.note("timeout", what=timeout.what, bus=[asdict(m) for m in controller.bus])
                exit_code = 1
            for item_sample in watch(cast, args.watch):
                journal.note("sample", state=item_sample.player_state, time=round(item_sample.current_time, 1), play_method=item_sample.custom_data.get("playMethod"))
        elif args.action == "seek":
            send("Seek", {"position": args.seconds})
        elif args.action == "subtitle":
            send("SetSubtitleStreamIndex", {"index": args.index})
        elif args.action == "audio":
            send("SetAudioStreamIndex", {"index": args.index})
        elif args.action == "status":
            cast.media_controller.update_status()
            time.sleep(1)
        else:
            send({"identify": "Identify", "pause": "Pause", "unpause": "Unpause", "stop": "Stop"}[args.action])
        time.sleep(2)
        cast.media_controller.update_status()
        time.sleep(1)
        journal.note("final", **asdict(sample(cast)), bus=[asdict(m) for m in controller.bus])
        cast.disconnect(timeout=5)
    finally:
        client.logout(session)
        for step in journal.steps:
            report.add(step["step"], **{k: v for k, v in step.items() if k != "step"})
        paths = report.save()
        if args.keep:
            report.keep(args.keep, config.keep_dir)
        print(f"report: {paths.markdown}")
    return exit_code


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.exit(main())
