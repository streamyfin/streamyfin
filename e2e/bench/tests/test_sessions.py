import unittest
from datetime import datetime, timezone

from bench.sessions import SessionView, check, skew_seconds, snapshot


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


if __name__ == "__main__":
    unittest.main()
