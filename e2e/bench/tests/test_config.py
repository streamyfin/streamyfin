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

    def test_environment_variable_selects_the_file(self):
        with mock.patch.dict(os.environ, {"E2E_BENCH_CONFIG": str(EXAMPLE)}):
            config = load_config()
        self.assertIn("beta13", config.servers)


if __name__ == "__main__":
    unittest.main()
