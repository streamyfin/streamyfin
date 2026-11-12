import fnmatch
import json
import stat
import tempfile
import time
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest import mock

from bench import sender
from bench.sender import (
    should_sign_out,
    BusCollector,
    BusMessage,
    SenderTimeout,
    build_message,
    parse_bus_message,
    receiver_name_for,
    refresh_status,
    summarize_bus,
    to_receiver_device_name,
    wait_for_playing,
    watch,
)
from bench.tests.fakes import OTHER_APP_ID, RECEIVER_APP_ID, FakeClock, FakeReceiver, FakeServer, FakeStatus, bench_run, playing

VECTORS = Path(__file__).resolve().parents[2] / "fixtures" / "receiver-protocol"
V01 = {"Id": "item-v01", "Name": "H.264 8 bits 1080p", "Type": "Movie", "MediaType": "Video"}


def vector(name: str) -> dict:
    return json.loads((VECTORS / name).read_text())


class SharedVectorTests(unittest.TestCase):
    def test_build_message_matches_shared_vector(self):
        for case in vector("play-now.json")["cases"]:
            session = case["session"]
            with self.subTest(case["name"]):
                built = build_message(
                    case["command"],
                    session["basePath"],
                    session["accessToken"],
                    session["userId"],
                    case["expected"]["options"],
                    receiver_name=session.get("receiverName"),
                    max_bitrate=session.get("maxBitrate"),
                )
                self.assertEqual(built, case["expected"])
                self.assertEqual(list(built), list(case["expected"]))

    def test_receiver_name_matches_shared_vector(self):
        data = vector("receiver-name.json")
        for case in data["receiverNameFor"]:
            with self.subTest(case["name"]):
                self.assertEqual(receiver_name_for(case["input"]), case["expected"])
        for case in data["toReceiverDeviceName"]:
            with self.subTest(case["name"]):
                self.assertEqual(to_receiver_device_name(case["input"]), case["expected"])

    def test_parse_bus_message_types(self):
        for case in vector("bus-messages.json")["cases"]:
            with self.subTest(case["name"]):
                parsed = parse_bus_message(case["input"])
                if case["expected"].get("invalid"):
                    self.assertEqual(parsed, BusMessage(type="invalid", message=case["input"], data=None))
                else:
                    expected = case["expected"]
                    self.assertEqual(parsed, BusMessage(type=expected["type"], message=expected.get("message"), data=expected.get("data")))


@dataclass
class FakeStatus:
    player_state: str = "IDLE"
    current_time: float = 0.0
    media_custom_data: dict = None


class FakeMediaController:
    def __init__(self, states):
        self.states = list(states)
        self.status = FakeStatus(*self.states[0])
        self.updates = 0

    def update_status(self, callback_function=None):
        self.updates += 1
        if len(self.states) > 1:
            self.states.pop(0)
        self.status = FakeStatus(*self.states[0])
        if callback_function:
            callback_function(True, None)


class FakeCast:
    def __init__(self, states):
        self.media_controller = FakeMediaController(states)


def custom(item_id: str, play_session: str, method: str = "DirectStream") -> dict:
    return {"itemId": item_id, "playSessionId": play_session, "playMethod": method}


def seen(state: str, answered: bool = True, media_session: bool = True) -> sender.MediaSample:
    return sender.MediaSample(at=0.0, player_state=state, current_time=0.0, custom_data={}, answered=answered, media_session=media_session)


class SilentCast(FakeCast):
    """A receiver that stopped answering status requests: pychromecast keeps its last status."""

    def __init__(self, states):
        super().__init__(states)
        self.media_controller.update_status = lambda callback_function=None: None


class FailingCast(FakeCast):
    """A status request that failed: pychromecast calls the callback with False, after a closed socket
    or a failed write, and keeps its last status."""

    def __init__(self, states):
        super().__init__(states)
        self.media_controller.update_status = lambda callback_function=None: callback_function(False, None)


class WatchTests(unittest.TestCase):
    # The receiver keeps the token of the last message for its own requests (progress,
    # transcoded segments); a sign-out while it still plays would cut them off.
    def test_sign_out_waits_for_the_receiver_to_stop(self):
        self.assertFalse(should_sign_out(seen("PLAYING")))
        self.assertFalse(should_sign_out(seen("PAUSED")))
        self.assertFalse(should_sign_out(seen("BUFFERING")))
        self.assertTrue(should_sign_out(seen("IDLE")))

    def test_a_stop_the_receiver_did_not_obey_keeps_the_token(self):
        # A Stop lost on the way, or ignored, leaves the receiver playing with the token: revoking
        # it after any stop cut the stream on the TV.
        self.assertFalse(should_sign_out(seen("PLAYING")))

    def test_a_state_unread_after_sending_keeps_the_token(self):
        # A Ctrl-C during the watch, or a lost connection, leaves the state unknown while the
        # receiver may well play with the token: revoking it broke the playback on the TV.
        self.assertFalse(should_sign_out(None))

    def test_only_a_receiver_seen_idle_lets_the_token_go(self):
        # pychromecast says UNKNOWN until a status arrives, and keeps its last one when a request
        # goes unanswered: neither is a receiver seen idle.
        self.assertFalse(should_sign_out(seen("UNKNOWN")))
        self.assertFalse(should_sign_out(seen("IDLE", answered=False)))

    def test_a_receiver_that_answers_it_has_no_media_lets_the_token_go(self):
        # An answer with no media session leaves pychromecast's state UNKNOWN: nothing plays.
        self.assertTrue(should_sign_out(seen("UNKNOWN", media_session=False)))
        self.assertFalse(should_sign_out(seen("UNKNOWN", answered=False, media_session=False)))

    def test_a_status_request_left_unanswered_is_not_an_answer(self):
        cast = SilentCast([("IDLE", 0.0, {})])
        status = refresh_status(cast, timeout=0.01)
        self.assertFalse(status.answered)
        self.assertEqual(status.player_state, "IDLE")
        self.assertTrue(refresh_status(FakeCast([("IDLE", 0.0, {})]), timeout=0.5).answered)

    def test_a_status_request_that_failed_is_not_an_answer(self):
        # The callback ran, with False: the cached IDLE it leaves let the run revoke a token the
        # receiver may still play with.
        status = refresh_status(FailingCast([("IDLE", 0.0, {})]), timeout=0.5)
        self.assertFalse(status.answered)
        self.assertFalse(should_sign_out(status))

    def test_watch_raises_named_timeout_when_never_playing(self):
        cast = FakeCast([("IDLE", 0.0, {})])
        with self.assertRaises(SenderTimeout) as caught:
            wait_for_playing(cast, sender.Load("item-1"), timeout=0.2, every=0.05)
        self.assertIn("playing", str(caught.exception))
        self.assertEqual(caught.exception.what, "playing")

    def test_wait_for_playing_returns_the_first_playing_sample(self):
        cast = FakeCast([("BUFFERING", 0.0, custom("item-1", "ps-1")), ("PLAYING", 1.5, custom("item-1", "ps-1"))])
        sample = wait_for_playing(cast, sender.Load("item-1"), timeout=1.0, every=0.01)
        self.assertEqual(sample.player_state, "PLAYING")
        self.assertEqual(sample.custom_data["playMethod"], "DirectStream")

    def test_wait_for_playing_skips_the_media_still_on_the_receiver(self):
        # The receiver still plays V01 when V02 is sent: its cached PLAYING is not the new load.
        cast = FakeCast(
            [("PLAYING", 300.0, custom("item-v01", "ps-0")), ("BUFFERING", 0.0, custom("item-v02", "ps-1")), ("PLAYING", 0.5, custom("item-v02", "ps-1"))]
        )
        sample = wait_for_playing(cast, sender.Load("item-v02", previous_session="ps-0"), timeout=1.0, every=0.01)
        self.assertEqual(sample.custom_data, custom("item-v02", "ps-1"))
        self.assertEqual(sample.current_time, 0.5)

    def test_wait_for_playing_times_out_on_a_stale_status_alone(self):
        cast = FakeCast([("PLAYING", 300.0, custom("item-v01", "ps-0"))])
        with self.assertRaises(SenderTimeout):
            wait_for_playing(cast, sender.Load("item-v02", previous_session="ps-0"), timeout=0.2, every=0.05)

    def test_wait_for_playing_skips_the_item_under_its_previous_play_session(self):
        # A recast of the item already on the TV: only a new play session is the new load.
        cast = FakeCast([("PLAYING", 300.0, custom("item-1", "ps-0")), ("PLAYING", 302.0, custom("item-1", "ps-0")), ("PLAYING", 0.5, custom("item-1", "ps-1"))])
        sample = wait_for_playing(cast, sender.Load("item-1", previous_session="ps-0"), timeout=1.0, every=0.01)
        self.assertEqual(sample.custom_data["playSessionId"], "ps-1")
        with self.assertRaises(SenderTimeout):
            wait_for_playing(FakeCast([("PLAYING", 300.0, custom("item-1", "ps-0"))]), sender.Load("item-1", previous_session="ps-0"), timeout=0.2, every=0.05)

    def test_wait_for_playing_fails_at_once_on_a_receiver_error(self):
        bus = [BusMessage(type="playbackerror", message="old failure"), BusMessage(type="playbackstart", message="")]
        cast = FakeCast([("IDLE", 0.0, {})])
        load = sender.Load("item-1", bus_start=len(bus))
        bus.append(BusMessage(type="playbackerror", message="Unable to load media"))
        started = time.monotonic()
        with self.assertRaises(sender.LoadFailed) as caught:
            wait_for_playing(cast, load, bus, timeout=5.0, every=0.01)
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(str(caught.exception), "playbackerror: Unable to load media")

    def test_an_error_before_the_send_does_not_fail_the_load(self):
        bus = [BusMessage(type="connectionerror")]
        cast = FakeCast([("BUFFERING", 0.0, custom("item-1", "ps-1")), ("PLAYING", 1.0, custom("item-1", "ps-1"))])
        sample = wait_for_playing(cast, sender.Load("item-1", bus_start=len(bus)), bus, timeout=1.0, every=0.01)
        self.assertEqual(sample.player_state, "PLAYING")

    def test_watch_samples_the_media_status(self):
        cast = FakeCast([("PLAYING", 1.0, {}), ("PLAYING", 2.0, {}), ("PLAYING", 3.0, {})])
        started = time.monotonic()
        seen = []
        samples = watch(cast, seconds=0.1, every=0.03, on_sample=seen.append)
        self.assertGreaterEqual(len(samples), 2)
        self.assertEqual(seen, samples)
        self.assertTrue(all(s.player_state == "PLAYING" for s in samples))
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertGreater(samples[-1].at, samples[0].at)
        self.assertGreaterEqual(cast.media_controller.updates, 2)

    def test_refresh_status_waits_for_the_receiver_answer(self):
        cast = FakeCast([("PAUSED", 4.0, {"playMethod": "DirectPlay"})])
        self.assertEqual(refresh_status(cast, timeout=0.5).player_state, "PAUSED")
        self.assertEqual(cast.media_controller.updates, 1)


class BusCollectorTests(unittest.TestCase):
    def test_collect_parses_and_keeps_every_message(self):
        collector = BusCollector()
        collector.collect('{"type":"playbackstart","message":""}')
        collector.collect("garbage")
        self.assertEqual([m.type for m in collector.bus], ["playbackstart", "invalid"])

    def test_summarize_bus_counts_types_and_keeps_the_last_progress(self):
        # The receiver reports progress several times a second with the whole item inside:
        # a proof needs counts and the last position, not hundreds of copies of the item.
        collector = BusCollector()
        collector.collect('{"type":"playbackstart","message":""}')
        collector.collect('{"type":"playbackprogress","data":{"PlayState":{"PositionTicks":10000000,"PlayMethod":"Transcode","IsPaused":false},"NowPlayingItem":{"Name":"x"}}}')
        collector.collect('{"type":"playbackprogress","data":{"PlayState":{"PositionTicks":30000000,"PlayMethod":"Transcode","IsPaused":true},"NowPlayingItem":{"Name":"x"}}}')
        collector.collect('{"type":"playbackerror","message":"boom"}')
        summary = summarize_bus(collector.bus)
        self.assertEqual(summary["counts"], {"playbackstart": 1, "playbackprogress": 2, "playbackerror": 1})
        self.assertEqual(summary["lastProgress"], {"positionSeconds": 3.0, "playMethod": "Transcode", "isPaused": True})
        self.assertEqual(summary["errors"], ["playbackerror: boom"])


class LaunchTests(unittest.TestCase):
    def test_fresh_launch_restarts_a_running_receiver(self):
        # The receiver keeps the device name and the bitrate cap of the first message it got: a
        # measure on a receiver another sender started would run under that sender's settings.
        cast = FakeReceiver(app_id=RECEIVER_APP_ID)
        sender.launch(cast, fresh=True)
        self.assertEqual(cast.events, ["quit", "start"])
        self.assertEqual(cast.app_id, RECEIVER_APP_ID)

    def test_launch_keeps_a_running_receiver_and_starts_a_missing_one(self):
        running = FakeReceiver(app_id=RECEIVER_APP_ID)
        sender.launch(running)
        self.assertEqual(running.events, [])
        other = FakeReceiver(app_id=OTHER_APP_ID)
        sender.launch(other, fresh=True)
        self.assertEqual(other.events, ["start"])
        self.assertEqual(other.app_id, RECEIVER_APP_ID)


class ReceiverTokensTests(unittest.TestCase):
    def test_tokens_are_kept_per_server_profile_and_target_for_the_owner_only(self):
        from bench.jellyfin import AuthSession

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "tokens.json"
            tokens = sender.ReceiverTokens(path)
            tokens.put("beta13", "test", "Living room", AuthSession("tok1", "user-1"))
            tokens.put("beta13", "test", "Kitchen", AuthSession("tok2", "user-1"))
            self.assertEqual(sender.ReceiverTokens(path).get("beta13", "test", "Living room"), AuthSession("tok1", "user-1"))
            self.assertIsNone(tokens.get("beta13", "standard", "Living room"))
            self.assertIsNone(tokens.get("beta12", "test", "Living room"))
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            tokens.drop("beta13", "test", "Living room")
            self.assertIsNone(tokens.get("beta13", "test", "Living room"))
            self.assertEqual(tokens.get("beta13", "test", "Kitchen"), AuthSession("tok2", "user-1"))
            tokens.drop("beta13", "test", "Kitchen")
            self.assertEqual(json.loads(path.read_text()), {})

    def test_an_interrupted_write_leaves_the_previous_tokens(self):
        # The file was truncated as it opened: a Ctrl-C before the write ended left it empty, and
        # the next run failed on it with every token it held lost.
        from bench.jellyfin import AuthSession

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "tokens.local.json"
            tokens = sender.ReceiverTokens(path)
            tokens.put("beta13", "test", "Living room", AuthSession("tok1", "user-1"))
            with mock.patch("bench.sender.json.dumps", side_effect=KeyboardInterrupt), self.assertRaises(KeyboardInterrupt):
                tokens.put("beta13", "test", "Kitchen", AuthSession("tok2", "user-1"))
            self.assertEqual(sender.ReceiverTokens(path).get("beta13", "test", "Living room"), AuthSession("tok1", "user-1"))
            self.assertEqual([entry.name for entry in Path(tmp).iterdir() if entry.suffix == ".tmp"], [])

    def test_a_write_waits_for_another_run_to_finish_its_own(self):
        # Two runs ending together read the same file, and the later write dropped the other's
        # token: alive on the server with no record left to revoke it.
        import fcntl
        import threading

        from bench.jellyfin import AuthSession

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "tokens.local.json"
            tokens = sender.ReceiverTokens(path)
            writer = threading.Thread(target=tokens.put, args=("beta13", "test", "Kitchen", AuthSession("tok2", "user-1")))
            with open(tokens.lock_path, "a") as other_run:
                fcntl.flock(other_run, fcntl.LOCK_EX)
                writer.start()
                writer.join(0.3)
                self.assertTrue(writer.is_alive())
                self.assertFalse(path.exists())
            writer.join(5)
            self.assertEqual(tokens.get("beta13", "test", "Kitchen"), AuthSession("tok2", "user-1"))

    def test_a_replaced_token_waits_for_its_sign_out(self):
        # A token another write replaced was still valid on the server, with no record left of it.
        from bench.jellyfin import AuthSession

        with tempfile.TemporaryDirectory() as tmp:
            tokens = sender.ReceiverTokens(Path(tmp) / "tokens.local.json")
            tokens.put("beta13", "test", "Living room", AuthSession("tok1", "user-1"))
            tokens.put("beta13", "test", "Living room", AuthSession("tok1", "user-1"))
            self.assertEqual(tokens.orphans("beta13", "test"), [])
            tokens.put("beta13", "test", "Living room", AuthSession("tok2", "user-1"))
            self.assertEqual(tokens.orphans("beta13", "test"), [AuthSession("tok1", "user-1")])
            self.assertEqual(stat.S_IMODE(tokens.orphans_path.stat().st_mode), 0o600)
            tokens.forget_orphan("beta13", "test", "tok1")
            self.assertEqual(tokens.orphans("beta13", "test"), [])
            self.assertEqual(json.loads(tokens.orphans_path.read_text()), {})

    def test_a_receiver_driven_by_one_run_is_refused_to_another(self):
        with tempfile.TemporaryDirectory() as tmp:
            tokens = sender.ReceiverTokens(Path(tmp) / "tokens.local.json")
            with tokens.claim("Living room"):
                with self.assertRaises(sender.ReceiverBusy) as caught, sender.ReceiverTokens(tokens.path).claim("Living room"):
                    pass
                self.assertIn("Living room", str(caught.exception))
                # Another receiver is another lock.
                with sender.ReceiverTokens(tokens.path).claim("Kitchen"):
                    pass
            with sender.ReceiverTokens(tokens.path).claim("Living room"):
                pass

    def test_names_that_differ_only_in_punctuation_are_two_receivers(self):
        # Both names gave the file den-tv: a run on one receiver was refused while it was free.
        with tempfile.TemporaryDirectory() as tmp:
            tokens = sender.ReceiverTokens(Path(tmp) / "tokens.local.json")
            self.assertNotEqual(tokens.claim_path("Den TV"), tokens.claim_path("Den-TV"))
            with tokens.claim("Den TV"), sender.ReceiverTokens(tokens.path).claim("Den-TV"):
                pass

    def test_the_file_lives_where_git_and_biome_ignore_it(self):
        self.assertEqual(sender.TOKENS_PATH, Path(__file__).resolve().parents[1] / "receiver-tokens.local.json")
        tokens = sender.ReceiverTokens()
        for path in (tokens.lock_path, tokens.orphans_path, tokens.claim_path("Living room")):
            with self.subTest(path=path.name):
                self.assertEqual(path.parent, sender.TOKENS_PATH.parent)
                self.assertTrue(fnmatch.fnmatch(path.name, "*.local.*"), path.name)


def sender_main(*args: str) -> int:
    return sender.main(["--server", "beta13", "--target", "Living room", *args])


class SenderMainTests(unittest.TestCase):
    def test_an_interrupted_play_keeps_the_token_the_receiver_plays_with(self):
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver) as run, mock.patch("bench.sender.watch", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                sender_main("play-now", "--item", "V01", "--watch", "20")
            report = run.report_text()
        self.assertEqual(server.revoked, [])
        self.assertIn(receiver.token, server.live)
        self.assertIn("token kept", report)

    def test_play_then_stop_leaves_no_token_alive(self):
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver):
            self.assertEqual(sender_main("play-now", "--item", "V01", "--watch", "0"), 0)
            self.assertEqual(receiver.status.player_state, "PLAYING")
            self.assertEqual(sender_main("stop"), 0)
        self.assertEqual(server.live, [])
        # The stop went out with the token the receiver played with.
        self.assertEqual([m["accessToken"] for m in receiver.received], ["tok1", "tok1"])

    def test_a_later_command_reuses_the_token_the_receiver_holds(self):
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver):
            sender_main("play-now", "--item", "V01", "--watch", "0")
            sender_main("pause")
            sender_main("status")
        self.assertEqual([m["command"] for m in receiver.received], ["PlayNow", "Pause"])
        self.assertEqual({m["accessToken"] for m in receiver.received}, {"tok1"})
        self.assertEqual(receiver.status.player_state, "PAUSED")
        self.assertEqual(server.live, ["tok1"])

    def test_status_does_not_keep_a_token_it_never_handed(self):
        server = FakeServer()
        receiver = FakeReceiver(status=playing("item-from-the-app"))
        with bench_run(server, receiver):
            self.assertEqual(sender_main("status"), 0)
        self.assertEqual(receiver.received, [])
        self.assertEqual(server.issued, ["tok1"])
        self.assertEqual(server.live, [])

    def test_a_run_that_finds_the_receiver_idle_revokes_its_token(self):
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver) as run:
            sender_main("play-now", "--item", "V01", "--watch", "0")
            self.assertEqual(server.live, ["tok1"])
            # The movie ends on the TV, nobody sends a stop.
            receiver.status = FakeStatus()
            sender_main("status")
            self.assertEqual(server.live, [])
            stored = json.loads((run.root / "receiver-tokens.local.json").read_text())
        self.assertEqual(stored, {})

    def test_only_play_now_starts_the_receiver(self):
        # Status or stop on a TV showing another app used to close that app for nothing.
        for action, code in (("status", 0), ("stop", 0), ("pause", 1)):
            with self.subTest(action=action):
                server = FakeServer()
                receiver = FakeReceiver(app_id=OTHER_APP_ID)
                with bench_run(server, receiver):
                    self.assertEqual(sender_main(action), code)
                self.assertNotIn("start", receiver.events)
                self.assertNotIn("quit", receiver.events)
                self.assertEqual(receiver.app_id, OTHER_APP_ID)
                self.assertEqual(receiver.received, [])
                self.assertEqual(server.live, [])

    def test_a_held_token_whose_sign_out_fails_stays_recorded(self):
        # Its sign-out failing, the old token stays valid on the server: dropped from the run, it was
        # overwritten in the store by the run's own token and stayed alive for good.
        from urllib.error import URLError

        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver) as run:
            sender_main("play-now", "--item", "V01", "--watch", "0")
            # The movie ends on the TV, and the server cannot be reached for the sign-out.
            receiver.status = FakeStatus()
            server.logout_error = URLError("server away")
            sender_main("play-now", "--item", "V01", "--watch", "0")
            stored = json.loads((run.root / "receiver-tokens.local.json").read_text())
        self.assertEqual(stored["beta13"]["test"]["Living room"]["token"], "tok1")
        self.assertEqual(receiver.received[-1]["accessToken"], "tok1")

    def test_a_receiver_that_stops_answering_keeps_its_token(self):
        # The status pychromecast keeps is the last one it got: read after a request that went
        # unanswered, a cached IDLE let the run revoke the token the receiver played with.
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver), mock.patch("bench.sender.STATUS_TIMEOUT_SECONDS", 0.01):
            sender_main("play-now", "--item", "V01", "--watch", "0")
            receiver.status = FakeStatus()
            receiver.answers = False
            self.assertEqual(sender_main("status"), 0)
        self.assertEqual(server.live, ["tok1"])

    def test_a_stop_the_receiver_ignores_fails_and_keeps_the_token(self):
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver) as run, mock.patch("bench.sender.STOP_TIMEOUT_SECONDS", 0.05):
            sender_main("play-now", "--item", "V01", "--watch", "0")
            receiver.ignores = {"Stop"}
            self.assertEqual(sender_main("stop"), 1)
            report = run.reports()[-1].read_text()
        self.assertEqual(receiver.status.player_state, "PLAYING")
        self.assertEqual(server.live, ["tok1"])
        self.assertIn("stop not obeyed", report)

    def test_the_runs_own_token_whose_sign_out_failed_is_revoked_by_the_next_run(self):
        from urllib.error import URLError

        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver):
            sender_main("play-now", "--item", "V01", "--watch", "0")
            # The pause goes out with the receiver's token, tok1; the run's own, tok2, fails to sign out.
            server.logout_error = URLError("server away")
            sender_main("pause")
            self.assertEqual(server.live, ["tok1", "tok2"])
            server.logout_error = None
            sender_main("unpause")
        self.assertEqual(server.live, ["tok1"])
        self.assertEqual({m["accessToken"] for m in receiver.received}, {"tok1"})

    def test_a_run_on_a_receiver_another_run_drives_does_nothing(self):
        # Two runs both without a held token handed the receiver one each, and the store kept the
        # one the receiver no longer had.
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver) as run:
            with sender.ReceiverTokens(run.root / "receiver-tokens.local.json").claim("Living room"):
                self.assertEqual(sender_main("play-now", "--item", "V01", "--watch", "0"), 2)
            stderr = run.stderr.getvalue()
        self.assertIn("another run is driving Living room", stderr)
        self.assertEqual(receiver.received, [])
        self.assertEqual(server.issued, [])

    def test_report_steps_carry_the_time_they_happened(self):
        clock = FakeClock()
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver(clock=clock)
        with bench_run(server, receiver, clock=clock) as run:
            sender_main("play-now", "--item", "V01", "--watch", "0")
            [report] = run.reports(".json")
            steps = json.loads(report.read_text())["steps"]
        times = {step["step"]: step["at"] for step in steps}
        self.assertEqual(times["connected"], "2026-10-30T12:00:00+00:00")
        self.assertLess(times["connected"], times["playing"])
        self.assertLess(times["playing"], times["final"])


if __name__ == "__main__":
    unittest.main()
