"""Cast sender for the Jellyfin receiver, without the app.

Talks to the receiver (`F007D354`) over its command channel exactly as the app does, so the
receiver and the server can be tested on their own, and every message is replayed against the
shared vectors in e2e/fixtures/receiver-protocol. pychromecast is imported lazily: the pure
parts (message building, names, bus parsing, waiting) work without it.
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import math
import os
import re
import sys
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

try:
    import fcntl
except ImportError:  # Windows has no flock: there the token store goes unlocked.
    fcntl = None

RECEIVER_APP_ID = "F007D354"
RECEIVER_NAMESPACE = "urn:x-cast:com.connectsdk"
FALLBACK_NAME = "Chromecast"
FALLBACK_ID_LENGTH = 8
CAST_PORT = 8009
PLAYER_STATE_PLAYING = "PLAYING"
TICKS_PER_SECOND = 10_000_000
# The cap every message carries unless one is asked for, as the app sends it when the user picked
# none: the ceiling the receiver puts on its own bandwidth measurement. The receiver keeps the last
# cap it was given while its app runs, so a message without one would leave an earlier cap in place.
UNCAPPED_BITRATE = 120_000_000
# What JavaScript's \s matches, which the receiver's cleanup of a name goes by. Python's own \s is
# another set: it leaves U+FEFF out, and takes U+001C to U+001F and U+0085 in.
JS_WHITESPACE = r"\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"
JS_SPACE = re.compile(rf"[{JS_WHITESPACE}]")
# What the receiver strips from a name: anything but ASCII letters, digits, underscore and whitespace.
NOT_KEPT_BY_RECEIVER = re.compile(rf"[^A-Za-z0-9_{JS_WHITESPACE}]")
# What the receiver sends on its channel when a load fails: the PlaybackInfo error code, a failed
# PlaybackInfo request, or a message it rejected.
ERROR_TYPES = ("playbackerror", "connectionerror", "error")
# The states in which the receiver answers Identify with a playbackstop, and plays on.
IDENTIFY_ANSWERED_STATES = frozenset({"PLAYING", "PAUSED"})
# How long the summary waits for that answer once the status says one comes, polling every step.
IDENTIFY_ANSWER_WAIT_SECONDS = 5.0
IDENTIFY_ANSWER_POLL_SECONDS = 0.1
# What the receiver plays through children it picks itself when handed one first, as it does any folder.
CONTAINER_TYPES = frozenset({"Playlist", "MusicArtist", "MusicGenre"})
# The token each receiver was handed and the bitrate cap of its session, kept between runs. It holds
# live tokens: git and Biome ignore it.
TOKENS_PATH = Path(__file__).resolve().parent / "receiver-tokens.local.json"
# How long a status request may go unanswered, and how long a receiver gets to obey a Stop.
STATUS_TIMEOUT_SECONDS = 5.0
STOP_TIMEOUT_SECONDS = 10.0


class SenderTimeout(Exception):
    def __init__(self, what: str):
        super().__init__(f"timed out waiting for {what}")
        self.what = what


@dataclass(frozen=True)
class BusMessage:
    """One message from the receiver: an error carries a `message`, a status message its state as
    `data`, a nested object with the position under PlayState.PositionTicks."""

    type: str
    message: str | None = None
    data: dict | None = None


def describe_error(message: BusMessage) -> str:
    return f"{message.type}: {message.message or ''}".rstrip(": ")


class LoadFailed(Exception):
    """The receiver said on its channel that the load failed."""

    def __init__(self, message: BusMessage):
        super().__init__(describe_error(message))
        self.message = message


class ContainerRefused(Exception):
    """A PlayNow holding a container, refused before anything is sent. Handed one first, the receiver
    plays children it picks itself and drops the other items, so no item id tells that load from the
    media the TV already plays; one further down goes to its PlaybackInfo as it is, and fails there."""

    def __init__(self, item: dict):
        super().__init__(f"cannot cast {item.get('Type') or 'item'} {item.get('Id')}: the receiver plays a container through children it picks, so cast its items instead")
        self.item = item


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
    """The envelope the receiver expects on every message, keys in the order the app sends them, with
    a bitrate cap on every one: uncapped unless `max_bitrate` is given."""
    message: dict[str, Any] = {"command": command, "serverAddress": server_url, "accessToken": token, "userId": user_id}
    if receiver_name:
        message["receiverName"] = receiver_name
    message["maxBitrate"] = max_bitrate or UNCAPPED_BITRATE
    message["options"] = in_whole_seconds(options) if command == "Seek" else options
    return message


def in_whole_seconds(options: dict) -> dict:
    """Seek's position, in seconds, sent whole: the receiver turns it into ticks without rounding, and
    when it reloads the stream from there a fraction becomes a StartTimeTicks the server may reject.
    Rounded exactly as the app's Math.round does, halves up: adding 0.5 first rounds the sum too, and
    Python's round() goes to even. JSON has no NaN or infinity, so those go as null, as JSON.stringify
    writes them; a boolean is not a position, though Python counts it as an int."""
    position = options.get("position")
    if isinstance(position, bool) or not isinstance(position, (int, float)):
        return options
    if not math.isfinite(position):
        return {**options, "position": None}
    whole = math.floor(position)
    return {**options, "position": whole + 1 if position - whole >= 0.5 else whole}


def to_receiver_device_name(name: str) -> str:
    # Same cleanup as the receiver: ASCII letters, digits, underscore and any whitespace stay.
    return NOT_KEPT_BY_RECEIVER.sub("", name)


def receiver_name_for(device: dict | None) -> str | None:
    if device is None:
        return None
    # Whitespace above U+00FF survives the receiver's cleanup and makes its btoa() throw.
    name = JS_SPACE.sub(lambda space: " " if ord(space.group()) > 0xFF else space.group(), device.get("friendlyName") or "")
    if to_receiver_device_name(name).strip():
        return name
    tail = re.sub(r"[^a-zA-Z0-9]", "", device.get("deviceId") or "")[-FALLBACK_ID_LENGTH:]
    return f"{FALLBACK_NAME} {tail}" if tail else FALLBACK_NAME


@dataclass(frozen=True)
class MediaSample:
    """The receiver's media status. `answered` is false when the request for it went unanswered:
    pychromecast then still holds the last status it got, or UNKNOWN before any. `media_session`
    is whether that status has a media session at all."""

    at: float
    player_state: str
    current_time: float
    custom_data: dict
    answered: bool = True
    media_session: bool = True

    @property
    def item_id(self) -> str | None:
        return self.custom_data.get("itemId")

    @property
    def play_session_id(self) -> str | None:
        return self.custom_data.get("playSessionId")


@dataclass(frozen=True)
class Load:
    """One PlayNow, told apart from the media it replaces: the receiver plays every load under a new
    play session, so the item asked for under the session it had before the send is still the old
    media. `bus_start` is where the receiver's messages about this load begin."""

    item_id: str
    previous_session: str | None = None
    bus_start: int = 0

    def owns(self, status: MediaSample) -> bool:
        if status.item_id != self.item_id:
            return False
        return self.previous_session is None or status.play_session_id != self.previous_session


def sample(cast: Any, answered: bool = True) -> MediaSample:
    status = cast.media_controller.status
    return MediaSample(
        at=time.monotonic(),
        player_state=str(status.player_state),
        current_time=float(status.current_time or 0.0),
        custom_data=dict(status.media_custom_data or {}),
        answered=answered,
        media_session=getattr(status, "media_session_id", None) is not None,
    )


def refresh_status(cast: Any, timeout: float | None = None) -> MediaSample:
    """Asks the receiver for its media status and waits for the answer before sampling; a sample
    taken without one says so. pychromecast also calls back with False when the request failed, a
    closed socket or a failed write, which is no answer either."""
    answered = threading.Event()
    succeeded: list[bool] = []

    def on_status(success, *_) -> None:
        succeeded.append(bool(success))
        answered.set()

    cast.media_controller.update_status(callback_function=on_status)
    waited = answered.wait(STATUS_TIMEOUT_SECONDS if timeout is None else timeout)
    return sample(cast, answered=waited and all(succeeded))


def wait_for(
    cast: Any, predicate: Callable[[MediaSample], bool], timeout: float, what: str, every: float = 0.5, check: Callable[[], None] | None = None
) -> MediaSample:
    # The status pychromecast holds can still be the one of the media played before the send, so
    # every test reads a status the receiver has just answered with.
    deadline = time.monotonic() + timeout
    while True:
        current = refresh_status(cast, timeout=every)
        if predicate(current):
            return current
        if check is not None:
            check()
        if time.monotonic() >= deadline:
            raise SenderTimeout(what)
        time.sleep(every)


def wait_for_playing(cast: Any, load: Load, bus: list[BusMessage] | tuple = (), timeout: float = 45.0, every: float = 0.5) -> MediaSample:
    """Waits until the receiver plays this load. Other media, or the media being replaced, never
    count; an error the receiver sends about the load ends the wait at once, not at the deadline."""

    def failed() -> None:
        for message in bus[load.bus_start :]:
            if message.type in ERROR_TYPES:
                raise LoadFailed(message)

    return wait_for(cast, lambda s: s.player_state == PLAYER_STATE_PLAYING and load.owns(s), timeout, "playing", every, failed)


def watch(cast: Any, seconds: float, every: float = 2.0, on_sample: Callable[[MediaSample], None] | None = None) -> list[MediaSample]:
    samples = [refresh_status(cast, timeout=every)]
    if on_sample:
        on_sample(samples[0])
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        time.sleep(every)
        samples.append(refresh_status(cast, timeout=every))
        if on_sample:
            on_sample(samples[-1])
    return samples


class BusCollector:
    """Keeps every message the receiver sends on its channel, parsed."""

    def __init__(self) -> None:
        self.bus: list[BusMessage] = []

    def collect(self, payload_utf8: str) -> BusMessage:
        parsed = parse_bus_message(payload_utf8)
        self.bus.append(parsed)
        return parsed


PLAYER_STATE_IDLE = "IDLE"
# What pychromecast says before any status, and after an answer without a media session.
PLAYER_STATE_UNKNOWN = "UNKNOWN"


def confirmed_idle(status: MediaSample | None) -> bool:
    """A receiver that answered it plays nothing: IDLE, or no media session at all. A status the
    run did not get an answer for is not one, whatever pychromecast still holds."""
    if status is None or not status.answered:
        return False
    return status.player_state == PLAYER_STATE_IDLE or (status.player_state == PLAYER_STATE_UNKNOWN and not status.media_session)


def should_sign_out(final: MediaSample | None) -> bool:
    """Whether the token a run handed the receiver can be revoked. The receiver keeps the token of
    the last message for its own requests, and a sign-out while it still plays would break its
    progress reports and its transcoded stream. Only a receiver seen idle lets it go, after a stop
    too, which may have been lost or ignored: a state the run could not read after sending, cut
    short by Ctrl-C or left unanswered, keeps the token for the next run to revoke."""
    return confirmed_idle(final)


class ReceiverBusy(Exception):
    def __init__(self, target: str):
        super().__init__(f"another run is driving {target}; wait for it to end")
        self.target = target


class ReceiverTokens:
    """The token each receiver was handed, per server, profile and target, kept between runs.

    The run that hands a receiver its token cannot revoke it while the receiver plays, so the
    next command to that receiver reuses it, and a stop, or a run that finds the receiver idle,
    revokes it. Without this, every run left a token alive for good.

    The bitrate cap of the session goes with it. The receiver applies the cap of every message to
    the loads after it, an audio change, a burned-in subtitle or a seek it cannot do in place among
    them, so each command of the session states it again: sent uncapped, a later command lifted the
    cap the session was started with. An uncapped session is kept with UNCAPPED_BITRATE, and an
    entry without a cap is one whose cap is unknown.

    The same file keeps the orphans, tokens no receiver holds whose sign-out failed: still valid,
    so kept until one goes through. Both live in one file, so a change to the two is one write: in
    two files, a run stopped between them left the same token held and orphaned, and the next run
    revoked the token the receiver still held."""

    def __init__(self, path: Path | None = None):
        self.path = Path(path or TOKENS_PATH)
        # The file is replaced on every write, so the lock lives beside it, ignored by git as well.
        self.lock_path = self.path.with_suffix(".lock")

    def claim_path(self, target: str) -> Path:
        # The slug keeps the file readable; the digest of the exact name keeps "Den TV" and "Den-TV"
        # two receivers, which the slug alone made one.
        slug = re.sub(r"[^a-z0-9]+", "-", target.lower()).strip("-") or "target"
        digest = hashlib.sha256(target.encode()).hexdigest()[:12]
        return self.path.with_suffix(f".{slug}-{digest}.lock")

    @contextlib.contextmanager
    def claim(self, target: str):
        """Held by a run for as long as it drives this receiver, from its read of the held token to
        its write of the one it leaves. Two runs at once each handed the receiver a token, and the
        store kept the one the receiver no longer had. A second run is refused rather than queued:
        a matrix holds a receiver for minutes."""
        with open(self.claim_path(target), "a") as lock:
            if fcntl is not None:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError as error:
                    raise ReceiverBusy(target) from error
            yield

    @contextlib.contextmanager
    def _locked(self):
        """Held from a read to the write after it: two runs ending together started from the same
        file, and the later write dropped the token of the other."""
        with open(self.lock_path, "a") as lock:
            if fcntl is not None:
                fcntl.flock(lock, fcntl.LOCK_EX)
            yield

    def _read(self) -> dict:
        try:
            data = json.loads(self.path.read_text())
        except FileNotFoundError:
            data = {}
        return {"held": data.get("held", {}), "orphans": data.get("orphans", {})}

    def _write(self, data: dict) -> None:
        # Written beside the file, owner only from the first byte since it holds live tokens, then
        # moved over it: an interrupted write leaves the previous tokens, never a truncated file.
        kept = {key: tree for key, tree in data.items() if tree}
        descriptor, temporary = tempfile.mkstemp(dir=self.path.parent, prefix=f"{self.path.stem}.", suffix=".tmp")
        try:
            with os.fdopen(descriptor, "w") as file:
                file.write(json.dumps(kept, indent=2) + "\n")
            os.replace(temporary, self.path)
        except BaseException:
            with contextlib.suppress(FileNotFoundError):
                os.unlink(temporary)
            raise

    @staticmethod
    def _prune(tree: dict, server: str, profile: str) -> None:
        if not tree.get(server, {}).get(profile, True):
            del tree[server][profile]
        if not tree.get(server, True):
            del tree[server]

    def get(self, server: str, profile: str, target: str):
        from bench.jellyfin import AuthSession

        entry = self._read()["held"].get(server, {}).get(profile, {}).get(target)
        return AuthSession(token=entry["token"], user_id=entry["userId"]) if entry else None

    def max_bitrate(self, server: str, profile: str, target: str) -> int | None:
        entry = self._read()["held"].get(server, {}).get(profile, {}).get(target)
        return entry.get("maxBitrate") if entry else None

    def put(self, server: str, profile: str, target: str, session, max_bitrate: int | None = None) -> None:
        with self._locked():
            data = self._read()
            held = data["held"].setdefault(server, {}).setdefault(profile, {})
            replaced = held.get(target)
            if replaced and replaced["token"] != session.token:
                # Still valid on the server: kept for a later sign-out rather than forgotten. Its
                # session's cap stays behind, an orphan drives no receiver.
                self._add_orphan(data, server, profile, {"token": replaced["token"], "userId": replaced["userId"]})
            entry = {"token": session.token, "userId": session.user_id}
            if max_bitrate:
                entry["maxBitrate"] = max_bitrate
            held[target] = entry
            self._write(data)

    def orphan(self, server: str, profile: str, session) -> None:
        with self._locked():
            data = self._read()
            self._add_orphan(data, server, profile, {"token": session.token, "userId": session.user_id})
            self._write(data)

    @staticmethod
    def _add_orphan(data: dict, server: str, profile: str, entry: dict) -> None:
        entries = data["orphans"].setdefault(server, {}).setdefault(profile, [])
        if all(known["token"] != entry["token"] for known in entries):
            entries.append(entry)

    def orphans(self, server: str, profile: str) -> list:
        from bench.jellyfin import AuthSession

        return [AuthSession(token=e["token"], user_id=e["userId"]) for e in self._read()["orphans"].get(server, {}).get(profile, [])]

    def forget_orphan(self, server: str, profile: str, token: str) -> None:
        with self._locked():
            data = self._read()
            entries = data["orphans"].get(server, {}).get(profile, [])
            kept = [entry for entry in entries if entry["token"] != token]
            if len(kept) == len(entries):
                return
            data["orphans"][server][profile] = kept
            self._prune(data["orphans"], server, profile)
            self._write(data)

    def drop(self, server: str, profile: str, target: str) -> None:
        with self._locked():
            data = self._read()
            if data["held"].get(server, {}).get(profile, {}).pop(target, None) is None:
                return
            self._prune(data["held"], server, profile)
            self._write(data)


def play_session_of(message: BusMessage) -> str | None:
    state = message.data.get("PlayState") if isinstance(message.data, dict) else None
    return state.get("PlaySessionId") if isinstance(state, dict) else None


def answers_identify(final: MediaSample | None) -> bool:
    """Whether a receiver in this status answers Identify: it plays or pauses, under a play session."""
    return final is not None and final.player_state in IDENTIFY_ANSWERED_STATES and bool(final.play_session_id)


def identify_answer(bus: list[BusMessage], identified_at: int | None, final: MediaSample | None) -> int | None:
    """Where the playbackstop answering an Identify sits in the bus, or None: it carries the play
    session the final status names."""
    if identified_at is None or not answers_identify(final):
        return None
    return next(
        (index for index in range(identified_at, len(bus)) if bus[index].type == "playbackstop" and play_session_of(bus[index]) == final.play_session_id),
        None,
    )


def wait_for_identify_answer(bus: list[BusMessage], identified_at: int | None, final: MediaSample | None) -> None:
    """The answer can reach the bus after the status read: waits for it a little, when the status says
    one comes, so the summary does not report it unanswered and count it as a stop."""
    if identified_at is None or not answers_identify(final):
        return
    deadline = time.monotonic() + IDENTIFY_ANSWER_WAIT_SECONDS
    while identify_answer(bus, identified_at, final) is None and time.monotonic() < deadline:
        time.sleep(IDENTIFY_ANSWER_POLL_SECONDS)


def summarize_bus(bus: list[BusMessage], identified_at: int | None = None, final: MediaSample | None = None) -> dict:
    """Counts per message type, the last position the receiver reported, and every error: what a proof
    needs. Every status message carries the receiver's state, not only the progress reports.

    `identified_at` is where the bus stood when an Identify was sent, and `final` the status read after
    it. A receiver that plays or pauses answers Identify with a playbackstop carrying its state, its
    play session among it, and plays on. So when the final status still plays or pauses, the
    playbackstop of its play session is that answer, reported as `identifyAnswered` and not counted as
    a stop. The state read before the send does not tell: it can change before the Identify arrives."""
    answer = identify_answer(bus, identified_at, final)
    counts: dict[str, int] = {}
    last_progress = None
    errors = []
    for index, message in enumerate(bus):
        if index != answer:
            counts[message.type] = counts.get(message.type, 0) + 1
        state = message.data.get("PlayState") if isinstance(message.data, dict) else None
        if isinstance(state, dict):
            ticks = state.get("PositionTicks")
            last_progress = {
                # A malformed position must not cost the run its summary.
                "positionSeconds": ticks / TICKS_PER_SECOND if isinstance(ticks, (int, float)) else None,
                "playMethod": state.get("PlayMethod"),
                "isPaused": state.get("IsPaused"),
            }
        if message.type in ERROR_TYPES:
            errors.append(describe_error(message))
    summary = {"counts": counts, "lastProgress": last_progress, "errors": errors}
    if identified_at is not None:
        summary["identifyAnswered"] = answer is not None
    return summary


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


def launch(cast, timeout: float = 20.0, fresh: bool = False) -> None:
    """Starts the receiver unless it runs. `fresh` quits a running one first: the receiver keeps the
    device name of the first message it gets, so a receiver another sender started would be measured
    under that sender's name."""
    if fresh and cast.app_id == RECEIVER_APP_ID:
        cast.quit_app(timeout=timeout)
        _wait_until(lambda: cast.app_id != RECEIVER_APP_ID, timeout, f"receiver app {RECEIVER_APP_ID} to quit")
    if cast.app_id != RECEIVER_APP_ID:
        cast.start_app(RECEIVER_APP_ID, timeout=timeout)
    _wait_until(lambda: cast.app_id == RECEIVER_APP_ID, timeout, f"receiver app {RECEIVER_APP_ID}")


def _wait_until(condition: Callable[[], bool], timeout: float, what: str) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() >= deadline:
            raise SenderTimeout(what)
        time.sleep(0.5)


def attach(cast, timeout: float = 10.0):
    """Registers the receiver channel on a running app and waits until both channels are usable."""
    controller = receiver_controller_class()()
    cast.register_handler(controller)
    cast.media_controller.block_until_active(timeout=timeout)
    return controller


def slim_item(item: dict) -> dict:
    return {"Id": item.get("Id"), "Name": item.get("Name"), "Type": item.get("Type"), "MediaType": item.get("MediaType"), "IsFolder": item.get("IsFolder", False)}


def is_container(item: dict) -> bool:
    return item.get("Type") in CONTAINER_TYPES or bool(item.get("IsFolder"))


def play_now_options(items: list[dict], start_position_ticks: int = 0) -> dict:
    """PlayNow's options for these items, slimmed. A container among them is refused: see ContainerRefused."""
    container = next((item for item in items if is_container(item)), None)
    if container is not None:
        raise ContainerRefused(container)
    return {"items": [slim_item(item) for item in items], "startIndex": 0, "startPositionTicks": start_position_ticks}


def bitrate(text: str) -> int:
    """A cap in bit/s: 0 read as no cap and went out uncapped, a negative one went out as it was."""
    value = int(text)
    if value <= 0:
        raise argparse.ArgumentTypeError(f"{text} is not a positive number of bit/s")
    return value


def seconds(text: str) -> float:
    """A number of seconds: nan and inf passed as floats, then raised in the rounding, and so did a value
    whose count of ticks overflows."""
    value = float(text)
    if not math.isfinite(value) or value < 0 or not math.isfinite(value * TICKS_PER_SECOND):
        raise argparse.ArgumentTypeError(f"{text} is not a finite number of seconds, zero or more")
    return value


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
    play.add_argument("--start-seconds", type=seconds, default=0.0)
    play.add_argument("--watch", type=seconds, default=20.0)
    play.add_argument("--max-bitrate", type=bitrate, help="Cap in bit/s of the session this play starts; uncapped otherwise")
    # Every command after a play carries a cap too, the session's own unless it asks for another.
    commands = [sub.add_parser(name) for name in ("identify", "pause", "unpause", "stop")]
    sub.add_parser("status")
    seek = sub.add_parser("seek")
    seek.add_argument("--seconds", type=seconds, required=True, help="Position in seconds, sent rounded to whole seconds")
    commands.append(seek)
    for name in ("subtitle", "audio"):
        track = sub.add_parser(name)
        track.add_argument("--index", type=int, required=True)
        commands.append(track)
    for command in commands:
        command.add_argument(
            "--max-bitrate", type=bitrate, help="Cap in bit/s the session runs under from this command on; the session's own otherwise, needed when it is unknown"
        )
    args = parser.parse_args(argv)

    from bench.config import BenchConfigError, load_config

    try:
        config = load_config()
        server = config.server(args.server)
        target = config.chromecast(args.target)
        account = server.account(args.profile)
    except BenchConfigError as error:
        print(f"sender: {error}", file=sys.stderr)
        return 2
    tokens = ReceiverTokens()
    try:
        with tokens.claim(args.target):
            return _drive(args, config, server, target, account, tokens)
    except ReceiverBusy as busy:
        print(f"sender: {busy}", file=sys.stderr)
        return 2


def sign_out(client, session) -> str | None:
    """Revokes a token on the server; returns why it failed, or None once it is revoked. A token the
    server no longer knows is as good as revoked."""
    from bench.jellyfin import JellyfinHttpError

    try:
        client.logout(session)
    except (JellyfinHttpError, OSError) as error:
        if isinstance(error, JellyfinHttpError) and error.status == 401:
            return None
        return str(error)
    return None


def revoke_orphans(client, tokens: ReceiverTokens, server: str, profile: str, note: Callable[..., None]) -> None:
    """Signs out the tokens no receiver holds that an earlier run, sender or matrix, could not, and
    forgets each one only once its sign-out went through."""
    reason = "an earlier run could not sign it out"
    for orphan in tokens.orphans(server, profile):
        error = sign_out(client, orphan)
        if error is None:
            tokens.forget_orphan(server, profile, orphan.token)
            note("token revoked", reason=reason)
        else:
            note("sign-out failed", reason=reason, error=error)


def _drive(args, config, server, target, account, tokens: ReceiverTokens) -> int:
    """One command to the receiver, from the token it holds to the one the run leaves it."""
    from bench.jellyfin import JellyfinClient
    from bench.report import Report

    key = (args.server, args.profile, args.target)
    held = tokens.get(*key)
    orphans = tokens.orphans(args.server, args.profile)
    client = JellyfinClient(server.url)
    # The run's own token reads the server; messages carry the one the receiver already holds, if any.
    own = client.authenticate(account)
    report = Report(
        f"sender-{args.action}", redact=config.redact + [own.token] + ([held.token] if held else []) + [orphan.token for orphan in orphans]
    )

    def note(step: str, **data) -> None:
        # Each step goes in the report when it happens, so its time is the time of the step.
        report.add(step, **data)
        print(json.dumps({"step": step, "at": report.steps[-1]["at"], **data}, default=str))

    def revoke(session, reason: str) -> bool:
        error = sign_out(client, session)
        if error is not None:
            note("sign-out failed", reason=reason, error=error)
        return error is None

    def revoke_held(reason: str) -> None:
        nonlocal held
        # A token whose sign-out failed is still valid on the server: it stays recorded, and in use,
        # since forgotten here it was overwritten in the store and stayed alive for good.
        if revoke(held, reason):
            tokens.drop(*key)
            note("token revoked", reason=reason)
            held = None

    receiver_name = receiver_name_for({"friendlyName": target.name, "deviceId": None})
    exit_code = 0
    final: MediaSample | None = None
    # The token this run's messages carried, from the moment one may have reached the receiver.
    handed = None
    # The cap the receiver's session runs under as far as the run knows: the kept one, then that of
    # each message once sent. None when unknown, kept so for the next command to state one.
    session_cap: int | None = None
    try:
        # Inside the cleanup's scope: before it, a store write failing here, or a Ctrl-C during the
        # sign-outs, left the run's own token alive with no record of it, and no report.
        revoke_orphans(client, tokens, args.server, args.profile, note)
        if args.action == "play-now":
            # Looked up and checked before the receiver starts: a missing or refused item must not
            # close what the TV shows.
            if args.channel:
                item = next((c for c in client.channels(own) if c.get("Name") == args.item), None)
            else:
                item = client.find_item(own, args.item)
            if item is None:
                note("item", found=False, query=args.item)
                return 2
            note("item", found=True, id=item["Id"], name=item["Name"])
            try:
                options = play_now_options([item], int(args.start_seconds * TICKS_PER_SECOND))
            except ContainerRefused as refused:
                note("refused", error=str(refused))
                return 2
        cast = connect(target)
        note("connected", target=target.name, app=cast.app_display_name)
        # Only a play starts the receiver: any other action would close what the TV shows for nothing.
        if args.action == "play-now":
            launch(cast)
        if cast.app_id != RECEIVER_APP_ID:
            note("receiver", running=False)
            if held is not None:
                revoke_held("receiver not running")
            cast.disconnect(timeout=5)
            return 0 if args.action in ("status", "stop") else 1
        controller = attach(cast)
        before = refresh_status(cast)
        note("receiver", app_id=cast.app_id, state=before.player_state, answered=before.answered)
        if held is not None and should_sign_out(before):
            revoke_held(f"receiver {before.player_state}")
        session = held or own
        # The cap this run's messages carry, and its session's from then on: a play starts the session
        # under the one it asks for, a later command keeps the kept session's unless it asks for
        # another. A kept session whose cap is unknown, kept before caps were or after a send that
        # failed, needs one stated: guessed, it could lift the cap of the loads to come. So does a
        # session the bench did not start, the app's say. A stop starts no load, and status sends
        # nothing.
        asked = getattr(args, "max_bitrate", None)
        if held is not None:
            session_cap = tokens.max_bitrate(*key)
        if asked is None and session_cap is None and args.action not in ("play-now", "stop", "status"):
            note("refused", error=f"the bitrate cap of the session on {target.name} is unknown: pass --max-bitrate, or start it again with play-now")
            cast.disconnect(timeout=5)
            return 2
        max_bitrate = asked or (session_cap if args.action != "play-now" else None) or UNCAPPED_BITRATE
        # A stop under an unknown cap goes out uncapped, yet the session's cap stays unknown:
        # recorded, that guess would let the next command lift a cap the bench never knew.
        cap_known = args.action == "play-now" or asked is not None or session_cap is not None

        def send(command: str, options: dict | None = None) -> None:
            nonlocal handed, session_cap
            handed = session
            message = build_message(command, server.url, session.token, session.user_id, options or {}, receiver_name, max_bitrate)
            controller.send(message)
            if cap_known:
                session_cap = message["maxBitrate"]
            note("sent", command=command, options=options or {}, max_bitrate=message["maxBitrate"])

        identified_at = None
        if args.action == "play-now":
            load = Load(item_id=item["Id"], previous_session=before.play_session_id, bus_start=len(controller.bus))
            sent_at = time.monotonic()
            send("PlayNow", options)
            try:
                first = wait_for_playing(cast, load, controller.bus)
                note("playing", after_seconds=round(first.at - sent_at, 1), custom_data=first.custom_data)
            except SenderTimeout as timeout:
                note("timeout", what=timeout.what, bus=summarize_bus(controller.bus))
                exit_code = 1
            except LoadFailed as failure:
                note("load failed", error=str(failure), bus=summarize_bus(controller.bus))
                exit_code = 1
            else:

                def note_sample(item_sample: MediaSample) -> None:
                    note("sample", state=item_sample.player_state, time=round(item_sample.current_time, 1), play_method=item_sample.custom_data.get("playMethod"))

                watch(cast, args.watch, on_sample=note_sample)
        elif args.action == "seek":
            send("Seek", {"position": args.seconds})
        elif args.action == "subtitle":
            send("SetSubtitleStreamIndex", {"index": args.index})
        elif args.action == "audio":
            send("SetAudioStreamIndex", {"index": args.index})
        elif args.action == "status":
            pass
        else:
            if args.action == "identify":
                # A playing receiver answers with a playbackstop and plays on: the summary tells it
                # apart, from the status read after the send.
                identified_at = len(controller.bus)
            send({"identify": "Identify", "pause": "Pause", "unpause": "Unpause", "stop": "Stop"}[args.action])
        if args.action == "stop":
            # A Stop lost or ignored leaves the receiver playing: that is a failed stop, not a success.
            try:
                final = wait_for(cast, confirmed_idle, STOP_TIMEOUT_SECONDS, "the receiver to stop")
            except SenderTimeout:
                final = refresh_status(cast)
                note("stop not obeyed", state=final.player_state, answered=final.answered, after_seconds=STOP_TIMEOUT_SECONDS)
                exit_code = 1
        else:
            time.sleep(2)
            final = refresh_status(cast)
        wait_for_identify_answer(controller.bus, identified_at, final)
        note(
            "final",
            state=final.player_state,
            answered=final.answered,
            time=round(final.current_time, 1),
            custom_data=final.custom_data,
            bus=summarize_bus(controller.bus, identified_at, final),
        )
        cast.disconnect(timeout=5)
    finally:
        # The evidence is written whatever the sign-out does: a failed one must not cost the run its report.
        try:
            # Never handed to the receiver, so nothing else uses it; a failed sign-out leaves it
            # for the next run to retry, instead of alive with no record of it.
            if handed is not own and not revoke(own, "not handed to the receiver"):
                tokens.orphan(args.server, args.profile, own)
            if handed is not None:
                if not should_sign_out(final):
                    tokens.put(*key, handed, session_cap)
                    if final is None or not final.answered:
                        state = "state unknown after sending"
                    else:
                        state = f"still {final.player_state}"
                    note("token kept", reason=f"receiver {state}; the next command to {target.name} reuses it, stop revokes it")
                elif revoke(handed, f"receiver {final.player_state} after {args.action}"):
                    tokens.drop(*key)
                else:
                    # Still valid on the server: the next run to this receiver revokes it.
                    tokens.put(*key, handed, session_cap)
        finally:
            paths = report.save()
            if args.keep:
                report.keep(args.keep, config.keep_dir)
            print(f"report: {paths.markdown}")
    return exit_code


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.exit(main())
