import unittest
from pathlib import Path

from bench.sender import BusMessage, MediaSample, SenderTimeout
from bench.sessions import SessionView
from suites.cast.matrix import CastDriver, Row, evaluate, load_cases, run, to_markdown

CASES = Path(__file__).resolve().parents[3] / "fixtures" / "media.json"


def case(**overrides) -> dict:
    base = {"id": "V01", "kind": "video", "match": {"code": "V01"}, "expect": {"chromecast-gen3": "DirectPlay"}}
    base.update(overrides)
    return base


def samples(states):
    return [MediaSample(at=float(i), player_state=state, current_time=float(position), custom_data=custom) for i, (state, position, custom) in enumerate(states)]


def view(play_method="DirectPlay", reasons=None) -> SessionView:
    return SessionView(id="s", device="Salon", client="Chromecast", user="test", item_id="x", item_name="x", position_seconds=5.0, is_paused=False, play_method=play_method, transcoding_reasons=reasons or [], last_activity=None, group_id=None)


class LoadTests(unittest.TestCase):
    def test_load_cases_reads_the_shared_file_and_filters_ids(self):
        cases = load_cases(CASES, ids=["V03", "LIVE-1"])
        self.assertEqual([c["id"] for c in cases], ["V03", "LIVE-1"])
        self.assertEqual(cases[1]["match"], {"channel": "1 Films libres"})

    def test_load_cases_names_an_unknown_id(self):
        with self.assertRaises(ValueError) as caught:
            load_cases(CASES, ids=["NOPE"])
        self.assertIn("NOPE", str(caught.exception))


class EvaluateTests(unittest.TestCase):
    def test_evaluate_ok_when_custom_and_server_agree_with_expected(self):
        row = evaluate(case(), "chromecast-gen3", samples([("BUFFERING", 0, {}), ("PLAYING", 1, {"playMethod": "DirectPlay"}), ("PLAYING", 9, {"playMethod": "DirectPlay"})]), view(), [])
        self.assertEqual(row.verdict, "ok")
        self.assertEqual(row.observed_custom, "DirectPlay")
        self.assertEqual(row.observed_server, "DirectPlay")
        self.assertEqual(row.startup_seconds, 1.0)
        self.assertEqual(row.advanced_seconds, 8.0)

    def test_evaluate_ko_on_play_method_mismatch(self):
        row = evaluate(case(), "chromecast-gen3", samples([("PLAYING", 1, {"playMethod": "Transcode"}), ("PLAYING", 9, {"playMethod": "Transcode"})]), view("Transcode", ["VideoCodecNotSupported"]), [])
        self.assertEqual(row.verdict, "ko")
        self.assertIn("expected DirectPlay", " ".join(row.errors))
        self.assertIn("VideoCodecNotSupported", " ".join(row.errors))

    def test_evaluate_reports_receiver_error_from_bus(self):
        bus = [BusMessage(type="playbackerror", message="Unable to load media")]
        row = evaluate(case(), "chromecast-gen3", samples([("IDLE", 0, {})]), None, bus)
        self.assertEqual(row.verdict, "ko")
        self.assertIn("playbackerror: Unable to load media", row.errors)

    def test_evaluate_ko_when_playback_never_started(self):
        row = evaluate(case(), "chromecast-gen3", samples([("IDLE", 0, {}), ("BUFFERING", 0, {})]), None, [])
        self.assertEqual(row.verdict, "ko")
        self.assertTrue(any("never" in error for error in row.errors))
        self.assertIsNone(row.startup_seconds)

    def test_evaluate_skipped_when_item_missing(self):
        row = evaluate(case(), "chromecast-gen3", [], None, [])
        self.assertEqual(row.verdict, "skipped")

    def test_evaluate_without_expectation_for_the_target_is_informational(self):
        row = evaluate(case(expect={}), "apple-tv", samples([("PLAYING", 1, {"playMethod": "Transcode"})]), None, [])
        self.assertEqual(row.verdict, "ok")
        self.assertIsNone(row.expected)


class FakeDriver:
    def __init__(self, outcomes):
        self.outcomes = dict(outcomes)
        self.sent = []
        self.stops = 0

    def resolve(self, case):
        return None if case["id"] == "MISSING" else {"Id": f"id-{case['id']}", "Name": case["id"], "Type": "Movie", "MediaType": "Video"}

    def play(self, item, case):
        self.sent.append(case["id"])
        outcome = self.outcomes.get(case["id"], "playing")
        if outcome == "timeout":
            raise SenderTimeout("playing")
        return samples([("PLAYING", 1, {"playMethod": "DirectPlay"}), ("PLAYING", 5, {"playMethod": "DirectPlay"})])

    def server_view(self, item):
        return view()

    def bus_since(self, start):
        return []

    def stop(self):
        self.stops += 1


class FakeClient:
    def __init__(self, sessions):
        self._sessions = sessions

    def sessions(self, token):
        return self._sessions


class ServerViewTests(unittest.TestCase):
    def test_server_view_matches_the_receiver_device_name_as_jellyfin_records_it(self):
        # The receiver strips punctuation from the name it is given before registering with
        # the server: "Salon - Chromecast" becomes "Salon  Chromecast" in the sessions list.
        sessions = [{"Id": "s1", "DeviceName": "Salon  Chromecast", "Client": "Chromecast", "NowPlayingItem": {"Id": "id-V01"}, "PlayState": {"PlayMethod": "Transcode"}, "TranscodingInfo": {"TranscodeReasons": ["ContainerNotSupported"]}}]
        driver = CastDriver(FakeClient(sessions), session=type("S", (), {"token": "t", "user_id": "u"})(), cast=None, controller=None, receiver_name="Salon - Chromecast", server_url="http://x", watch_seconds=1)
        found = driver.server_view({"Id": "id-V01"})
        self.assertIsNotNone(found)
        self.assertEqual(found.play_method, "Transcode")
        self.assertEqual(found.transcoding_reasons, ["ContainerNotSupported"])


class RunTests(unittest.TestCase):
    def test_run_stops_receiver_after_each_case(self):
        driver = FakeDriver({"V02": "timeout"})
        rows = run([case(id="V01"), case(id="V02"), case(id="MISSING")], "chromecast-gen3", driver)
        self.assertEqual(driver.stops, 2)
        self.assertEqual([r.verdict for r in rows], ["ok", "ko", "skipped"])
        self.assertIn("timed out waiting for playing", " ".join(rows[1].errors))

    def test_markdown_table_has_one_line_per_case(self):
        rows = [Row(case_id="V01", expected="DirectPlay", observed_custom="DirectPlay", observed_server="DirectPlay", startup_seconds=1.2, advanced_seconds=18.0, errors=[], verdict="ok")]
        table = to_markdown(rows)
        self.assertIn("| V01 | DirectPlay | DirectPlay | DirectPlay | 1.2 | 18.0 |  | ok |", table)
        self.assertTrue(table.startswith("| cas | attendu |"))


if __name__ == "__main__":
    unittest.main()
