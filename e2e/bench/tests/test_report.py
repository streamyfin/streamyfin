import json
import os
import re
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

from bench import report as report_module
from bench.report import Report, redact_text


class RedactTests(unittest.TestCase):
    def test_redacts_tokens_and_hosts(self):
        text = (
            'accessToken: "abc123" X-Emby-Token: def456 url=http://beta.example.test:8096/x?api_key=ghi789 '
            'MediaBrowser Token="jkl012" "Pw": "secret" host beta.example.test again'
        )
        result = redact_text(text, ["beta.example.test"])
        for secret in ("abc123", "def456", "ghi789", "jkl012", "secret", "beta.example.test"):
            self.assertNotIn(secret, result)
        self.assertIn("[masqué]", result)

    def test_masks_the_longer_host_whatever_the_configured_order(self):
        result = redact_text("beta.example.test and example.test", ["example.test", "beta.example.test"])
        self.assertEqual(result, "[masqué] and [masqué]")

    def test_leaves_ordinary_text_alone(self):
        self.assertEqual(redact_text("playMethod DirectPlay at 12.5 s", []), "playMethod DirectPlay at 12.5 s")


class ReportTests(unittest.TestCase):
    def test_markdown_is_redacted_json_is_raw(self):
        report = Report("matrix", redact=["beta.example.test"])
        report.add("play", url="http://beta.example.test:8096", accessToken="abc123")
        with tempfile.TemporaryDirectory() as tmp:
            paths = report.save(Path(tmp))
            raw = json.loads(paths.json.read_text())
            markdown = paths.markdown.read_text()
        self.assertEqual(raw["steps"][0]["data"]["accessToken"], "abc123")
        self.assertNotIn("abc123", markdown)
        self.assertNotIn("beta.example.test", markdown)

    def test_paths_follow_date_layout(self):
        report = Report("sessions-x")
        with tempfile.TemporaryDirectory() as tmp:
            paths = report.save(Path(tmp))
            relative = paths.markdown.relative_to(tmp).as_posix()
        self.assertRegex(relative, r"^\d{4}-\d{2}-\d{2}/sessions-x-\d{6}-[0-9a-f]{4}\.md$")
        self.assertEqual(paths.json.suffix, ".json")
        self.assertEqual(paths.json.stem, paths.markdown.stem)

    def test_keep_copies_markdown_only(self):
        report = Report("proof", redact=["beta.example.test"])
        report.add("step", note="server beta.example.test answered")
        with tempfile.TemporaryDirectory() as tmp:
            report.save(Path(tmp) / "reports")
            kept = report.keep("projet-0", Path(tmp) / "keep")
            files = sorted(p.name for p in (Path(tmp) / "keep" / "projet-0").iterdir())
            kept_text = kept.read_text()
        self.assertEqual(kept.suffix, ".md")
        self.assertTrue(all(name.endswith(".md") for name in files))
        self.assertNotIn("beta.example.test", kept_text)
        self.assertRegex(kept.name, r"^\d{4}-\d{2}-\d{2}-proof-\d{6}-[0-9a-f]{4}\.md$")

    def test_two_runs_in_the_same_minute_keep_their_own_report(self):
        # An observation before a pause and one after it, a few seconds apart and under the
        # default label, used to land on one name: the second replaced the first.
        with tempfile.TemporaryDirectory() as tmp:
            first = Report("sessions-snapshot")
            first.add("observation", paused=False)
            second = Report("sessions-snapshot")
            second.add("observation", paused=True)
            second.created_at = first.created_at
            first_paths = first.save(Path(tmp))
            second_paths = second.save(Path(tmp))
            self.assertNotEqual(first_paths.markdown, second_paths.markdown)
            self.assertNotEqual(first_paths.json, second_paths.json)
            self.assertIn('"paused": false', first_paths.markdown.read_text())
            self.assertIn('"paused": true', second_paths.markdown.read_text())

    def test_kept_copies_of_two_days_do_not_replace_each_other(self):
        with tempfile.TemporaryDirectory() as tmp:
            kept = []
            for day in (1, 2):
                report = Report("matrix")
                report.created_at = datetime(2026, 10, day, 12, 0, 30, tzinfo=timezone.utc)
                report.add("day", day=day)
                report.save(Path(tmp) / "reports")
                kept.append(report.keep("projet-0", Path(tmp) / "keep"))
            files = sorted(p.name for p in (Path(tmp) / "keep" / "projet-0").iterdir())
            self.assertEqual(len(files), 2)
            self.assertIn('"day": 1', kept[0].read_text())
            self.assertIn('"day": 2', kept[1].read_text())
        self.assertTrue(kept[0].name.startswith("2026-10-01-"))
        self.assertTrue(kept[1].name.startswith("2026-10-02-"))

    def test_keeping_twice_never_replaces_the_first_copy(self):
        report = Report("proof")
        with tempfile.TemporaryDirectory() as tmp:
            report.save(Path(tmp) / "reports")
            first = report.keep("projet-0", Path(tmp) / "keep")
            second = report.keep("projet-0", Path(tmp) / "keep")
            self.assertNotEqual(first, second)
            self.assertTrue(first.exists())
            self.assertTrue(second.exists())

    def test_markdown_section_is_published_as_written(self):
        # The matrix table used to reach the published copy as one escaped JSON string.
        report = Report("matrix", redact=["beta.example.test"])
        table = "| cas | verdict |\n| --- | --- |\n| V01 | ok |"
        report.add_markdown("table", table)
        markdown = report.to_markdown()
        self.assertIn(f"\n{table}\n", markdown)
        self.assertNotIn('"markdown"', markdown)
        self.assertNotIn("\\n", markdown)

    def test_markdown_section_is_redacted_too(self):
        report = Report("matrix", redact=["beta.example.test"])
        report.add_markdown("table", "| server | beta.example.test |")
        self.assertNotIn("beta.example.test", report.to_markdown())


class ReportFolderTests(unittest.TestCase):
    def test_default_folder_is_the_bench_reports_folder(self):
        # Relative to the working directory, a run started from e2e/ wrote to e2e/e2e/reports,
        # which neither git nor Biome ignores.
        folder = report_module.REPORTS_DIR
        self.assertTrue(folder.is_absolute())
        self.assertEqual(folder.parts[-2:], ("e2e", "reports"))
        self.assertEqual(folder, Path(__file__).resolve().parents[2] / "reports")

    def test_save_without_a_folder_ignores_the_working_directory(self):
        previous = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(report_module, "REPORTS_DIR", Path(tmp) / "bench-reports"):
            os.chdir(tmp)
            try:
                paths = Report("sessions-x").save()
            finally:
                os.chdir(previous)
            self.assertEqual(paths.markdown.parents[1], Path(tmp) / "bench-reports")
            self.assertFalse((Path(tmp) / "e2e").exists())

    def test_save_before_add_still_writes_a_header(self):
        report = Report("empty")
        with tempfile.TemporaryDirectory() as tmp:
            markdown = report.save(Path(tmp)).markdown.read_text()
        self.assertTrue(markdown.startswith("# empty"))


if __name__ == "__main__":
    unittest.main()
