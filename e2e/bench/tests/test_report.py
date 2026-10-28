import json
import re
import tempfile
import unittest
from pathlib import Path

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
        self.assertRegex(relative, r"^\d{4}-\d{2}-\d{2}/sessions-x-\d{4}\.md$")
        self.assertEqual(paths.json.suffix, ".json")

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
        self.assertTrue(re.match(r"proof-\d{4}\.md", kept.name))

    def test_save_before_add_still_writes_a_header(self):
        report = Report("empty")
        with tempfile.TemporaryDirectory() as tmp:
            markdown = report.save(Path(tmp)).markdown.read_text()
        self.assertTrue(markdown.startswith("# empty"))


if __name__ == "__main__":
    unittest.main()
