import argparse
import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock
from urllib.error import URLError

from bench.sessions import SessionView, check, skew_seconds, snapshot
from bench.tests.fakes import FakeServer, bench_run

OBSERVE = Path(__file__).resolve().parents[2] / "suites" / "syncplay" / "observe.py"


def raw_session(**overrides):
    session = {
        "Id": "s1",
        "DeviceName": "Salon",
        "Client": "Chromecast",
        "UserName": "test",
        "LastActivityDate": "2026-10-28T00:00:00.0000000Z",
        "NowPlayingItem": {"Id": "item-a", "Name": "H.264 8 bits 1080p"},
        "PlayState": {"PositionTicks": 1234560000, "IsPaused": True, "PlayMethod": "Transcode"},
        "TranscodingInfo": {"TranscodeReasons": ["VideoCodecNotSupported"]},
        "SyncPlayGroupId": None,
    }
    session.update(overrides)
    return session


def view(**overrides) -> SessionView:
    base = SessionView(
        id="s1", device="Salon", client="Chromecast", user="test", item_id="item-a", item_name="x",
        position_seconds=10.0, is_paused=True, play_method="DirectPlay", transcoding_reasons=[],
        last_activity=None, group_id=None,
    )
    for key, value in overrides.items():
        setattr(base, key, value)
    return base


class SnapshotTests(unittest.TestCase):
    def test_snapshot_reads_play_state_and_transcoding(self):
        [result] = snapshot([raw_session()])
        self.assertEqual(result.item_id, "item-a")
        self.assertAlmostEqual(result.position_seconds, 123.456)
        self.assertTrue(result.is_paused)
        self.assertEqual(result.play_method, "Transcode")
        self.assertEqual(result.transcoding_reasons, ["VideoCodecNotSupported"])
        self.assertEqual(result.last_activity, datetime(2026, 10, 28, tzinfo=timezone.utc))

    def test_snapshot_filters_by_device(self):
        sessions = [raw_session(Id="s1", DeviceName="Salon"), raw_session(Id="s2", DeviceName="Cuisine")]
        self.assertEqual([s.id for s in snapshot(sessions, device="Cuisine")], ["s2"])

    def test_snapshot_keeps_idle_sessions_without_item(self):
        [result] = snapshot([raw_session(NowPlayingItem=None, PlayState={})])
        self.assertIsNone(result.item_id)
        self.assertIsNone(result.position_seconds)

    def test_snapshot_finds_a_receiver_under_the_name_it_registered(self):
        # The receiver strips the punctuation of the name it is sent: "Salon - Chromecast" plays
        # as "Salon Chromecast" or "Salon  Chromecast" in the sessions list.
        for recorded in ("Salon Chromecast", "Salon  Chromecast"):
            with self.subTest(recorded=recorded):
                [found] = snapshot([raw_session(DeviceName=recorded)], device="Salon - Chromecast")
                self.assertEqual(found.device, recorded)
        self.assertEqual(snapshot([raw_session(DeviceName="Cuisine")], device="Salon - Chromecast"), [])

    def test_snapshot_keeps_every_device_asked_for(self):
        sessions = [raw_session(Id="s1", DeviceName="Salon"), raw_session(Id="s2", DeviceName="Cuisine"), raw_session(Id="s3", DeviceName="Bureau")]
        self.assertEqual([s.id for s in snapshot(sessions, device=["Salon", "Bureau"])], ["s1", "s3"])

    def test_snapshot_tells_a_transcoding_job_from_the_reported_play_method(self):
        [transcoding] = snapshot([raw_session()])
        [direct] = snapshot([raw_session(TranscodingInfo=None, PlayState={"PositionTicks": 0, "IsPaused": False, "PlayMethod": "DirectPlay"})])
        self.assertTrue(transcoding.is_transcoding)
        self.assertFalse(direct.is_transcoding)


class ScriptTests(unittest.TestCase):
    def test_runs_as_a_script_from_the_repository_root(self):
        import os
        import subprocess
        import sys
        from pathlib import Path

        script = Path(__file__).resolve().parents[1] / "sessions.py"
        env = {**os.environ, "E2E_BENCH_CONFIG": "/nonexistent/bench.json"}
        result = subprocess.run([sys.executable, str(script), "--server", "beta13"], capture_output=True, text=True, env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("bench configuration not found", result.stderr)


class CheckTests(unittest.TestCase):
    def test_check_reports_wrong_item(self):
        failures = check([view(item_id="item-b")], expect_item="item-a")
        self.assertEqual(len(failures), 1)
        self.assertIn("item-a", failures[0])

    def test_check_reports_wrong_play_method(self):
        failures = check([view(play_method="DirectStream")], expect_play_method="DirectPlay")
        self.assertIn("DirectPlay", failures[0])

    def test_check_active_count(self):
        failures = check([view()], expect_active=2, expect_paused=True)
        self.assertTrue(any("2" in failure for failure in failures))

    def test_check_skew_only_between_paused_sessions(self):
        paused = [view(id="a", position_seconds=10.0), view(id="b", position_seconds=11.5)]
        self.assertAlmostEqual(skew_seconds(paused), 1.5)
        self.assertEqual(check(paused, expect_active=2, max_skew_seconds=2), [])
        self.assertIn("paused", check([view(id="a"), view(id="b", is_paused=False)], expect_active=2, max_skew_seconds=2)[0])

    def test_check_members_from_groups(self):
        groups = [{"GroupId": "g", "Participants": ["a"]}]
        self.assertIn("members 1", check([], expect_active=0, expect_members=2, groups=groups)[0])
        self.assertEqual(check([], expect_active=0, expect_members=1, groups=groups), [])

    def test_joined_group_with_nothing_playing_passes(self):
        # The "joined" step of the SyncPlay README: both members are in the group and nothing plays
        # yet. The minimum of two active sessions failed it, and a plain snapshot as well.
        idle = [view(id="a", item_id=None, position_seconds=None, is_paused=None), view(id="b", item_id=None, position_seconds=None, is_paused=None)]
        groups = [{"GroupId": "g", "Participants": ["host", "guest"]}]
        self.assertEqual(check(idle, expect_active=2, expect_members=2, groups=groups), [])
        self.assertEqual(check(idle, expect_active=2), [])

    def test_active_count_still_backs_every_playback_assertion(self):
        for options in ({"expect_item": "item-a"}, {"expect_paused": True}, {"expect_play_method": "DirectPlay"}, {"max_skew_seconds": 2.0}):
            with self.subTest(**options):
                failures = check([view(item_id=None)], expect_active=1, **options)
                self.assertTrue(any("Active playback sessions 0" in failure for failure in failures))


class CheckOptionsTests(unittest.TestCase):
    def test_options_reach_check_under_its_own_names(self):
        from bench.sessions import add_check_arguments, check_options

        parser = argparse.ArgumentParser()
        add_check_arguments(parser, expect_active=2)
        args = parser.parse_args(["--expect-paused", "true", "--max-skew", "2", "--expect-members", "2"])
        options = check_options(args)
        self.assertEqual(
            options,
            {"expect_item": None, "expect_paused": True, "expect_play_method": None, "expect_active": 2, "max_skew_seconds": 2.0, "expect_members": 2},
        )
        self.assertEqual(check([view(id="a"), view(id="b")], **options, groups=[{"Participants": ["a", "b"]}]), [])


def ui_session(device: str, item: dict | None = None, user: str = "syncplay-host") -> dict:
    return raw_session(Id=device, DeviceName=device, Client="Jellyfin Web", UserName=user, NowPlayingItem=item, PlayState={} if item is None else {"PositionTicks": 0, "IsPaused": True})


class ObserveTests(unittest.TestCase):
    def load_observe(self):
        spec = importlib.util.spec_from_file_location("syncplay_observe", OBSERVE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_joined_step_passes_with_two_members_and_nothing_playing(self):
        observe = self.load_observe()
        server = FakeServer(sessions=[ui_session("host"), ui_session("guest")], groups=[{"GroupId": "g", "Participants": ["host", "guest"]}])
        token = server.client("http://127.0.0.1:18096").authenticate(None).token
        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / ".state"
            state.mkdir()
            (state / "credentials.json").write_text(json.dumps({"url": "http://127.0.0.1:18096", "serverVersion": "10.11.11", "host": {"token": token}}))
            argv = ["observe.py", "--label", "joined", "--expect-members", "2"]
            with mock.patch.object(observe, "ROOT", Path(tmp)), mock.patch.object(observe, "JellyfinClient", server.client), mock.patch.object(sys, "argv", argv), mock.patch("sys.stdout"):
                code = observe.main()
            [observation] = json.loads((Path(tmp) / "artifacts" / "observations.json").read_text())
        self.assertEqual(observation["failures"], [])
        self.assertEqual(code, 0)


class MainTests(unittest.TestCase):
    def test_observation_survives_a_failed_sign_out(self):
        server = FakeServer(sessions=[raw_session()], logout_error=URLError("server away"))
        with bench_run(server) as run:
            from bench.sessions import main

            code = main(["--server", "beta13", "--device", "Salon"])
            reports = run.reports()
            self.assertEqual(len(reports), 1)
            self.assertIn("item-a", reports[0].read_text())
        self.assertEqual(code, 0)
        self.assertIn('"failures": []', run.stdout.getvalue())
        self.assertIn("sign-out failed", run.stderr.getvalue())

    def test_published_copy_leaves_other_users_out(self):
        # The Markdown copy is the one quoted in issues: the other accounts of a shared server, their
        # devices and what they watch, stay out of it.
        sessions = [
            raw_session(Id="s1", UserName="test", DeviceName="Salon"),
            raw_session(Id="s2", UserName="alice", DeviceName="Alice phone", NowPlayingItem={"Id": "item-z", "Name": "Holiday film"}),
        ]
        with bench_run(FakeServer(sessions=sessions)) as run:
            from bench.sessions import main

            code = main(["--server", "beta13"])
            markdown = run.report_text()
        self.assertEqual(code, 0)
        for private in ("alice", "Alice phone", "Holiday film", "item-z"):
            self.assertNotIn(private, markdown)
        self.assertIn("Salon", markdown)
        self.assertIn('"otherSessions": 1', markdown)

    def test_named_devices_are_all_observed(self):
        sessions = [raw_session(Id="s1", DeviceName="Salon"), raw_session(Id="s2", DeviceName="Cuisine"), raw_session(Id="s3", DeviceName="Bureau")]
        with bench_run(FakeServer(sessions=sessions)) as run:
            from bench.sessions import main

            code = main(["--server", "beta13", "--device", "Salon", "--device", "Bureau", "--expect-active", "2", "--expect-paused", "true"])
            [report] = run.reports(".json")
            observation = json.loads(report.read_text())["steps"][0]["data"]
        self.assertEqual([s["device"] for s in observation["sessions"]], ["Salon", "Bureau"])
        self.assertEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
