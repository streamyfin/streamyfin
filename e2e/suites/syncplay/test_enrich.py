"""Online enrichment must leave SyncPlay alone and refresh only missing catalog art."""

import contextlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from suites.syncplay import backend, enrich, plugin, setup


class EnrichmentTest(unittest.TestCase):
    def test_enables_default_fetchers_and_refreshes_missing_catalog_images_once(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "credentials.json").write_text(json.dumps({
                "url": setup.URL, "host": {"token": "stored-host-token", "userId": "host"},
            }))
            (state / "inventory.json").write_text(json.dumps({
                "movies": [{"key": "movie:general", "title": "The General"}],
                "shows": [{"key": "show:lights", "title": "Lights Out"}],
                "episodes": [{"key": "episode:edna", "title": "Edna Warren",
                              "showKey": "show:lights", "season": 1, "episode": 1}],
                "tracks": [{"key": "track:maple", "title": "Maple Leaf Rag", "track": 1,
                            "artistKey": "artist:joplin", "artist": "Scott Joplin",
                            "albumKey": "album:rags", "album": "Rags"}],
            }))
            folders = {
                kind: {
                    "Name": f"{label}", "ItemId": kind, "CollectionType": collection_type,
                    "Locations": [f"/catalog/{kind}"],
                    "LibraryOptions": {"PathInfos": [{"Path": f"/catalog/{kind}"}],
                                       "EnableInternetProviders": False, "TypeOptions": []},
                }
                for label, kind, collection_type in (
                    ("Movies", "movies", "movies"),
                    ("Shows", "shows", "tvshows"),
                    ("Music", "music", "music"),
                )
            }
            fixture = {
                "Name": "SyncPlay Fixtures", "ItemId": "fixture", "CollectionType": "movies",
                "Locations": ["/media"], "LibraryOptions": {"EnableInternetProviders": False},
            }
            available = {
                "movies": ["Movie"], "tvshows": ["Series", "Episode"],
                "music": ["MusicArtist", "MusicAlbum", "Audio"],
            }
            items = {
                "movies": [
                    {"Id": "movie", "Name": "The General", "Type": "Movie", "ProviderIds": {"Tmdb": "961"}},
                    {"Id": "old", "Name": "Movie", "Type": "Movie", "ProviderIds": {}},
                ],
                "shows": [
                    {"Id": "series", "Name": "Lights Out", "Type": "Series", "ProviderIds": {"Tmdb": "24684"}},
                    {"Id": "episode", "Name": "Edna Warren", "Type": "Episode", "SeriesName": "Lights Out",
                     "ParentIndexNumber": 1, "IndexNumber": 1, "ProviderIds": {"Tmdb": "644908"}},
                ],
                "music": [
                    {"Id": "artist", "Name": "Scott Joplin", "Type": "MusicArtist",
                     "ProviderIds": {"MusicBrainzArtist": "joplin"}},
                    {"Id": "album", "Name": "Rags", "Type": "MusicAlbum", "AlbumArtist": "Scott Joplin",
                     "ProviderIds": {"MusicBrainzAlbum": "rags"}},
                    {"Id": "audio", "Name": "Maple Leaf Rag", "Type": "Audio", "Album": "Rags",
                     "AlbumArtist": "Scott Joplin", "IndexNumber": 1, "ProviderIds": {}},
                ],
            }
            updates = []
            refreshes = []

            def api(path, method="GET", data=None, token=None):
                self.assertEqual(token, "stored-host-token")
                if path == "/Library/VirtualFolders":
                    return [fixture, *folders.values()]
                if path.startswith("/Libraries/AvailableOptions?"):
                    collection = parse_qs(urlsplit(path).query)["libraryContentType"][0]
                    return {"TypeOptions": [
                        {
                            "Type": kind,
                            "MetadataFetchers": [{"Name": "Remote Metadata", "DefaultEnabled": True}],
                            "ImageFetchers": [{"Name": "Remote Images", "DefaultEnabled": True},
                                              {"Name": "Disabled", "DefaultEnabled": False}],
                        }
                        for kind in available[collection]
                    ]}
                if path == "/Library/VirtualFolders/LibraryOptions" and method == "POST":
                    folder = folders[data["Id"]]
                    folder["LibraryOptions"] = data["LibraryOptions"]
                    updates.append(folder["Name"])
                    return None
                if path.startswith("/Users/host/Items?"):
                    kind = parse_qs(urlsplit(path).query)["ParentId"][0]
                    return {"Items": items[kind], "TotalRecordCount": len(items[kind])}
                if path.startswith("/Items/") and "/Refresh?" in path and method == "POST":
                    item_id = path.split("/")[2]
                    query = parse_qs(urlsplit(path).query)
                    self.assertEqual(query["imageRefreshMode"], ["FullRefresh"])
                    self.assertEqual(query["metadataRefreshMode"], [
                        "FullRefresh" if item_id in ("movie", "series") else "None"
                    ])
                    self.assertEqual(query["replaceAllMetadata"], ["false"])
                    self.assertEqual(query["replaceAllImages"], ["false"])
                    refreshes.append(item_id)
                    for group in items.values():
                        for item in group:
                            if item["Id"] == item_id:
                                item["ImageTags"] = {"Primary": "image"}
                                item["Overview"] = "Fetched"
                    return None
                raise AssertionError(f"Unexpected request: {method} {path}")

            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "api", side_effect=api),
                # The fixture lists Docker container paths; a native SYNCPLAY_BACKEND must not remap them.
                mock.patch.object(setup, "backend", return_value=backend.DockerBackend()),
                mock.patch.object(enrich, "ROOT", state),
                mock.patch.object(plugin, "ensure", return_value="0.70.0.0") as install,
            ):
                result = enrich.run()
                self.assertEqual(result["queued"], 5)
                self.assertEqual(result["configuredLibraries"], [folder["Name"] for folder in folders.values()])
                self.assertEqual(refreshes, ["movie", "series", "episode", "artist", "album"])
                self.assertEqual(len(updates), 3)
                for folder in folders.values():
                    self.assertFalse(folder["LibraryOptions"]["EnableInternetProviders"])
                    for option in folder["LibraryOptions"]["TypeOptions"]:
                        self.assertEqual(option["MetadataFetchers"], ["Remote Metadata"])
                        self.assertEqual(option["ImageFetchers"], ["Remote Images"])
                self.assertFalse(fixture["LibraryOptions"]["EnableInternetProviders"])
                enrich.run()
                self.assertEqual(len(updates), 3)
                self.assertEqual(len(refreshes), 5)
                self.assertEqual(install.call_count, 2)

    def test_refuses_wrong_library_before_installing_plugin_or_changing_options(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "credentials.json").write_text(json.dumps({
                "url": setup.URL, "host": {"token": "stored-host-token", "userId": "host"},
            }))
            folders = [
                {"Name": spec["name"], "Locations": ["/another-worktree"],
                 "CollectionType": spec["collectionType"], "ItemId": spec["name"]}
                for spec in enrich.seed.LIBRARIES
            ]
            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "api", return_value=folders),
                mock.patch.object(plugin, "ensure") as install,
            ):
                with self.assertRaisesRegex(RuntimeError, "does not own"):
                    enrich.run(limit=1)
                install.assert_not_called()


class EnrichmentWaitTest(unittest.TestCase):
    ITEM = {"Id": "movie", "Name": "The General", "Type": "Movie", "ProviderIds": {"Tmdb": "961"}}

    def run_enrich(self, polls, **options):
        remaining = iter(polls)
        refreshes = []

        def api(path, method="GET", data=None, token=None):
            refreshes.append(path)

        with (
            mock.patch.object(enrich.seed, "credentials", return_value={"host": {"token": "t", "userId": "host"}}),
            mock.patch.object(enrich, "libraries", return_value={spec["name"]: {} for spec in enrich.seed.LIBRARIES}),
            mock.patch.object(enrich, "enable_fetchers", return_value=False),
            mock.patch.object(enrich, "incomplete_items", side_effect=lambda *args: next(remaining)),
            mock.patch.object(plugin, "ensure", return_value="0.70.0.0"),
            mock.patch.object(setup, "api", side_effect=api),
            mock.patch.object(enrich.time, "sleep") as sleep,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            result = enrich.run(**options)
        return result, sleep, refreshes

    def test_waits_until_the_queued_item_has_its_artwork(self):
        pending = ([(self.ITEM, False, True)], 0)
        result, sleep, refreshes = self.run_enrich([pending, pending, pending, ([], 1)])
        self.assertEqual(result["stillMissing"], [])
        self.assertEqual(sleep.call_count, 2)
        self.assertEqual(len(refreshes), 1)

    def test_async_queues_and_returns_without_polling(self):
        result, sleep, refreshes = self.run_enrich([([(self.ITEM, False, True)], 0)], wait=False)
        self.assertEqual(result["queued"], 1)
        self.assertNotIn("stillMissing", result)
        sleep.assert_not_called()
        self.assertEqual(len(refreshes), 1)

    def test_reports_what_is_still_missing_when_the_timeout_passes(self):
        pending = ([(self.ITEM, False, True)], 0)
        result, _, _ = self.run_enrich([pending, pending], timeout=0)
        self.assertEqual(result["stillMissing"], ["The General"])


if __name__ == "__main__":
    unittest.main()
