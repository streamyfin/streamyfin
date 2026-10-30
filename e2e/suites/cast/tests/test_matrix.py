import json
import unittest
from pathlib import Path
from unittest import mock

from bench.config import CAST_KINDS
from bench.jellyfin import JellyfinHttpError
from bench.sender import BusMessage, MediaSample, SenderTimeout
from bench.sessions import SessionView
from bench.tests.fakes import RECEIVER_APP_ID, FakeReceiver, FakeServer, bench_run
from suites.cast import matrix
from suites.cast.matrix import CastDriver, Row, evaluate, load_cases, run, to_markdown

CASES = Path(__file__).resolve().parents[3] / "fixtures" / "media.json"
ITEM = "id-V01"
# The receiver's status before the PlayNow: a fresh receiver plays nothing.
BEFORE = ("IDLE", 0, {})


def case(**overrides) -> dict:
    base = {"id": "V01", "kind": "video", "match": {"code": "V01"}, "expect": {"chromecast-gen3": "DirectStream"}}
    base.update(overrides)
    return base


def status(state: str, position: float, method: str = "DirectStream", item: str = ITEM, play_session: str = "ps-1") -> tuple:
    return (state, position, {"itemId": item, "playSessionId": play_session, "playMethod": method})


def samples(states):
    return [MediaSample(at=float(i), player_state=state, current_time=float(position), custom_data=custom) for i, (state, position, custom) in enumerate(states)]


def played(method: str = "DirectStream", item: str = ITEM, seconds: int = 10) -> list[MediaSample]:
    """A case that plays at once and through a watch of `seconds`, one sample a second."""
    return samples([BEFORE, *(status("PLAYING", 1 + second, method, item) for second in range(seconds + 1))])


def view(play_method: str = "DirectStream", reasons=None, transcoding: bool | None = None) -> SessionView:
    session = SessionView(
        id="s", device="Salon", client="Chromecast", user="test", item_id="x", item_name="x", position_seconds=5.0, is_paused=False,
        play_method=play_method, transcoding_reasons=reasons or [], last_activity=None, group_id=None,
    )
    session.is_transcoding = play_method == "Transcode" if transcoding is None else transcoding
    return session


def expected_method(case: dict) -> str:
    return (case.get("expect") or {}).get("chromecast-gen3") or "DirectStream"


class FakeDriver:
    """Plays every case as its expectation says, unless a case is given other samples, another
    server view, or a failure at one of its steps."""

    def __init__(self, plays=None, views=None, failures=None, missing=()):
        self.plays = dict(plays or {})
        self.views = dict(views or {})
        self.failures = dict(failures or {})
        self.missing = set(missing)
        self.sent = []
        self.stops = 0
        self.case = None

    def fail(self, step: str, case_id: str) -> None:
        if (case_id, step) in self.failures:
            raise self.failures[(case_id, step)]

    def resolve(self, case):
        self.fail("resolve", case["id"])
        if case["id"] in self.missing or case["id"] == "MISSING":
            return None
        return {"Id": f"id-{case['id']}", "Name": case["id"], "Type": "Movie", "MediaType": "Video"}

    def play(self, item, case):
        self.case = case
        self.sent.append(case["id"])
        self.fail("play", case["id"])
        return self.plays.get(case["id"]) or played(expected_method(case), item["Id"])

    def server_view(self, item):
        self.fail("server_view", item["Name"])
        if item["Name"] in self.views:
            return self.views[item["Name"]]
        return view(expected_method(self.case))

    def bus_since_play(self):
        return []

    def stop(self):
        self.stops += 1


class LoadTests(unittest.TestCase):
    def test_load_cases_reads_the_shared_file_and_filters_ids(self):
        cases = load_cases(CASES, ids=["V03", "LIVE-1"])
        self.assertEqual([c["id"] for c in cases], ["V03", "LIVE-1"])
        self.assertEqual(cases[1]["match"], {"channel": "1 Films libres"})

    def test_load_cases_names_an_unknown_id(self):
        with self.assertRaises(ValueError) as caught:
            load_cases(CASES, ids=["NOPE"])
        self.assertIn("NOPE", str(caught.exception))

    def test_every_cast_expectation_is_a_value_the_receiver_writes(self):
        # The receiver writes DirectStream for a static stream and Transcode otherwise; an
        # expectation of DirectPlay could never be met on a Cast target.
        for entry in load_cases(CASES):
            for kind in CAST_KINDS:
                expected = entry["expect"].get(kind)
                if expected is not None:
                    with self.subTest(case=entry["id"], kind=kind):
                        self.assertIn(expected, ("DirectStream", "Transcode"))


class EvaluateTests(unittest.TestCase):
    def test_evaluate_ok_when_custom_and_server_agree_with_expected(self):
        row = evaluate(case(), "chromecast-gen3", samples([BEFORE, status("BUFFERING", 0), status("PLAYING", 1), status("PLAYING", 9)]), view(), [], item_id=ITEM)
        self.assertEqual(row.verdict, "ok")
        self.assertEqual(row.observed_custom, "DirectStream")
        self.assertEqual(row.observed_server, "DirectStream")
        self.assertFalse(row.server_transcoding)
        self.assertEqual(row.startup_seconds, 2.0)
        self.assertEqual(row.advanced_seconds, 8.0)

    def test_evaluate_ok_when_transcode_is_expected_and_the_server_gives_its_reasons(self):
        # Transcoding reasons explain an expected transcode; they must not turn the row red.
        row = evaluate(case(expect={"chromecast-gen3": "Transcode"}), "chromecast-gen3", played("Transcode"), view("Transcode", ["VideoCodecNotSupported"]), [], item_id=ITEM)
        self.assertEqual(row.verdict, "ok")
        self.assertEqual(row.reasons, ["VideoCodecNotSupported"])
        self.assertTrue(row.server_transcoding)

    def test_evaluate_ko_on_play_method_mismatch(self):
        row = evaluate(case(), "chromecast-gen3", played("Transcode"), view("Transcode", ["VideoCodecNotSupported"]), [], item_id=ITEM)
        self.assertEqual(row.verdict, "ko")
        self.assertIn("expected DirectStream, receiver says Transcode", row.errors)
        self.assertIn("expected DirectStream, server runs a transcode (Transcode)", row.errors)
        self.assertEqual(row.reasons, ["VideoCodecNotSupported"])

    def test_direct_play_from_the_server_is_a_direct_stream(self):
        # The server turns a Transcode without a job into DirectPlay, and a static stream is
        # DirectStream on both sides: the raw values stay in the row, the verdict reads the axis.
        row = evaluate(case(), "chromecast-gen3", played("DirectStream"), view("DirectPlay"), [], item_id=ITEM)
        self.assertEqual(row.verdict, "ok")
        self.assertEqual((row.observed_custom, row.observed_server), ("DirectStream", "DirectPlay"))

    def test_the_server_transcoding_job_decides_on_its_side(self):
        row = evaluate(case(), "chromecast-gen3", played("DirectStream"), view("DirectStream", transcoding=True), [], item_id=ITEM)
        self.assertEqual(row.verdict, "ko")
        self.assertIn("expected DirectStream, server runs a transcode (DirectStream)", row.errors)
        transcoded = evaluate(case(expect={"chromecast-gen3": "Transcode"}), "chromecast-gen3", played("Transcode"), view("DirectPlay", transcoding=True), [], item_id=ITEM)
        self.assertEqual(transcoded.verdict, "ok")

    def test_evaluate_reports_receiver_error_from_bus(self):
        bus = [BusMessage(type="playbackerror", message="NoCompatibleStream")]
        row = evaluate(case(), "chromecast-gen3", samples([BEFORE]), None, bus, item_id=ITEM)
        self.assertEqual(row.verdict, "ko")
        self.assertIn("playbackerror: NoCompatibleStream", row.errors)

    def test_evaluate_ko_when_playback_never_started(self):
        row = evaluate(case(), "chromecast-gen3", samples([BEFORE, status("BUFFERING", 0)]), None, [], item_id=ITEM)
        self.assertEqual(row.verdict, "ko")
        self.assertTrue(any("never" in error for error in row.errors))
        self.assertIsNone(row.startup_seconds)

    def test_evaluate_ko_on_timeout_keeps_the_receiver_error(self):
        bus = [BusMessage(type="playbackerror", message="NotAllowed")]
        row = evaluate(case(), "chromecast-gen3", [], None, bus, item_id=ITEM)
        self.assertEqual(row.verdict, "ko")
        self.assertIn("playbackerror: NotAllowed", row.errors)
        self.assertIn("playback never started", row.errors)

    def test_evaluate_ko_on_timeout_without_bus_or_session(self):
        row = evaluate(case(), "chromecast-gen3", [], None, [], item_id=ITEM)
        self.assertEqual(row.verdict, "ko")
        self.assertEqual(row.errors, ["playback never started"])

    def test_evaluate_skipped_when_item_missing(self):
        row = evaluate(case(), "chromecast-gen3", [], None, [], missing_item=True)
        self.assertEqual(row.verdict, "skipped")

    def test_evaluate_without_expectation_for_the_target_is_informational(self):
        row = evaluate(case(expect={}), "apple-tv", played("Transcode"), None, [], item_id=ITEM)
        self.assertEqual(row.verdict, "ok")
        self.assertIsNone(row.expected)

    def test_only_the_item_asked_for_counts(self):
        # The receiver still played the previous case: its PLAYING, then the new load failing to
        # IDLE, is no playback of this case.
        row = evaluate(case(), "chromecast-gen3", samples([status("PLAYING", 300, item="id-V00", play_session="ps-0"), ("IDLE", 0, {})]), view(), [], item_id=ITEM)
        self.assertEqual(row.verdict, "ko")
        self.assertIn("playback never started", row.errors)

    def test_the_same_item_under_its_previous_play_session_does_not_count(self):
        recast = samples([status("PLAYING", 300, play_session="ps-0"), status("PLAYING", 302, play_session="ps-0"), ("IDLE", 0, {})])
        self.assertEqual(evaluate(case(), "chromecast-gen3", recast, view(), [], item_id=ITEM).verdict, "ko")
        replaced = samples([status("PLAYING", 300, play_session="ps-0"), *(status("PLAYING", second, play_session="ps-1") for second in range(1, 12))])
        row = evaluate(case(), "chromecast-gen3", replaced, view(), [], item_id=ITEM)
        self.assertEqual(row.verdict, "ok")
        self.assertEqual(row.startup_seconds, 1.0)

    def test_a_start_that_stalls_is_ko(self):
        stalled = samples([BEFORE, status("BUFFERING", 0, "Transcode"), status("PLAYING", 1, "Transcode"), *[status("BUFFERING", 1, "Transcode")] * 10])
        row = evaluate(case(expect={"chromecast-gen3": "Transcode"}), "chromecast-gen3", stalled, view("Transcode"), [], item_id=ITEM)
        self.assertEqual(row.verdict, "ko")
        self.assertIn("position advanced 0.0 s in 10.0 s watched", row.errors)

    def test_a_frozen_position_is_ko(self):
        frozen = samples([BEFORE, *[status("PLAYING", 5)] * 11])
        row = evaluate(case(), "chromecast-gen3", frozen, view(), [], item_id=ITEM)
        self.assertEqual(row.verdict, "ko")
        self.assertIn("position advanced 0.0 s in 10.0 s watched", row.errors)

    def test_an_expectation_without_server_session_is_incomplete(self):
        row = evaluate(case(), "chromecast-gen3", played(), None, [], item_id=ITEM)
        self.assertEqual(row.verdict, "incomplete")
        self.assertIn("no server session to confirm it", row.errors)
        self.assertEqual(matrix.exit_code([row]), 1)


class ServerViewTests(unittest.TestCase):
    def test_server_view_matches_the_receiver_device_name_as_jellyfin_records_it(self):
        # The receiver strips punctuation from the name it is given before registering with
        # the server: "Salon - Chromecast" becomes "Salon  Chromecast" in the sessions list.
        sessions = [{"Id": "s1", "DeviceName": "Salon  Chromecast", "Client": "Chromecast", "NowPlayingItem": {"Id": "id-V01"}, "PlayState": {"PlayMethod": "Transcode"}, "TranscodingInfo": {"TranscodeReasons": ["ContainerNotSupported"]}}]

        class Client:
            def sessions(self, token):
                return sessions

        driver = CastDriver(Client(), session=type("S", (), {"token": "t", "user_id": "u"})(), cast=None, controller=None, receiver_name="Salon - Chromecast", server_url="http://x", watch_seconds=1)
        found = driver.server_view({"Id": "id-V01"})
        self.assertIsNotNone(found)
        self.assertEqual(found.play_method, "Transcode")
        self.assertEqual(found.transcoding_reasons, ["ContainerNotSupported"])
        self.assertTrue(found.is_transcoding)


class RunTests(unittest.TestCase):
    def test_run_stops_receiver_after_each_case(self):
        driver = FakeDriver(failures={("V02", "play"): SenderTimeout("playing")})
        rows = run([case(id="V01"), case(id="V02"), case(id="MISSING")], "chromecast-gen3", driver)
        self.assertEqual(driver.stops, 2)
        self.assertEqual([r.verdict for r in rows], ["ok", "ko", "skipped"])
        self.assertIn("timed out waiting for playing", " ".join(rows[1].errors))

    def test_markdown_table_has_one_line_per_case(self):
        rows = [Row(case_id="V01", expected="DirectStream", observed_custom="DirectStream", observed_server="DirectPlay", startup_seconds=1.2, advanced_seconds=18.0, reasons=["ContainerNotSupported"], errors=[], verdict="ok", server_transcoding=False)]
        table = to_markdown(rows)
        self.assertIn("| V01 | DirectStream | DirectStream | DirectPlay | non | ContainerNotSupported | 1.2 | 18.0 |  | ok |", table)
        self.assertTrue(table.startswith("| cas | attendu |"))

    def test_a_direct_stream_meets_the_expectation_of_v03(self):
        # V03 used to expect DirectPlay, which the receiver never writes: the case could only fail.
        [v03] = load_cases(CASES, ids=["V03"])
        driver = FakeDriver(plays={"V03": played("DirectStream", "id-V03")}, views={"V03": view("DirectStream")})
        [row] = run([v03], "chromecast-gen3", driver)
        self.assertEqual(row.verdict, "ok", row.errors)

    def test_the_media_left_playing_is_not_this_case(self):
        # A receiver still on the previous media: its cached PLAYING, then IDLE as the load fails.
        driver = FakeDriver(plays={"V02": samples([status("PLAYING", 300, item="id-V01", play_session="ps-0"), ("IDLE", 0, {})])})
        [row] = run([case(id="V02", expect={})], "chromecast-gen3", driver)
        self.assertEqual(row.verdict, "ko")
        self.assertIsNone(row.startup_seconds)

    def test_a_transcode_that_stalls_after_its_start_is_ko(self):
        stalled = samples([BEFORE, status("BUFFERING", 0, "Transcode", "id-V02"), status("PLAYING", 1, "Transcode", "id-V02"), *[status("BUFFERING", 1, "Transcode", "id-V02")] * 10])
        driver = FakeDriver(plays={"V02": stalled}, views={"V02": view("Transcode")})
        [row] = run([case(id="V02", expect={"chromecast-gen3": "Transcode"})], "chromecast-gen3", driver)
        self.assertEqual(row.verdict, "ko")

    def test_a_frozen_position_fails_the_case(self):
        driver = FakeDriver(plays={"V01": samples([BEFORE, *[status("PLAYING", 5)] * 11])})
        [row] = run([case()], "chromecast-gen3", driver)
        self.assertEqual(row.verdict, "ko")

    def test_a_case_without_its_server_session_is_never_ok(self):
        driver = FakeDriver(views={"V01": None})
        rows = run([case()], "chromecast-gen3", driver)
        self.assertNotEqual(rows[0].verdict, "ok")
        self.assertEqual(matrix.exit_code(rows), 1)

    def test_a_failing_case_does_not_end_the_run(self):
        driver = FakeDriver(failures={("V02", "server_view"): OSError("server away")})
        rows = run([case(id="V01"), case(id="V02"), case(id="V03")], "chromecast-gen3", driver)
        self.assertEqual([r.case_id for r in rows], ["V01", "V02", "V03"])
        self.assertEqual([r.verdict for r in rows], ["ok", "ko", "ok"])
        self.assertIn("OSError: server away", rows[1].errors)
        self.assertEqual(driver.stops, 3)

    def test_an_item_lookup_error_is_a_row(self):
        driver = FakeDriver(failures={("V01", "resolve"): JellyfinHttpError(502, "/Items")})
        rows = run([case(id="V01"), case(id="V03")], "chromecast-gen3", driver)
        self.assertEqual([r.verdict for r in rows], ["ko", "ok"])
        self.assertEqual(rows[0].errors, ["JellyfinHttpError: HTTP 502 on /Items"])
        self.assertEqual(driver.sent, ["V03"])

    def test_nothing_played_is_its_own_exit_code(self):
        skipped = run([case(id="MISSING")], "chromecast-gen3", FakeDriver())
        self.assertEqual(matrix.exit_code(skipped), matrix.EXIT_NOTHING_PLAYED)
        self.assertNotEqual(matrix.EXIT_NOTHING_PLAYED, 0)
        mixed = run([case(id="MISSING"), case(id="V01")], "chromecast-gen3", FakeDriver())
        self.assertEqual(matrix.exit_code(mixed), 0)


class RunRobustnessTests(unittest.TestCase):
    def test_run_stops_the_receiver_even_when_observation_fails(self):
        class Driver:
            stopped = 0

            def resolve(self, case):
                return {"Id": "1"}

            def play(self, item, case):
                return []

            def server_view(self, item):
                raise OSError("server away")

            def bus_since_play(self):
                return []

            def stop(self):
                self.stopped += 1

        driver = Driver()
        [row] = run([case(id="V01")], "chromecast-gen3", driver)
        self.assertEqual(driver.stopped, 1)
        self.assertEqual(row.verdict, "ko")
        self.assertIn("OSError: server away", row.errors)

    def test_ctrl_c_still_stops_the_receiver(self):
        driver = FakeDriver(failures={("V01", "play"): KeyboardInterrupt()})
        rows = []
        with self.assertRaises(KeyboardInterrupt):
            run([case(id="V00"), case(id="V01"), case(id="V02")], "chromecast-gen3", driver, rows)
        self.assertEqual(driver.stops, 2)
        self.assertEqual([r.case_id for r in rows], ["V00"])


def report_rows(run_result) -> list[dict]:
    [report] = run_result.reports(".json")
    steps = json.loads(report.read_text())["steps"]
    return next((step["data"]["rows"] for step in steps if step["step"] == "rows"), [])


class MatrixMainTests(unittest.TestCase):
    def main(self, driver: FakeDriver, *args: str, receiver: FakeReceiver | None = None):
        server = FakeServer()
        receiver = receiver or FakeReceiver()
        argv = ["--server", "beta13", "--target", "Living room", *args]
        context = bench_run(server, receiver)
        run_result = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)
        with mock.patch.object(matrix, "CastDriver", lambda *_args, **_kwargs: driver):
            try:
                code = matrix.main(argv)
            except KeyboardInterrupt:
                code = None
        self.assertEqual(server.live, [])
        return code, run_result

    def test_a_failing_case_leaves_the_measured_ones_in_the_report(self):
        driver = FakeDriver(failures={("V03", "server_view"): OSError("server away")})
        code, result = self.main(driver, "--cases", "V01,V03,V02")
        rows = report_rows(result)
        self.assertEqual(code, 1)
        self.assertEqual([row["case_id"] for row in rows], ["V01", "V03", "V02"])
        self.assertEqual([row["verdict"] for row in rows], ["ok", "ko", "ok"])

    def test_ctrl_c_saves_the_rows_measured_so_far(self):
        driver = FakeDriver(failures={("V03", "play"): KeyboardInterrupt()})
        code, result = self.main(driver, "--cases", "V01,V03,V02")
        self.assertIsNone(code)
        self.assertEqual([row["case_id"] for row in report_rows(result)], ["V01"])
        self.assertEqual(driver.stops, 2)

    def test_a_running_receiver_is_restarted_before_measuring(self):
        receiver = FakeReceiver(app_id=RECEIVER_APP_ID)
        code, _ = self.main(FakeDriver(), "--cases", "V01", receiver=receiver)
        self.assertEqual(code, 0)
        self.assertEqual(receiver.events[:2], ["quit", "start"])

    def test_nothing_played_does_not_pass(self):
        # A server without the lab's tags: every case is skipped, and the run proved nothing.
        code, _ = self.main(FakeDriver(missing={"V01", "V03"}), "--cases", "V01,V03")
        self.assertNotEqual(code, 0)
        self.assertEqual(code, matrix.EXIT_NOTHING_PLAYED)

    def test_the_table_reaches_the_published_copy_as_a_table(self):
        code, result = self.main(FakeDriver(), "--cases", "V01,V03")
        markdown = result.report_text()
        self.assertEqual(code, 0)
        self.assertIn("\n| cas | attendu |", markdown)
        self.assertIn("\n| V03 | DirectStream |", markdown)
        self.assertNotIn('"markdown"', markdown)


if __name__ == "__main__":
    unittest.main()
