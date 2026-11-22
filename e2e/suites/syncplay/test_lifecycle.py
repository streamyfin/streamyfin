"""Setup, teardown and the Maestro env must stay inside this checkout's own instance."""

import contextlib
import io
import json
import os
from pathlib import Path
from subprocess import CompletedProcess
from tempfile import TemporaryDirectory
import unittest
from unittest import mock

from suites.syncplay import maestro_env, setup, teardown


def inspected(label, returncode=0):
    return CompletedProcess([], returncode, stdout=label + "\n")


class IdentityTest(unittest.TestCase):
    def test_saved_identity_replaces_retyped_variables(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("SYNCPLAY_PROJECT=mine\nSYNCPLAY_CONTAINER=mine-jf\nSYNCPLAY_PORT=18117\n")
            with mock.patch.object(setup, "ENV_FILE", env_file), mock.patch.dict(os.environ, {}, clear=True):
                self.assertEqual(setup.identity()["SYNCPLAY_CONTAINER"], "mine-jf")
                self.assertEqual(setup.identity()["SYNCPLAY_PORT"], "18117")

    def test_a_variable_that_disagrees_with_the_saved_identity_is_refused(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("SYNCPLAY_PORT=18117\n")
            with mock.patch.object(setup, "ENV_FILE", env_file), mock.patch.dict(os.environ, {"SYNCPLAY_PORT": "18096"}):
                with self.assertRaisesRegex(RuntimeError, "conflicts"):
                    setup.identity()

    def test_a_container_started_by_another_checkout_is_refused(self):
        with mock.patch.object(setup.subprocess, "run", return_value=inspected("/elsewhere/compose.yml")):
            with self.assertRaisesRegex(RuntimeError, "not this checkout"):
                setup.refuse_foreign_container("streamyfin-syncplay-e2e-jellyfin")

    def test_an_own_or_missing_container_is_accepted(self):
        with mock.patch.object(setup.subprocess, "run", return_value=inspected(str((setup.ROOT / "compose.yml").resolve()))):
            setup.refuse_foreign_container("mine")
        with mock.patch.object(setup.subprocess, "run", return_value=inspected("", returncode=1)):
            setup.refuse_foreign_container("mine")


class TeardownTest(unittest.TestCase):
    def run_teardown(self, root, owner):
        calls = []

        def run(command, **kwargs):
            calls.append((command, kwargs))
            return inspected(owner or str((root / "compose.yml").resolve()))

        with (
            mock.patch.object(setup, "ROOT", root),
            mock.patch.object(setup, "STATE", root / ".state"),
            mock.patch.object(setup, "ENV_FILE", root / ".env"),
            mock.patch.object(setup.subprocess, "run", side_effect=run),
            mock.patch.dict(os.environ, {}, clear=True),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            try:
                teardown.teardown()
            finally:
                self.calls = calls

    def test_removes_the_container_and_every_local_file(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".state" / "config").mkdir(parents=True)
            (root / "artifacts").mkdir()
            (root / ".env").write_text("SYNCPLAY_PROJECT=mine\n")
            self.run_teardown(root, None)
            down = [(command, kwargs) for command, kwargs in self.calls if "down" in command]
            self.assertEqual(len(down), 1)
            self.assertEqual(down[0][1]["env"]["SYNCPLAY_PROJECT"], "mine")
            for leftover in (".state", "artifacts", ".env"):
                self.assertFalse((root / leftover).exists())

    def test_leaves_another_checkouts_container_and_files_alone(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".state").mkdir()
            with self.assertRaises(RuntimeError):
                self.run_teardown(root, "/elsewhere/compose.yml")
            self.assertFalse([command for command, _ in self.calls if "down" in command])
            self.assertTrue((root / ".state").exists())


class MaestroEnvTest(unittest.TestCase):
    def test_reads_the_sign_in_from_this_instances_credentials(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "credentials.json").write_text(json.dumps({
                "url": "http://127.0.0.1:18117", "password": "pw",
                "host": {"name": "syncplay-host"}, "guest": {"name": "syncplay-guest"},
            }))
            with mock.patch.object(setup, "STATE", state):
                env = maestro_env.maestro_env()
        self.assertEqual(env["SERVER_URL"], "http://127.0.0.1:18117")
        self.assertEqual(env["ANDROID_SERVER_URL"], "http://10.0.2.2:18117")
        self.assertEqual((env["USERNAME"], env["GUEST_USERNAME"], env["PASSWORD"]), ("syncplay-host", "syncplay-guest", "pw"))


if __name__ == "__main__":
    unittest.main()
