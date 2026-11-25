"""A local seed must turn real catalog metadata into ten-second placeholder files."""

import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from suites.syncplay import backend, catalog_seed, seed, setup


class CatalogSeedTest(unittest.TestCase):
    def test_seeds_titles_relationships_and_ten_second_media_without_downloading(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "credentials.json").write_text(json.dumps({
                "url": setup.URL, "host": {"token": "stored-host-token", "userId": "host"},
            }))
            inventory = {
                "movies": [{"key": "movie:general", "title": "The General", "year": 1926,
                            "providerIds": {"Imdb": "tt0017925", "Tmdb": "961"}}],
                "shows": [{"key": "show:lightsout", "title": "Lights Out", "year": 1949,
                           "providerIds": {"Imdb": "tt0041037"}}],
                "episodes": [
                    {"key": "episode:edna", "showKey": "show:lightsout", "title": "Edna Warren",
                     "season": 1, "episode": 1, "providerIds": {}},
                    {"key": "episode:promise", "showKey": "show:lightsout", "title": "Promise",
                     "season": 1, "episode": 2, "providerIds": {}},
                ],
                "tracks": [
                    {"key": "track:maple", "title": "Maple Leaf Rag", "track": 1,
                     "artistKey": "artist:joplin", "artist": "Scott Joplin",
                     "artistProviderIds": {}, "albumKey": "album:rags",
                     "album": "Maple Leaf Rag and Other Rags", "albumProviderIds": {}, "providerIds": {}},
                    {"key": "track:entertainer", "title": "The Entertainer", "track": 2,
                     "artistKey": "artist:joplin", "artist": "Scott Joplin",
                     "artistProviderIds": {}, "albumKey": "album:rags",
                     "album": "Maple Leaf Rag and Other Rags", "albumProviderIds": {}, "providerIds": {}},
                ],
            }
            manifest = state / "inventory.json"
            manifest.write_text(json.dumps(inventory))
            folders = [
                {"Name": f"{label}", "Locations": [f"/catalog/{kind}"],
                 "CollectionType": collection_type, "ItemId": kind}
                for label, kind, collection_type in (
                    ("Movies", "movies", "movies"),
                    ("Shows", "shows", "tvshows"),
                    ("Music", "music", "music"),
                )
            ]
            items = {"movies": [], "shows": [], "music": []}
            calls = []
            commands = []

            def api(path, method="GET", data=None, token=None):
                calls.append((path, method))
                self.assertEqual(token, "stored-host-token")
                if path == "/Library/VirtualFolders":
                    return folders
                if path.startswith("/Users/host/Items?"):
                    kind = parse_qs(urlsplit(path).query)["ParentId"][0]
                    return {"Items": items[kind]}
                if path == "/Library/Refresh":
                    items["movies"] = [
                        {"Name": "Movie", "Type": "Movie"},
                        {"Name": "The General", "Type": "Movie"},
                    ]
                    items["shows"] = [
                        {"Name": "Show", "Type": "Series"},
                        {"Name": "Pilot", "Type": "Episode", "ParentIndexNumber": 1, "IndexNumber": 1},
                        {"Name": "Finale", "Type": "Episode", "ParentIndexNumber": 1, "IndexNumber": 2},
                        {"Name": "Lights Out", "Type": "Series"},
                        {"Name": "Edna Warren", "Type": "Episode", "SeriesName": "Lights Out",
                         "ParentIndexNumber": 1, "IndexNumber": 1},
                        {"Name": "Promise", "Type": "Episode", "SeriesName": "Lights Out",
                         "ParentIndexNumber": 1, "IndexNumber": 2},
                    ]
                    items["music"] = [
                        {"Name": "Artist", "Type": "MusicArtist"},
                        {"Name": "Album", "Type": "MusicAlbum"},
                        {"Name": "Track One", "Type": "Audio"},
                        {"Name": "Track Two", "Type": "Audio"},
                        {"Name": "Scott Joplin", "Type": "MusicArtist"},
                        {"Name": "Maple Leaf Rag and Other Rags", "Type": "MusicAlbum",
                         "AlbumArtist": "Scott Joplin"},
                        {"Name": "Maple Leaf Rag", "Type": "Audio", "Album": "Maple Leaf Rag and Other Rags",
                         "AlbumArtist": "Scott Joplin", "IndexNumber": 1},
                        {"Name": "The Entertainer", "Type": "Audio", "Album": "Maple Leaf Rag and Other Rags",
                         "AlbumArtist": "Scott Joplin", "IndexNumber": 2},
                    ]
                    return None
                raise AssertionError(f"Unexpected Jellyfin request: {method} {path}")

            def ffmpeg(command, check):
                self.assertTrue(check)
                commands.append(command)
                Path(command[-1]).write_bytes(b"encoded placeholder")

            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "api", side_effect=api),
                # seed calls setup.backend() for the media host path; a developer
                # SYNCPLAY_BACKEND=native must not switch it to host processes.
                mock.patch.object(setup, "backend", return_value=backend.DockerBackend()),
                mock.patch.object(catalog_seed.subprocess, "run", side_effect=ffmpeg),
            ):
                seed.seed(inventory_path=manifest)
                movie = state / "catalog/movies/general"
                self.assertTrue((movie / "general.mp4").is_file())
                self.assertIn("<title>The General</title>", (movie / "movie.nfo").read_text())
                self.assertIn('<uniqueid type="imdb">tt0017925</uniqueid>', (movie / "movie.nfo").read_text())
                show = state / "catalog/shows/lightsout"
                self.assertIn("<title>Lights Out</title>", (show / "tvshow.nfo").read_text())
                episode = (show / "Season 01/01_edna.nfo").read_text()
                self.assertIn("<showtitle>Lights Out</showtitle>", episode)
                self.assertIn("<episode>1</episode>", episode)
                tracks = state / "catalog/music/joplin/rags"
                self.assertTrue((tracks / "01_maple.flac").is_file())
                self.assertTrue((tracks / "02_entertainer.flac").is_file())
                self.assertTrue(any("title=Maple Leaf Rag" in part for cmd in commands for part in cmd))
                self.assertTrue(any("duration=10" in part for cmd in commands for part in cmd))
                self.assertTrue(any("-t" in cmd and cmd[cmd.index("-t") + 1] == "10" for cmd in commands))
                self.assertEqual(len([c for c in calls if c == ("/Library/Refresh", "POST")]), 1)
                encoded = len(commands)
                seed.seed(inventory_path=manifest)
                self.assertEqual(len(commands), encoded)
                self.assertEqual(len([c for c in calls if c == ("/Library/Refresh", "POST")]), 1)


class AtomicOutputTest(unittest.TestCase):
    """A failed write must leave nothing the next run would mistake for finished."""

    def test_failed_ffmpeg_output_never_reaches_the_target(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            template = root / "template.flac"
            template.write_bytes(b"silent template")
            cases = {
                "clip.mp4": catalog_seed.video_template,
                "tone.flac": catalog_seed.audio_template,
                "tagged.flac": lambda target: catalog_seed.tag_audio(template, target, {"title": "Track"}),
            }
            for name, function in cases.items():
                target = root / "out" / name
                with self.subTest(name=name):
                    def failed(command, check):
                        Path(command[-1]).write_bytes(b"partial output")
                        raise subprocess.CalledProcessError(1, command)

                    with mock.patch.object(catalog_seed.subprocess, "run", side_effect=failed):
                        with self.assertRaises(subprocess.CalledProcessError):
                            function(target)
                    self.assertFalse(target.exists())
                    self.assertFalse([path for path in target.parent.iterdir() if path.is_dir()])

                    def encoded(command, check):
                        Path(command[-1]).write_bytes(b"finished output")

                    with mock.patch.object(catalog_seed.subprocess, "run", side_effect=encoded):
                        self.assertTrue(function(target))
                    self.assertEqual(target.read_bytes(), b"finished output")

    def test_a_failed_copy_leaves_no_file_and_the_retry_succeeds(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            template = root / "template.mp4"
            template.write_bytes(b"template video")
            target = root / "copy.mp4"

            def partial_copy(source, destination):
                Path(destination).write_bytes(b"partial copy")
                raise OSError("simulated write failure")

            with (
                mock.patch.object(catalog_seed.os, "link", side_effect=OSError("no hard links")),
                mock.patch.object(catalog_seed.shutil, "copyfile", side_effect=partial_copy),
            ):
                with self.assertRaises(OSError):
                    catalog_seed.copy_video(template, target)
            self.assertFalse(target.exists())
            self.assertEqual([path.name for path in root.iterdir()], ["template.mp4"])

            self.assertTrue(catalog_seed.copy_video(template, target))
            self.assertEqual(target.read_bytes(), b"template video")


if __name__ == "__main__":
    unittest.main()
