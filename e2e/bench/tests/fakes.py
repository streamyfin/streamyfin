"""Doubles for the tests that run a bench tool's main(): a Jellyfin server that hands out tokens
and a Cast device running the Jellyfin receiver. Nothing here reaches a network."""

from __future__ import annotations

import contextlib
import io
import os
import tempfile
import time
import types
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

from bench.jellyfin import AuthSession, JellyfinHttpError
from bench.sender import BusMessage

EXAMPLE_CONFIG = Path(__file__).resolve().parents[1] / "config.example.json"
RECEIVER_APP_ID = "F007D354"
OTHER_APP_ID = "233637DE"

# The tools wait between status requests; the doubles answer at once.
NO_WAIT_TIME = types.SimpleNamespace(sleep=lambda _seconds: None, monotonic=time.monotonic, strftime=time.strftime)


class FakeServer:
    """A Jellyfin server: every sign-in hands out a new token, valid until it is signed out."""

    def __init__(self, sessions=(), groups=(), items=None, logout_error: Exception | None = None):
        self.sessions = list(sessions)
        self.groups = list(groups)
        self.items = dict(items or {})
        self.logout_error = logout_error
        self.issued: list[str] = []
        self.revoked: list[str] = []

    @property
    def live(self) -> list[str]:
        return [token for token in self.issued if token not in self.revoked]

    def client(self, url: str, client_name: str | None = None, device_id: str | None = None, timeout: float = 30.0) -> FakeClient:
        return FakeClient(self)


class FakeClient:
    def __init__(self, server: FakeServer):
        self.server = server

    def _authorized(self, token: str | None, path: str) -> None:
        if token not in self.server.live:
            raise JellyfinHttpError(401, path)

    def authenticate(self, account) -> AuthSession:
        token = f"tok{len(self.server.issued) + 1}"
        self.server.issued.append(token)
        return AuthSession(token=token, user_id="user-1")

    def logout(self, session: AuthSession) -> None:
        if self.server.logout_error is not None:
            raise self.server.logout_error
        self._authorized(session.token, "/Sessions/Logout")
        self.server.revoked.append(session.token)

    def sessions(self, token: str) -> list[dict]:
        self._authorized(token, "/Sessions")
        return self.server.sessions

    def get(self, path: str, params: dict | None = None, token: str | None = None):
        self._authorized(token, path)
        if path == "/SyncPlay/List":
            return self.server.groups
        raise AssertionError(f"unexpected GET {path}")

    def find_item(self, session: AuthSession, query: str, include_types: tuple[str, ...] = ("Movie",)) -> dict | None:
        self._authorized(session.token, "/Items")
        return self.server.items.get(query.split(" ")[0])

    def channels(self, session: AuthSession) -> list[dict]:
        self._authorized(session.token, "/LiveTv/Channels")
        return []


@dataclass
class FakeStatus:
    player_state: str = "IDLE"
    current_time: float = 0.0
    media_custom_data: dict = field(default_factory=dict)


class FakeReceiver:
    """A Cast device, its media status and the Jellyfin receiver's channel in one object, since the
    sender reaches all three through the cast. Like the receiver, it plays what it is sent under a
    new play session, buffering first, keeps the token of the last message, and answers Identify
    with a playbackstop of its play session while it plays or pauses."""

    def __init__(self, app_id: str | None = RECEIVER_APP_ID, status: FakeStatus | None = None, clock: FakeClock | None = None):
        self.app_id = app_id
        self.status = status or FakeStatus()
        self.media_controller = self
        self.clock = clock
        self.bus: list = []
        self.received: list[dict] = []
        self.events: list[str] = []
        self.loads = 0

    @property
    def app_display_name(self) -> str:
        return "Jellyfin" if self.app_id == RECEIVER_APP_ID else "Other app"

    @property
    def token(self) -> str | None:
        return self.received[-1]["accessToken"] if self.received else None

    def start_app(self, app_id: str, timeout: float | None = None, force_launch: bool = False) -> None:
        self.events.append("start")
        self.app_id = app_id
        self.status = FakeStatus()

    def quit_app(self, timeout: float | None = None) -> None:
        self.events.append("quit")
        self.app_id = None
        self.status = FakeStatus()

    def register_handler(self, handler) -> None:
        pass

    def disconnect(self, timeout: float | None = None) -> None:
        self.events.append("disconnect")

    def block_until_active(self, timeout: float | None = None) -> None:
        pass

    def update_status(self, callback_function=None) -> None:
        if self.clock is not None:
            self.clock.tick()
        if self.status.player_state == "BUFFERING":
            self.status.player_state = "PLAYING"
        elif self.status.player_state == "PLAYING":
            self.status.current_time += 2.0
        if callback_function:
            callback_function(True, None)

    def send(self, message: dict) -> None:
        self.received.append(message)
        command = message["command"]
        if command == "PlayNow":
            self.loads += 1
            item = message["options"]["items"][0]
            custom = {"itemId": item["Id"], "playSessionId": f"ps-{self.loads}", "playMethod": "DirectStream"}
            self.status = FakeStatus("BUFFERING", 0.0, custom)
        elif command == "Stop":
            self.status = FakeStatus()
        elif command == "Pause" and self.status.player_state == "PLAYING":
            self.status.player_state = "PAUSED"
        elif command == "Unpause" and self.status.player_state == "PAUSED":
            self.status.player_state = "PLAYING"
        elif command == "Identify" and self.status.player_state in ("PLAYING", "PAUSED"):
            state = {
                "PlaySessionId": (self.status.media_custom_data or {}).get("playSessionId"),
                "PositionTicks": round(self.status.current_time * 10_000_000),
                "IsPaused": self.status.player_state == "PAUSED",
            }
            self.bus.append(BusMessage(type="playbackstop", data={"PlayState": state}))


def playing(item_id: str, play_session: str = "ps-0", position: float = 10.0) -> FakeStatus:
    return FakeStatus("PLAYING", position, {"itemId": item_id, "playSessionId": play_session, "playMethod": "DirectStream"})


class FakeClock:
    """A UTC clock that only moves when told to, so report times show when each step happened."""

    def __init__(self, start: datetime = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)):
        self.now = start
        clock = self

        class ClockDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return clock.now if tz else clock.now.replace(tzinfo=None)

        self.datetime = ClockDatetime

    def tick(self, seconds: float = 1.0) -> None:
        self.now += timedelta(seconds=seconds)


@dataclass
class Run:
    root: Path
    stdout: io.StringIO
    stderr: io.StringIO

    def reports(self, suffix: str = ".md") -> list[Path]:
        return sorted(path for path in self.root.rglob(f"*{suffix}") if "reports" in path.parts)

    def report_text(self) -> str:
        [path] = self.reports()
        return path.read_text()


@contextlib.contextmanager
def bench_run(server: FakeServer, receiver: FakeReceiver | None = None, clock: FakeClock | None = None):
    """Runs a tool's main() against the doubles from a scratch working directory, where its reports
    and the receiver tokens land too, whichever of the two places the tool writes them to."""
    previous = os.getcwd()
    with tempfile.TemporaryDirectory() as tmp, contextlib.ExitStack() as stack:
        root = Path(tmp)
        stack.enter_context(mock.patch.dict(os.environ, {"E2E_BENCH_CONFIG": str(EXAMPLE_CONFIG)}))
        stack.enter_context(mock.patch("bench.jellyfin.JellyfinClient", server.client))
        stack.enter_context(mock.patch("bench.report.REPORTS_DIR", root / "e2e" / "reports", create=True))
        stack.enter_context(mock.patch("bench.sender.TOKENS_PATH", root / "receiver-tokens.local.json", create=True))
        stack.enter_context(mock.patch("bench.sender.time", NO_WAIT_TIME))
        if receiver is not None:
            stack.enter_context(mock.patch("bench.sender.connect", lambda target, timeout=10.0: receiver))
            stack.enter_context(mock.patch("bench.sender.attach", lambda cast, timeout=10.0: receiver))
        if clock is not None:
            stack.enter_context(mock.patch("bench.report.datetime", clock.datetime))
        run = Run(root=root, stdout=io.StringIO(), stderr=io.StringIO())
        stack.enter_context(contextlib.redirect_stdout(run.stdout))
        stack.enter_context(contextlib.redirect_stderr(run.stderr))
        os.chdir(root)
        try:
            yield run
        finally:
            os.chdir(previous)
