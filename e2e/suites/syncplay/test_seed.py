"""The opt-in catalog must be visible to clients without altering SyncPlay fixtures."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest import mock

from suites.syncplay import seed, setup


class MovieSeedTest(unittest.TestCase):
    def test_seed_adds_a_browseable_movie_and_does_not_rescan_on_rerun(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "credentials.json").write_text(json.dumps({"url": setup.URL}))
            calls = []
            folders = []
            items = []

            def api(path, method="GET", data=None, token=None):
                calls.append((path, method, data))
                if path == "/Users/AuthenticateByName":
                    return {"AccessToken": "local", "User": {"Id": "host"}}
                if path == "/Library/VirtualFolders":
                    return folders
                if path.startswith("/Library/VirtualFolders?"):
                    folders.append({
                        "Name": "Maestro Movies", "Locations": ["/catalog/movies"],
                        "CollectionType": "movies", "ItemId": "movies",
                    })
                    return None
                if path.startswith("/Users/host/Items?"):
                    return {"Items": items}
                if path == "/Library/Refresh":
                    items.append({"Name": "Maestro Movie", "Type": "Movie"})
                    return None
                raise AssertionError(path)

            def ffmpeg(command, check):
                Path(command[-1]).write_bytes(b"generated video")

            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "api", side_effect=api),
                mock.patch.object(seed.subprocess, "run", side_effect=ffmpeg),
            ):
                seed.seed()
                nfo = state / "catalog/movies/Maestro Movie/movie.nfo"
                self.assertIn("<title>Maestro Movie</title>", nfo.read_text())
                self.assertEqual(len(items), 1)
                self.assertEqual(len([c for c in calls if c[0] == "/Library/Refresh"]), 1)
                seed.seed()
                self.assertEqual(len([c for c in calls if c[0] == "/Library/Refresh"]), 1)
                self.assertEqual(len([c for c in calls if c[0].startswith("/Library/VirtualFolders?")]), 1)
                items.clear()
                seed.seed()
                self.assertEqual(len([c for c in calls if c[0] == "/Library/Refresh"]), 2)

    def test_setup_scopes_syncplay_credentials_to_the_original_library(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            calls = []

            def api(path, method="GET", data=None, token=None):
                calls.append(path)
                if path == "/System/Info/Public":
                    return {"StartupWizardCompleted": True, "Version": "10.11.11"}
                if path == "/Users/AuthenticateByName":
                    return {"AccessToken": "local", "User": {"Id": "host", "Name": "syncplay-host"}}
                if path == "/Users":
                    return [{"Id": "guest", "Name": "syncplay-guest"}]
                if path == "/Library/VirtualFolders":
                    return [{"Name": "SyncPlay Fixtures", "ItemId": "fixture"}]
                if path.startswith("/Users/host/Items?"):
                    return {"Items": [
                        {"Name": f"SyncPlay Clip {number}", "Id": str(number), "RunTimeTicks": 1200000000}
                        for number in range(1, 4)
                    ]}
                if path == "/Library/Refresh" or path.startswith("/Users/") and path.endswith("/Policy"):
                    return None
                raise AssertionError(path)

            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "generate_media"),
                mock.patch.object(setup, "wait_for_server", return_value={"StartupWizardCompleted": True, "Version": "10.11.11"}),
                mock.patch.object(setup, "api", side_effect=api),
                mock.patch.object(setup.subprocess, "run"),
            ):
                setup.main()
            item_paths = [path for path in calls if path.startswith("/Users/host/Items?")]
            self.assertEqual(len(item_paths), 1)
            self.assertIn("ParentId=fixture", item_paths[0])


if __name__ == "__main__":
    unittest.main()
