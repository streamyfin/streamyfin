import json
import os
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

    def test_environment_variable_selects_the_file(self):
        with mock.patch.dict(os.environ, {"E2E_BENCH_CONFIG": str(EXAMPLE)}):
            config = load_config()
        self.assertIn("beta13", config.servers)


if __name__ == "__main__":
    unittest.main()
