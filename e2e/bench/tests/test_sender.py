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


def bus_payload(case: dict) -> str:
    # An object input is the message as the receiver builds it; pychromecast hands it over serialized.
    return case["input"] if isinstance(case["input"], str) else json.dumps(case["input"])


class SharedVectorTests(unittest.TestCase):
    def test_build_message_matches_shared_vector(self):
        for case in vector("play-now.json")["cases"]:
            if "refused" in case["expected"]:
                # No message is built for it: see the refusal test below.
                continue
            session = case["session"]
            with self.subTest(case["name"]):
                built = build_message(
                    case["command"],
                    session["basePath"],
                    session["accessToken"],
                    session["userId"],
                    # A plain command's options go through the sender; PlayNow's are sent as given.
                    case.get("options", case["expected"]["options"]),
                    receiver_name=session.get("receiverName"),
                    max_bitrate=session.get("maxBitrate"),
                )
                self.assertEqual(built, case["expected"])
                self.assertEqual(list(built), list(case["expected"]))

    def test_play_now_refuses_the_containers_the_shared_vector_refuses(self):
        # A container anywhere in the request is refused before a message is built; any other item
        # goes through.
        for case in vector("play-now.json")["cases"]:
            if case["command"] != "PlayNow":
                continue
            with self.subTest(case["name"]):
                items = case["request"]["items"]
                if case["expected"].get("refused") == "container":
                    with self.assertRaises(sender.ContainerRefused):
                        sender.play_now_options(items)
                else:
                    self.assertEqual(len(sender.play_now_options(items)["items"]), len(items))

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
                parsed = parse_bus_message(bus_payload(case))
                if case["expected"].get("invalid"):
                    self.assertEqual(parsed, BusMessage(type="invalid", message=case["input"], data=None))
                else:
                    expected = case["expected"]
                    self.assertEqual(parsed, BusMessage(type=expected["type"], message=expected.get("message"), data=expected.get("data")))

    def test_summarize_bus_reads_the_position_of_every_status_message(self):
        # Every status message carries the receiver's state, not only the progress reports: after a
        # pause or a stop, the last position is the one that message gave.
        for case in vector("bus-messages.json")["cases"]:
            state = (case["expected"].get("data") or {}).get("PlayState")
            if state is None:
                continue
            with self.subTest(case["name"]):
                summary = summarize_bus([parse_bus_message(bus_payload(case))])
                self.assertEqual(summary["lastProgress"]["positionSeconds"], state["PositionTicks"] / 10_000_000)
                self.assertEqual(summary["lastProgress"]["isPaused"], state["IsPaused"])


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


class WatchTests(unittest.TestCase):
    # The receiver keeps the token of the last message for its own requests (progress,
    # transcoded segments); a sign-out while it still plays would cut them off.
    def test_sign_out_waits_for_the_receiver_to_stop(self):
        self.assertFalse(should_sign_out("play-now", "PLAYING"))
        self.assertFalse(should_sign_out("pause", "PAUSED"))
        self.assertFalse(should_sign_out("seek", "BUFFERING"))
        self.assertTrue(should_sign_out("stop", "IDLE"))
        self.assertTrue(should_sign_out("play-now", "IDLE"))
        self.assertTrue(should_sign_out("stop", "PLAYING"))

    def test_a_state_unread_after_sending_keeps_the_token(self):
        # A Ctrl-C during the watch, or a lost connection, leaves the state unknown while the
        # receiver may well play with the token: revoking it broke the playback on the TV.
        self.assertFalse(should_sign_out("play-now", None))
        self.assertFalse(should_sign_out("seek", None))
        self.assertTrue(should_sign_out("stop", None))

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
        bus = [BusMessage(type="playbackerror", message="RateLimitExceeded"), BusMessage(type="playbackstart", data={"PlayState": {"PositionTicks": 0}})]
        cast = FakeCast([("IDLE", 0.0, {})])
        load = sender.Load("item-1", bus_start=len(bus))
        bus.append(BusMessage(type="playbackerror", message="NotAllowed"))
        started = time.monotonic()
        with self.assertRaises(sender.LoadFailed) as caught:
            wait_for_playing(cast, load, bus, timeout=5.0, every=0.01)
        self.assertLess(time.monotonic() - started, 1.0)
        self.assertEqual(str(caught.exception), "playbackerror: NotAllowed")

    def test_an_error_before_the_send_does_not_fail_the_load(self):
        bus = [BusMessage(type="connectionerror", message="")]
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


def status_message(kind: str, seconds: float, paused: bool = False, play_session: str = "ps-1") -> str:
    state = {"PlaySessionId": play_session, "PositionTicks": round(seconds * 10_000_000), "PlayMethod": "Transcode", "IsPaused": paused}
    return json.dumps({"data": {"PlayState": state, "NowPlayingItem": {"Id": "x"}}, "type": kind})


def final_status(player_state: str, play_session: str | None = "ps-1") -> sender.MediaSample:
    """The status the sender reads after an Identify."""
    return sender.MediaSample(at=0.0, player_state=player_state, current_time=0.0, custom_data=custom("x", play_session) if play_session else {})


class BusCollectorTests(unittest.TestCase):
    def test_collect_parses_and_keeps_every_message(self):
        collector = BusCollector()
        collector.collect(status_message("playbackstart", 0))
        collector.collect("garbage")
        self.assertEqual([m.type for m in collector.bus], ["playbackstart", "invalid"])
        self.assertEqual(collector.bus[0].data["PlayState"]["PositionTicks"], 0)

    def test_summarize_bus_counts_types_and_keeps_the_last_position(self):
        # The receiver reports its state several times a second with the whole item inside:
        # a proof needs counts and the last position, not hundreds of copies of the item. The last
        # one here is the pause, which is no progress report.
        collector = BusCollector()
        collector.collect(status_message("playbackstart", 0))
        collector.collect(status_message("playbackprogress", 1))
        collector.collect(status_message("playstatechange", 3, paused=True))
        collector.collect('{"message":"NoCompatibleStream","type":"playbackerror"}')
        summary = summarize_bus(collector.bus)
        self.assertEqual(summary["counts"], {"playbackstart": 1, "playbackprogress": 1, "playstatechange": 1, "playbackerror": 1})
        self.assertEqual(summary["lastProgress"], {"positionSeconds": 3.0, "playMethod": "Transcode", "isPaused": True})
        self.assertEqual(summary["errors"], ["playbackerror: NoCompatibleStream"])
        self.assertNotIn("identifyAnswered", summary)

    def test_the_playbackstop_answering_identify_is_not_a_stop(self):
        # A receiver that plays or pauses answers Identify with a playbackstop carrying its state, its
        # play session among it, and plays on: only a playbackstop after that answer is a stop.
        collector = BusCollector()
        collector.collect(status_message("playbackprogress", 10))
        identified_at = len(collector.bus)
        collector.collect(status_message("playbackstop", 12))
        collector.collect(status_message("playbackprogress", 13))
        for final in (final_status("PLAYING"), final_status("PAUSED")):
            with self.subTest(final.player_state):
                summary = summarize_bus(collector.bus, identified_at, final)
                self.assertEqual(summary["counts"], {"playbackprogress": 2})
                self.assertTrue(summary["identifyAnswered"])
                self.assertEqual(summary["lastProgress"]["positionSeconds"], 13.0)
        collector.collect(status_message("playbackstop", 14))
        self.assertEqual(summarize_bus(collector.bus, identified_at, final_status("PLAYING"))["counts"], {"playbackprogress": 2, "playbackstop": 1})

    def test_a_playbackstop_of_media_no_longer_playing_is_a_stop(self):
        # Playing when read, the media ended as the Identify left: the receiver's playbackstop is a
        # real stop, and the Identify reached an idle receiver, which does not answer. Nor does the
        # stop of a track the queue moved past answer for the next one.
        collector = BusCollector()
        collector.collect(status_message("playbackprogress", 10))
        identified_at = len(collector.bus)
        collector.collect(status_message("playbackstop", 12))
        for final in (final_status("IDLE", None), final_status("PLAYING", "ps-2")):
            with self.subTest(final.player_state):
                summary = summarize_bus(collector.bus, identified_at, final)
                self.assertEqual(summary["counts"], {"playbackprogress": 1, "playbackstop": 1})
                self.assertFalse(summary["identifyAnswered"])

    def test_an_identify_left_unanswered_says_so(self):
        # Idle, the receiver shows its waiting screen and sends nothing back.
        collector = BusCollector()
        summary = summarize_bus(collector.bus, identified_at=0)
        self.assertEqual(summary["counts"], {})
        self.assertFalse(summary["identifyAnswered"])


class LaunchTests(unittest.TestCase):
    def test_fresh_launch_restarts_a_running_receiver(self):
        # The receiver keeps the device name of the first message it got: a measure on a receiver
        # another sender started would run under that sender's name.
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

    def test_the_file_lives_where_git_and_biome_ignore_it(self):
        self.assertEqual(sender.TOKENS_PATH, Path(__file__).resolve().parents[1] / "receiver-tokens.local.json")


def sender_main(*args: str) -> int:
    return sender.main(["--server", "beta13", "--target", "Living room", *args])


class BufferingUntilIdentify(FakeReceiver):
    """A receiver still buffering whenever the sender reads its state, and playing by the time an
    Identify reaches it."""

    def update_status(self, callback_function=None) -> None:
        if self.status.player_state != "BUFFERING":
            super().update_status(callback_function)
        elif callback_function:
            callback_function(True, None)

    def send(self, message: dict) -> None:
        if message["command"] == "Identify" and self.status.player_state == "BUFFERING":
            self.status.player_state = "PLAYING"
        super().send(message)


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

    def test_identify_while_playing_is_not_counted_as_a_stop(self):
        # The receiver answers Identify with a playbackstop and plays on: the proof of an identify
        # must not read as a receiver that stopped.
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver) as run:
            sender_main("play-now", "--item", "V01", "--watch", "0")
            self.assertEqual(sender_main("identify"), 0)
            [report] = [path for path in run.reports(".json") if "identify" in path.name]
            steps = json.loads(report.read_text())["steps"]
        bus = next(step["data"]["bus"] for step in steps if step["step"] == "final")
        self.assertEqual([message.type for message in receiver.bus], ["playbackstop"])
        self.assertNotIn("playbackstop", bus["counts"])
        self.assertTrue(bus["identifyAnswered"])
        self.assertEqual(receiver.status.player_state, "PLAYING")

    def test_identify_answered_after_its_state_was_read_is_not_counted_as_a_stop(self):
        # The state read before the send can be out of date when the Identify arrives: still buffering
        # when read, after a seek that reloads say, the receiver plays by then and answers it.
        server = FakeServer()
        receiver = BufferingUntilIdentify(status=FakeStatus("BUFFERING", 0.0, custom("item-1", "ps-1")))
        with bench_run(server, receiver) as run:
            self.assertEqual(sender_main("identify"), 0)
            [report] = run.reports(".json")
            steps = json.loads(report.read_text())["steps"]
        bus = next(step["data"]["bus"] for step in steps if step["step"] == "final")
        self.assertEqual([message.type for message in receiver.bus], ["playbackstop"])
        self.assertNotIn("playbackstop", bus["counts"])
        self.assertTrue(bus["identifyAnswered"])

    def test_a_later_command_carries_the_cap_the_play_started_with(self):
        # The receiver applies the cap of every message to the loads after it, and an audio change
        # reloads the stream: sent uncapped, it lifted the cap the run was measuring under.
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver):
            sender_main("play-now", "--item", "V01", "--watch", "0", "--max-bitrate", "3000000")
            sender_main("audio", "--index", "2")
        self.assertEqual([m["command"] for m in receiver.received], ["PlayNow", "SetAudioStreamIndex"])
        self.assertEqual(receiver.received[-1]["maxBitrate"], 3000000)

    def test_a_cap_a_later_command_asks_for_is_the_session_cap_from_then_on(self):
        server = FakeServer(items={"V01": V01})
        receiver = FakeReceiver()
        with bench_run(server, receiver) as run:
            sender_main("play-now", "--item", "V01", "--watch", "0", "--max-bitrate", "3000000")
            sender_main("seek", "--seconds", "60", "--max-bitrate", "1500000")
            sender_main("pause")
            stored = json.loads((run.root / "receiver-tokens.local.json").read_text())
            # A new play starts a session of its own, uncapped unless it asks for a cap.
            sender_main("play-now", "--item", "V01", "--watch", "0")
            sender_main("unpause")
        self.assertEqual(
            [(m["command"], m["maxBitrate"]) for m in receiver.received],
            [("PlayNow", 3000000), ("Seek", 1500000), ("Pause", 1500000), ("PlayNow", 120000000), ("Unpause", 120000000)],
        )
        self.assertEqual(stored["beta13"]["test"]["Living room"], {"token": "tok1", "userId": "user-1", "maxBitrate": 1500000})

    def test_a_container_is_refused_before_anything_is_sent(self):
        server = FakeServer(items={"P01": {"Id": "playlist-1", "Name": "Road trip", "Type": "Playlist", "IsFolder": True}})
        receiver = FakeReceiver()
        with bench_run(server, receiver) as run:
            self.assertEqual(sender_main("play-now", "--item", "P01"), 2)
            report = run.report_text()
        self.assertEqual(receiver.received, [])
        self.assertEqual(server.live, [])
        self.assertIn("cannot cast Playlist playlist-1", report)

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


class SeekPositionTests(unittest.TestCase):
    def build_seek(self, position):
        return build_message("Seek", "https://jellyfin.example.test", "tok-123", "user-1", {"position": position})

    def test_a_position_json_cannot_hold_goes_as_null(self):
        # JSON.stringify writes NaN and the infinities as null; json.dumps would write invalid JSON.
        for position in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(position=position):
                self.assertIsNone(self.build_seek(position)["options"]["position"])

    def test_a_boolean_is_not_a_position(self):
        # bool is an int in Python; the app sends it as it is.
        self.assertIs(self.build_seek(True)["options"]["position"], True)
