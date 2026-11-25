"""The opt-in catalog must be visible to clients without altering SyncPlay fixtures."""

import json
from pathlib import Path
from subprocess import CompletedProcess
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from suites.syncplay import catalog_seed, seed, setup


class MovieSeedTest(unittest.TestCase):
    def test_seed_adds_a_browseable_movie_and_does_not_rescan_on_rerun(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            inventory_path = state / "inventory.json"
            inventory_path.write_text(json.dumps({"movies": [], "shows": [], "episodes": [], "tracks": []}))
            (state / "credentials.json").write_text(json.dumps({
                "url": setup.URL, "host": {"token": "stored-host-token", "userId": "host"},
            }))
            calls = []
            folders = []
            items = {"movies": [], "shows": [], "music": []}

            def api(path, method="GET", data=None, token=None):
                calls.append((path, method, data))
                if path == "/Users/AuthenticateByName":
                    raise AssertionError("seeding must not replace the observer's stored host token")
                if path == "/Library/VirtualFolders":
                    return folders
                if path.startswith("/Library/VirtualFolders?"):
                    query = parse_qs(urlsplit(path).query)
                    name = query["name"][0]
                    library_id = {"Movies": "movies", "Shows": "shows", "Music": "music"}[name]
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
                    items["movies"] = [{"Name": "Movie", "Type": "Movie"}]
                    items["shows"] = [
                        {"Name": "Show", "Type": "Series"},
                        {"Name": "Pilot", "Type": "Episode", "ParentIndexNumber": 1, "IndexNumber": 1},
                        {"Name": "Finale", "Type": "Episode", "ParentIndexNumber": 1, "IndexNumber": 2},
                    ]
                    items["music"] = [
                        {"Name": "Artist", "Type": "MusicArtist"},
                        {"Name": "Album", "Type": "MusicAlbum"},
                        {"Name": "Track One", "Type": "Audio"},
                        {"Name": "Track Two", "Type": "Audio"},
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
                mock.patch.object(catalog_seed.subprocess, "run", side_effect=ffmpeg),
            ):
                seed.seed(inventory_path=inventory_path)
                nfo = state / "catalog/movies/Movie/movie.nfo"
                self.assertIn("<title>Movie</title>", nfo.read_text())
                show = state / "catalog/shows/Show"
                self.assertIn("<title>Show</title>", (show / "tvshow.nfo").read_text())
                for number, title in ((1, "Pilot"), (2, "Finale")):
                    episode = show / "Season 01" / f"{number:02d}_{title}.nfo"
                    self.assertIn(f"<title>{title}</title>", episode.read_text())
                    self.assertIn(f"<episode>{number}</episode>", episode.read_text())
                music = state / "catalog/music/Artist/Album"
                self.assertTrue((music / "01_Track One.flac").is_file())
                self.assertTrue((music / "02_Track Two.flac").is_file())
                self.assertTrue(any("-metadata" in cmd and "album=Album" in cmd for cmd in commands))
                self.assertEqual(len(items["movies"]), 1)
                self.assertEqual(len(items["shows"]), 3)
                self.assertEqual(len(items["music"]), 4)
                self.assertEqual(len([c for c in calls if c[0] == "/Library/Refresh"]), 1)
                self.assertEqual(len([c for c in calls if c[0].startswith("/Library/VirtualFolders?")]), 3)
                command_count = len(commands)
                seed.seed(inventory_path=inventory_path)
                self.assertEqual(len([c for c in calls if c[0] == "/Library/Refresh"]), 1)
                self.assertEqual(len(commands), command_count)
                self.assertEqual(len([c for c in calls if c[0].startswith("/Library/VirtualFolders?")]), 3)
                items["movies"].clear()
                seed.seed(inventory_path=inventory_path)
                self.assertEqual(len([c for c in calls if c[0] == "/Library/Refresh"]), 2)

    def test_library_creation_disables_every_metadata_and_image_fetcher(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            inventory_path = state / "inventory.json"
            inventory_path.write_text(json.dumps({"movies": [], "shows": [], "episodes": [], "tracks": []}))
            (state / "credentials.json").write_text(json.dumps({
                "url": setup.URL, "host": {"token": "stored-host-token", "userId": "host"},
            }))
            folders = []
            posts = []
            expected_items = {spec["name"]: spec["expected"] for spec in seed.LIBRARIES}

            def api(path, method="GET", data=None, token=None):
                if path == "/Library/VirtualFolders":
                    return folders
                if path.startswith("/Library/VirtualFolders?"):
                    name = parse_qs(urlsplit(path).query)["name"][0]
                    posts.append((name, data))
                    spec = next(spec for spec in seed.LIBRARIES if spec["name"] == name)
                    folders.append({
                        "Name": name, "Locations": [spec["mount"]],
                        "CollectionType": spec["collectionType"], "ItemId": name,
                    })
                    return None
                if path.startswith("/Users/host/Items?"):
                    parent = parse_qs(urlsplit(path).query)["ParentId"][0]
                    return {"Items": expected_items[parent]}
                if path == "/Library/Refresh":
                    return None
                raise AssertionError(path)

            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "api", side_effect=api),
                mock.patch.object(seed, "catalog_files", return_value=False),
                mock.patch.object(catalog_seed, "generate", return_value=False),
            ):
                seed.seed(inventory_path=inventory_path)

            self.assertEqual([name for name, _ in posts], ["Movies", "Shows", "Music"])
            expected_types = {
                "Movies": {"Movie"},
                "Shows": {"Series", "Season", "Episode"},
                "Music": {"MusicArtist", "MusicAlbum", "Audio"},
            }
            for name, data in posts:
                options = {option["Type"]: option for option in data["LibraryOptions"]["TypeOptions"]}
                self.assertEqual(set(options), expected_types[name])
                for option in options.values():
                    self.assertEqual(option["MetadataFetchers"], [])
                    self.assertEqual(option["ImageFetchers"], [])

    def test_an_unready_library_names_the_unmatched_entries_and_their_observed_fields(self):
        # A checkout path Jellyfin parsed as S17E04 matched every count and no episode; the
        # report must name the field that differs, not only the counts.
        with TemporaryDirectory() as directory:
            state = Path(directory)
            inventory_path = state / "inventory.json"
            inventory_path.write_text(json.dumps({"movies": [], "shows": [], "episodes": [], "tracks": []}))
            (state / "credentials.json").write_text(json.dumps({
                "url": setup.URL, "host": {"token": "stored-host-token", "userId": "host"},
            }))
            expected_items = {spec["name"]: spec["expected"] for spec in seed.LIBRARIES}
            expected_items["Shows"] = [
                {"Name": "Show", "Type": "Series", "Id": "s"},
                {"Name": "Pilot", "Type": "Episode", "ParentIndexNumber": 17, "IndexNumber": 4, "Id": "p"},
                {"Name": "Finale", "Type": "Episode", "ParentIndexNumber": 17, "IndexNumber": 4, "Id": "f"},
            ]
            folders = [
                {"Name": spec["name"], "Locations": [spec["mount"]], "CollectionType": spec["collectionType"], "ItemId": spec["name"]}
                for spec in seed.LIBRARIES
            ]

            def api(path, method="GET", data=None, token=None):
                if path == "/Library/VirtualFolders":
                    return folders
                if path.startswith("/Users/host/Items?"):
                    return {"Items": expected_items[parse_qs(urlsplit(path).query)["ParentId"][0]]}
                if path == "/Library/Refresh":
                    return None
                raise AssertionError(path)

            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "api", side_effect=api),
                mock.patch.object(seed, "catalog_files", return_value=False),
                mock.patch.object(catalog_seed, "generate", return_value=False),
                mock.patch.object(seed.time, "sleep"),
            ):
                with self.assertRaises(RuntimeError) as raised:
                    seed.seed(inventory_path=inventory_path)
            report = str(raised.exception)
            self.assertNotIn("'Movies'", report)
            self.assertIn("'expected': 3, 'observed': 3", report)
            self.assertIn(
                "'unmatched': [{'Name': 'Pilot', 'Type': 'Episode', 'ParentIndexNumber': 1, 'IndexNumber': 1}, "
                "{'Name': 'Finale', 'Type': 'Episode', 'ParentIndexNumber': 1, 'IndexNumber': 2}]",
                report,
            )
            self.assertIn(
                "'candidates': [{'Name': 'Pilot', 'Type': 'Episode', 'ParentIndexNumber': 17, 'IndexNumber': 4}, "
                "{'Name': 'Finale', 'Type': 'Episode', 'ParentIndexNumber': 17, 'IndexNumber': 4}]",
                report,
            )

    def test_setup_scopes_syncplay_credentials_to_the_original_library(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            calls = []
            auth_devices = []

            def api(path, method="GET", data=None, token=None, device_id=None):
                calls.append(path)
                if path == "/System/Info/Public":
                    return {"StartupWizardCompleted": True, "Version": "10.11.11"}
                if path == "/Users/AuthenticateByName":
                    auth_devices.append(device_id)
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

            def docker(command, **kwargs):
                if command[1] == "ps":
                    return CompletedProcess([], 0, stdout="")
                if command[1] == "container":
                    return CompletedProcess([], 0, stdout=str((setup.ROOT / "compose.yml").resolve()))
                return CompletedProcess([], 0, stdout="")

            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "ENV_FILE", state / ".env"),
                mock.patch.object(setup, "generate_media"),
                mock.patch.object(setup, "wait_for_server", return_value={"StartupWizardCompleted": True, "Version": "10.11.11"}),
                mock.patch.object(setup, "api", side_effect=api),
                mock.patch.object(setup.subprocess, "run", side_effect=docker),
            ):
                setup.main()
            item_paths = [path for path in calls if path.startswith("/Users/host/Items?")]
            self.assertEqual(len(item_paths), 1)
            self.assertIn("ParentId=fixture", item_paths[0])
            self.assertEqual(auth_devices, [None, "syncplay-guest-setup"])
            self.assertIn("SYNCPLAY_PORT=", (state / ".env").read_text())
            for folder in ("config", "config/plugins", "catalog/movies", "catalog/shows", "catalog/music"):
                self.assertTrue((state / folder).is_dir())


if __name__ == "__main__":
    unittest.main()
