"""Online enrichment must leave SyncPlay alone and refresh only missing catalog art."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from suites.syncplay import enrich, plugin, setup


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
                    "Name": f"Maestro {label}", "ItemId": kind, "CollectionType": collection_type,
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
                    {"Id": "old", "Name": "Maestro Movie", "Type": "Movie", "ProviderIds": {}},
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
                mock.patch.object(enrich, "ROOT", state),
                mock.patch.object(plugin, "ensure", return_value=False) as install,
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


if __name__ == "__main__":
    unittest.main()
