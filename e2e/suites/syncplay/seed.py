#!/usr/bin/env python3
"""Seed opt-in 'Maestro' catalogs on the throwaway SyncPlay server.

setup.py keeps owning the SyncPlay fixture library; this adds movies, shows and
music libraries over .state/catalog (mounted read-only under /catalog) so Maestro
flows have browseable items without touching those fixtures.
"""

import json
from pathlib import Path
import sys
import time
import urllib.parse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1]))

from suites.syncplay import catalog_seed, setup  # noqa: E402

MOVIE_TITLE = "Maestro Movie"
EPISODES = ((1, "Maestro Pilot"), (2, "Maestro Finale"))
TRACKS = ((1, "Maestro Track One"), (2, "Maestro Track Two"))


def library_options(mount, types=()):
    options = {
        "PathInfos": [{"Path": mount}], "EnableRealtimeMonitor": False,
        "EnableInternetProviders": False, "EnableChapterImageExtraction": False,
        "EnableTrickplayImageExtraction": False,
    }
    if types:
        options["TypeOptions"] = [
            {"Type": kind, "MetadataFetchers": [], "ImageFetchers": []} for kind in types
        ]
    return options


LIBRARIES = [
    {
        "name": "Maestro Movies", "collectionType": "movies", "mount": "/catalog/movies",
        "include": "Movie", "options": library_options("/catalog/movies", ("Movie",)),
        "expected": [{"Name": "Maestro Movie", "Type": "Movie"}],
    },
    {
        "name": "Maestro Shows", "collectionType": "tvshows", "mount": "/catalog/shows",
        "include": "Series,Episode", "options": library_options("/catalog/shows", ("Series", "Episode")),
        "expected": [
            {"Name": "Maestro Show", "Type": "Series"},
            {"Name": "Maestro Pilot", "Type": "Episode", "ParentIndexNumber": 1, "IndexNumber": 1},
            {"Name": "Maestro Finale", "Type": "Episode", "ParentIndexNumber": 1, "IndexNumber": 2},
        ],
    },
    {
        "name": "Maestro Music", "collectionType": "music", "mount": "/catalog/music",
        "include": "MusicArtist,MusicAlbum,Audio", "options": library_options("/catalog/music"),
        "expected": [
            {"Name": "Maestro Artist", "Type": "MusicArtist"},
            {"Name": "Maestro Album", "Type": "MusicAlbum"},
            {"Name": "Maestro Track One", "Type": "Audio"},
            {"Name": "Maestro Track Two", "Type": "Audio"},
        ],
    },
]


def credentials():
    path = setup.STATE / "credentials.json"
    if not path.exists():
        raise RuntimeError(f"{path} is missing; run setup.py first")
    creds = json.loads(path.read_text())
    if creds.get("url") != setup.URL:
        raise RuntimeError(f"{path} targets {creds.get('url')!r}, not {setup.URL}; rerun setup.py")
    host = creds.get("host", {})
    if not host.get("token") or not host.get("userId"):
        raise RuntimeError(f"{path} lacks a stored host token and userId; rerun setup.py")
    return creds


def catalog_files():
    catalog = setup.STATE / "catalog"
    video = catalog / "templates" / "catalog-black-silent-10s.mp4"
    audio = catalog / "templates" / "catalog-silent-10s.flac"
    changed = catalog_seed.video_template(video)
    changed = catalog_seed.audio_template(audio) or changed

    movie_dir = catalog / "movies" / MOVIE_TITLE
    changed = catalog_seed.copy_video(video, movie_dir / f"{MOVIE_TITLE}.mp4") or changed
    changed = catalog_seed.nfo(
        movie_dir / "movie.nfo", "movie",
        {"title": MOVIE_TITLE, "plot": "Deterministic local Maestro fixture.", "year": 2026},
    ) or changed

    show_dir = catalog / "shows" / "Maestro Show"
    season_dir = show_dir / "Season 01"
    season_dir.mkdir(parents=True, exist_ok=True)
    changed = catalog_seed.nfo(
        show_dir / "tvshow.nfo", "tvshow",
        {"title": "Maestro Show", "plot": "Deterministic local Maestro series."},
    ) or changed
    for number, title in EPISODES:
        episode = season_dir / f"{number:02d}_{title}.mp4"
        changed = catalog_seed.copy_video(video, episode) or changed
        changed = catalog_seed.nfo(
            episode.with_suffix(".nfo"), "episodedetails",
            {"title": title, "showtitle": "Maestro Show", "season": 1, "episode": number},
        ) or changed

    album_dir = catalog / "music" / "Maestro Artist" / "Maestro Album"
    for number, title in TRACKS:
        tags = {
            "title": title, "artist": "Maestro Artist", "album": "Maestro Album",
            "album_artist": "Maestro Artist", "track": str(number),
        }
        changed = catalog_seed.tag_audio(audio, album_dir / f"{number:02d}_{title}.flac", tags) or changed
    return changed


def covered(items, expected):
    return len(items) == len(expected) and all(
        any(all(item.get(key) == value for key, value in want.items()) for item in items)
        for want in expected
    )


def seed(inventory_path=ROOT / "inventory.json"):
    creds = credentials()
    token = creds["host"]["token"]
    items_query = f"/Users/{creds['host']['userId']}/Items?"
    inventory = json.loads(inventory_path.read_text())
    catalog_expected = catalog_seed.expected_items(inventory)

    folders = setup.api("/Library/VirtualFolders", token=token)
    specs = {spec["name"]: spec for spec in LIBRARIES}
    mounts = {spec["mount"]: spec["name"] for spec in LIBRARIES}
    library_ids = {}
    for folder in folders:
        name = folder.get("Name")
        locations = folder.get("Locations", [])
        spec = specs.get(name)
        if spec is not None:
            if name in library_ids:
                raise RuntimeError(f"Duplicate library named {name!r}")
            if locations != [spec["mount"]]:
                raise RuntimeError(f"'{name}' exists with locations {locations}; expected only {spec['mount']}")
            if folder.get("CollectionType") != spec["collectionType"]:
                raise RuntimeError(f"'{name}' exists with CollectionType {folder.get('CollectionType')!r}; expected {spec['collectionType']!r}")
            library_ids[name] = folder["ItemId"]
        else:
            for location in locations:
                if location in mounts:
                    raise RuntimeError(f"{location} is already claimed by library {name!r}")

    changed = catalog_files()
    changed = catalog_seed.generate(setup.STATE / "catalog", inventory) or changed

    for spec in LIBRARIES:
        if spec["name"] in library_ids:
            continue
        query = urllib.parse.urlencode({"name": spec["name"], "collectionType": spec["collectionType"], "refreshLibrary": "false"})
        setup.api("/Library/VirtualFolders?" + query, "POST", {"LibraryOptions": spec["options"]}, token)
        changed = True
        folders = setup.api("/Library/VirtualFolders", token=token)
        library = next((folder for folder in folders if folder.get("Name") == spec["name"]), None)
        if library is None:
            raise RuntimeError(f"'{spec['name']}' was accepted but is not listed")
        library_ids[spec["name"]] = library["ItemId"]

    def unready():
        pending = {}
        for spec in LIBRARIES:
            result = setup.api(
                f"{items_query}ParentId={library_ids[spec['name']]}&Recursive=true&IncludeItemTypes={spec['include']}",
                token=token,
            )
            expected = [*spec["expected"], *catalog_expected[spec["name"]]]
            if not covered(result["Items"], expected):
                pending[spec["name"]] = {
                    "expected": len(expected), "observed": len(result["Items"]),
                    "sample": [item.get("Name") for item in result["Items"][:5]],
                }
        return pending

    if changed or unready():
        setup.api("/Library/Refresh", "POST", token=token)

    pending = {}
    for _ in range(90):
        pending = unready()
        if not pending:
            print(json.dumps({"url": setup.URL, "libraries": [spec["name"] for spec in LIBRARIES]}))
            return
        time.sleep(2)
    raise RuntimeError(f"Catalog not ready; unready libraries: {pending!r}")


if __name__ == "__main__":
    seed()
