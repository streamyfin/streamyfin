"""The repository files the bench depends on: what git and Biome leave alone, and `make e2e`."""

import json
import shutil
import subprocess
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
            "e2e/bench/staging.local.json",
            "e2e/bench/receiver-tokens.local.json",
            # The token store's lock and the file it writes before replacing the old one.
            "e2e/bench/receiver-tokens.local.lock",
            "e2e/bench/receiver-tokens.local.k2j4x9.tmp",
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

    def recipe(self, *variables: str) -> list[str]:
        result = subprocess.run(["make", "-n", "-C", str(REPO), "--no-print-directory", "e2e", *variables], capture_output=True, text=True, check=False)
        return [line for line in result.stdout.splitlines() if line.strip()]

    def test_make_e2e_runs_its_recipe_although_an_e2e_folder_exists(self):
        lines = self.recipe()
        self.assertTrue(any("maestro.py" in line for line in lines), lines)

    def test_maestro_py_picks_the_device_unless_device_names_one(self):
        # A phone used to pass the guard, and the smoke flow cleared its app data; several devices
        # left the choice to Maestro. maestro.py now picks the one emulator or simulator.
        [run] = [line for line in self.recipe() if "maestro.py" in line]
        self.assertNotIn("--device", run)
        [run] = [line for line in self.recipe("DEVICE=R58M12ABCDE") if "maestro.py" in line]
        self.assertIn('--device "R58M12ABCDE"', run)


if __name__ == "__main__":
    unittest.main()
