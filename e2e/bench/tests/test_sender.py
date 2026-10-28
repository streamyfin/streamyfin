import json
import time
import unittest
from dataclasses import dataclass
from pathlib import Path

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

VECTORS = Path(__file__).resolve().parents[2] / "fixtures" / "receiver-protocol"


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


class WatchTests(unittest.TestCase):
    # The receiver keeps the token of the last message for its own requests (progress,
    # transcoded segments); a sign-out while it still plays would cut them off.
    def test_sign_out_waits_for_the_receiver_to_stop(self):
        self.assertFalse(should_sign_out("play-now", "PLAYING"))
        self.assertFalse(should_sign_out("pause", "PAUSED"))
        self.assertFalse(should_sign_out("seek", "BUFFERING"))
        self.assertTrue(should_sign_out("stop", "IDLE"))
        self.assertTrue(should_sign_out("play-now", "IDLE"))
        self.assertTrue(should_sign_out("status", None))
        self.assertTrue(should_sign_out("stop", "PLAYING"))

    def test_watch_raises_named_timeout_when_never_playing(self):
        cast = FakeCast([("IDLE", 0.0, {})])
        with self.assertRaises(SenderTimeout) as caught:
            wait_for_playing(cast, timeout=0.2, every=0.05)
        self.assertIn("playing", str(caught.exception))
        self.assertEqual(caught.exception.what, "playing")

    def test_wait_for_playing_returns_the_first_playing_sample(self):
        cast = FakeCast([("BUFFERING", 0.0, {}), ("PLAYING", 1.5, {"playMethod": "DirectPlay"})])
        sample = wait_for_playing(cast, timeout=1.0, every=0.01)
        self.assertEqual(sample.player_state, "PLAYING")
        self.assertEqual(sample.custom_data["playMethod"], "DirectPlay")

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


if __name__ == "__main__":
    unittest.main()
