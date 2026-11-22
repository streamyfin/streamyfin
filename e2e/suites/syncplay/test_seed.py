"""The opt-in catalog must be visible to clients without altering SyncPlay fixtures."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from suites.syncplay import seed, setup


class MovieSeedTest(unittest.TestCase):
    def test_seed_adds_a_browseable_movie_and_does_not_rescan_on_rerun(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "credentials.json").write_text(json.dumps({"url": setup.URL}))
            calls = []
            folders = []
            items = {"movies": [], "shows": [], "music": []}

            def api(path, method="GET", data=None, token=None):
                calls.append((path, method, data))
                if path == "/Users/AuthenticateByName":
                    return {"AccessToken": "local", "User": {"Id": "host"}}
                if path == "/Library/VirtualFolders":
                    return folders
                if path.startswith("/Library/VirtualFolders?"):
                    query = parse_qs(urlsplit(path).query)
                    name = query["name"][0]
                    library_id = {"Maestro Movies": "movies", "Maestro Shows": "shows", "Maestro Music": "music"}[name]
                    folders.append({
                        "Name": name, "Locations": [f"/catalog/{library_id}"],
                        "CollectionType": "tvshows" if library_id == "shows" else library_id,
                        "ItemId": library_id,
                    })
                    return None
                if path.startswith("/Users/host/Items?"):
                    library_id = parse_qs(urlsplit(path).query)["ParentId"][0]
                    return {"Items": items[library_id]}
                if path == "/Library/Refresh":
                    items["movies"] = [{"Name": "Maestro Movie", "Type": "Movie"}]
                    items["shows"] = [
                        {"Name": "Maestro Show", "Type": "Series"},
                        {"Name": "Maestro Pilot", "Type": "Episode", "ParentIndexNumber": 1, "IndexNumber": 1},
                        {"Name": "Maestro Finale", "Type": "Episode", "ParentIndexNumber": 1, "IndexNumber": 2},
                    ]
                    items["music"] = [
                        {"Name": "Maestro Artist", "Type": "MusicArtist"},
                        {"Name": "Maestro Album", "Type": "MusicAlbum"},
                        {"Name": "Maestro Track One", "Type": "Audio"},
                        {"Name": "Maestro Track Two", "Type": "Audio"},
                    ]
                    return None
                raise AssertionError(path)

            commands = []

            def ffmpeg(command, check):
                commands.append(command)
                Path(command[-1]).write_bytes(b"generated video")

            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "api", side_effect=api),
                mock.patch.object(seed.subprocess, "run", side_effect=ffmpeg),
            ):
                seed.seed()
                nfo = state / "catalog/movies/Maestro Movie/movie.nfo"
                self.assertIn("<title>Maestro Movie</title>", nfo.read_text())
                show = state / "catalog/shows/Maestro Show"
                self.assertIn("<title>Maestro Show</title>", (show / "tvshow.nfo").read_text())
                for number, title in ((1, "Maestro Pilot"), (2, "Maestro Finale")):
                    episode = show / "Season 01" / f"{number:02d}_{title}.nfo"
                    self.assertIn(f"<title>{title}</title>", episode.read_text())
                    self.assertIn(f"<episode>{number}</episode>", episode.read_text())
                music = state / "catalog/music/Maestro Artist/Maestro Album"
                self.assertTrue((music / "01_Maestro Track One.flac").is_file())
                self.assertTrue((music / "02_Maestro Track Two.flac").is_file())
                self.assertTrue(any("-metadata" in cmd and "album=Maestro Album" in cmd for cmd in commands))
                self.assertEqual(len(items["movies"]), 1)
                self.assertEqual(len(items["shows"]), 3)
                self.assertEqual(len(items["music"]), 4)
                self.assertEqual(len([c for c in calls if c[0] == "/Library/Refresh"]), 1)
                self.assertEqual(len([c for c in calls if c[0].startswith("/Library/VirtualFolders?")]), 3)
                command_count = len(commands)
                seed.seed()
                self.assertEqual(len([c for c in calls if c[0] == "/Library/Refresh"]), 1)
                self.assertEqual(len(commands), command_count)
                self.assertEqual(len([c for c in calls if c[0].startswith("/Library/VirtualFolders?")]), 3)
                items["movies"].clear()
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
