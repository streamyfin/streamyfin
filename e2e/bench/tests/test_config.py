import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from bench.config import Account, BenchConfigError, load_config

BENCH = Path(__file__).resolve().parents[1]
EXAMPLE = BENCH / "config.example.json"


def example_without(*keys: str) -> dict:
    data = json.loads(EXAMPLE.read_text())
    node = data
    for key in keys[:-1]:
        node = node[key]
    del node[keys[-1]]
    return data


class LoadConfigTests(unittest.TestCase):
    def test_example_file_loads(self):
        config = load_config(EXAMPLE)
        self.assertTrue(config.servers["beta13"].url.startswith("http"))
        self.assertIn("test", config.servers["beta13"].accounts)
        self.assertEqual(config.targets.chromecasts[0].kind, "chromecast-gen3")
        self.assertFalse(str(config.keep_dir).startswith("~"))

    def test_missing_file_names_the_example(self):
        with self.assertRaises(BenchConfigError) as caught:
            load_config(Path("/nonexistent/config.local.json"))
        self.assertIn("config.example.json", str(caught.exception))

    def test_missing_account_field_names_it(self):
        data = example_without("servers", "beta13", "accounts", "test", "password")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps(data))
            with self.assertRaises(BenchConfigError) as caught:
                load_config(path)
        self.assertIn("servers.beta13.accounts.test.password", str(caught.exception))
        self.assertIn(str(path), str(caught.exception))

    def test_password_never_in_repr(self):
        account = Account(username="alice", password="hunter2-secret")
        self.assertNotIn("hunter2-secret", repr(account))
        self.assertNotIn("hunter2-secret", str(account))
        self.assertIn("alice", repr(account))

    def test_redact_includes_every_server_host_and_target_address(self):
        # A report must never depend on someone remembering to list a private host by hand.
        config = load_config(EXAMPLE)
        self.assertIn("jellyfin-13.example.test", config.redact)
        self.assertIn("beta.example.test", config.redact)
        self.assertIn("192.0.2.10", config.redact)
        self.assertIn("example.test", config.redact)

    def test_unknown_server_profile_and_target_are_named(self):
        config = load_config(EXAMPLE)
        with self.assertRaises(BenchConfigError) as caught:
            config.server("nope")
        self.assertIn("beta13", str(caught.exception))
        with self.assertRaises(BenchConfigError) as caught:
            config.server("beta13").account("nobody")
        self.assertIn("standard", str(caught.exception))
        with self.assertRaises(BenchConfigError) as caught:
            config.chromecast("Garage")
        self.assertIn("Living room", str(caught.exception))
        self.assertEqual(config.chromecast("Living room").kind, "chromecast-gen3")

    def test_redact_must_be_a_list_of_strings(self):
        # A string used to be masked letter by letter, and null raised a TypeError that the
        # tools' BenchConfigError handlers let through.
        for value in ("example.test", None, ["example.test", 3]):
            data = json.loads(EXAMPLE.read_text())
            data["redact"] = value
            with self.subTest(redact=value), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "config.json"
                path.write_text(json.dumps(data))
                with self.assertRaises(BenchConfigError) as caught:
                    load_config(path)
                self.assertIn("field redact", str(caught.exception))
                self.assertIn(str(path), str(caught.exception))

    def test_redact_may_be_left_out(self):
        data = example_without("redact")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps(data))
            config = load_config(path)
        self.assertIn("beta.example.test", config.redact)

    def test_environment_variable_selects_the_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bench.json"
            shutil.copy(EXAMPLE, path)
            with mock.patch.dict(os.environ, {"E2E_BENCH_CONFIG": str(path)}):
                config = load_config()
        self.assertIn("beta13", config.servers)

    def test_server_url_must_be_http_or_https_with_a_host(self):
        # A bad address used to pass, then failed in urllib with no field to name.
        for url in ("", "beta.example.test", "ftp://beta.example.test", "https://", "https://[broken", "https://beta.example.test:port"):
            data = json.loads(EXAMPLE.read_text())
            data["servers"]["beta13"]["url"] = url
            with self.subTest(url=url), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "config.json"
                path.write_text(json.dumps(data))
                with self.assertRaises(BenchConfigError) as caught:
                    load_config(path)
                self.assertIn("servers.beta13.url", str(caught.exception))

    def test_cast_target_names_are_unique(self):
        # A target is selected by name: a second one under the same name could never be reached.
        data = json.loads(EXAMPLE.read_text())
        first = data["targets"]["chromecasts"][0]
        data["targets"]["chromecasts"].append({**first, "host": "192.0.2.99"})
        index = len(data["targets"]["chromecasts"]) - 1
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps(data))
            with self.assertRaises(BenchConfigError) as caught:
                load_config(path)
        self.assertIn(f"targets.chromecasts[{index}].name", str(caught.exception))


class CheckoutTests(unittest.TestCase):
    """E2E_BENCH_CONFIG may point anywhere: inside the checkout, a file git does not ignore would
    go into the next `git add` with its passwords, so the bench refuses it."""

    def setUp(self):
        if shutil.which("git") is None or not (BENCH.parents[1] / ".git").exists():
            self.skipTest("not a git checkout")

    def load_from(self, path: Path):
        with mock.patch.dict(os.environ, {"E2E_BENCH_CONFIG": str(path)}):
            return load_config()

    def scratch_copy(self, suffix: str) -> Path:
        handle, name = tempfile.mkstemp(dir=BENCH, prefix="bench-config-test-", suffix=suffix)
        os.close(handle)
        path = Path(name)
        self.addCleanup(path.unlink, missing_ok=True)
        shutil.copy(EXAMPLE, path)
        return path

    def test_a_file_git_would_commit_is_refused(self):
        for path in (self.scratch_copy(".json"), EXAMPLE):
            with self.subTest(path=path.name):
                with self.assertRaises(BenchConfigError) as caught:
                    self.load_from(path)
                self.assertIn("E2E_BENCH_CONFIG", str(caught.exception))
                self.assertIn(".local.json", str(caught.exception))

    def test_an_ignored_file_of_the_checkout_loads(self):
        self.assertIn("beta13", self.load_from(self.scratch_copy(".local.json")).servers)

    def test_a_git_that_cannot_start_refuses_the_file(self):
        # Only a missing git means no commit to fear: one that exists and fails to start cannot vouch.
        path = self.scratch_copy(".local.json")
        with mock.patch("bench.config.subprocess.run", side_effect=PermissionError(13, "Permission denied")):
            with self.assertRaises(BenchConfigError) as caught:
                self.load_from(path)
        self.assertIn("could not check", str(caught.exception))

    def test_a_git_that_fails_refuses_the_file(self):
        # Status 128 is a fatal error (a checkout git calls dubious for its owner, say), not an
        # ignored file: such a git cannot vouch for the passwords either.
        path = self.scratch_copy(".json")
        failed = subprocess.CompletedProcess(args=["git"], returncode=128, stdout=b"", stderr=b"fatal: detected dubious ownership")
        with mock.patch("bench.config.subprocess.run", return_value=failed):
            with self.assertRaises(BenchConfigError) as caught:
                self.load_from(path)
        self.assertIn("could not check", str(caught.exception))

    def test_without_git_a_file_of_the_checkout_loads(self):
        with mock.patch("bench.config.subprocess.run", side_effect=FileNotFoundError(2, "No such file or directory", "git")):
            self.assertIn("beta13", self.load_from(self.scratch_copy(".json")).servers)

    def test_a_git_that_does_not_answer_refuses_the_file(self):
        # A timeout read as "no git": a file git was never asked about loaded, passwords and all.
        import subprocess

        path = self.scratch_copy(".local.json")
        with mock.patch("bench.config.subprocess.run", side_effect=subprocess.TimeoutExpired("git", 10)):
            with self.assertRaises(BenchConfigError) as caught:
                self.load_from(path)
        self.assertIn("could not check", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
