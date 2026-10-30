"""The repository files the bench depends on: what git and Biome leave alone, and `make e2e`."""

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]


def git_ignored_e2e_paths() -> list[str]:
    lines = (REPO / ".gitignore").read_text().splitlines()
    return [line.strip().rstrip("/") for line in lines if line.strip().startswith("e2e/")]


def biome_exclusions() -> set[str]:
    includes = json.loads((REPO / "biome.json").read_text())["files"]["includes"]
    return {entry[1:].rstrip("/") for entry in includes if entry.startswith("!")}


class IgnoreTests(unittest.TestCase):
    def test_every_e2e_path_git_ignores_is_kept_from_biome(self):
        # Biome read config.local.json: a password on a long line failed `bun run check` with the
        # password printed in the diff, and `bun run lint` rewrote the file.
        excluded = biome_exclusions()
        for path in git_ignored_e2e_paths():
            with self.subTest(path=path):
                self.assertIn(path, excluded)

    def test_private_files_and_old_syncplay_state_stay_out_of_git(self):
        if shutil.which("git") is None or not (REPO / ".git").exists():
            self.skipTest("not a git checkout")
        paths = (
            "e2e/bench/config.local.json",
            "e2e/bench/receiver-tokens.local.json",
            # The SyncPlay suite ran from e2e/syncplay/ before it moved: its leftovers stay ignored.
            "e2e/syncplay/.state/config/data/jellyfin.db",
            "e2e/syncplay/artifacts/controller-integration.json",
        )
        for path in paths:
            with self.subTest(path=path):
                result = subprocess.run(["git", "-C", str(REPO), "check-ignore", "--no-index", "-q", path], check=False)
                self.assertEqual(result.returncode, 0, f"{path} is not ignored by git")


class MakeTests(unittest.TestCase):
    def setUp(self):
        if shutil.which("make") is None:
            self.skipTest("make is not installed")

    def recipe(self) -> list[str]:
        result = subprocess.run(["make", "-n", "-C", str(REPO), "--no-print-directory", "e2e"], capture_output=True, text=True, check=False)
        return [line for line in result.stdout.splitlines() if line.strip()]

    def test_make_e2e_runs_its_recipe_although_an_e2e_folder_exists(self):
        lines = self.recipe()
        self.assertTrue(any("maestro.py" in line for line in lines), lines)

    def test_the_device_guard_accepts_several_devices_and_refuses_none(self):
        # adb get-state fails with "more than one device/emulator" as soon as two are attached.
        guard = self.recipe()[0]
        listings = {
            "List of devices attached\nemulator-5554\tdevice\nR58M12ABCDE\tdevice\n\n": 0,
            "List of devices attached\nemulator-5554\tdevice\n\n": 0,
            "List of devices attached\n0A1B2C3D\toffline\n9Z8Y7X6W\tunauthorized\n\n": 1,
            "List of devices attached\n\n": 1,
        }
        for listing, expected in listings.items():
            with self.subTest(listing=listing), tempfile.TemporaryDirectory() as tmp:
                adb = Path(tmp) / "adb"
                devices = len([line for line in listing.splitlines()[1:] if line.endswith("\tdevice")])
                adb.write_text(
                    "#!/bin/sh\n"
                    f'if [ "$1" = devices ]; then printf "%b" "{listing.encode("unicode_escape").decode()}"; exit 0; fi\n'
                    f'if [ {devices} -gt 1 ]; then echo "error: more than one device/emulator" >&2; exit 1; fi\n'
                    f'[ {devices} -eq 1 ] && echo device && exit 0\n'
                    "exit 1\n"
                )
                adb.chmod(0o755)
                env = {**os.environ, "PATH": f"{tmp}{os.pathsep}{os.environ.get('PATH', '')}"}
                result = subprocess.run(["sh", "-c", guard], env=env, capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
