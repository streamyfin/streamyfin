#!/usr/bin/env python3
"""Seed opt-in 'Maestro' catalogs on the throwaway SyncPlay server.

setup.py keeps owning the SyncPlay fixture library; this adds movies, shows and
music libraries over .state/catalog (mounted read-only under /catalog) so Maestro
flows have browseable items without touching those fixtures.
"""

import json
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.parse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1]))

from suites.syncplay import setup  # noqa: E402

MOVIE_TITLE = "Maestro Movie"
MOVIE_NFO = "<movie><title>Maestro Movie</title><plot>Deterministic local Maestro fixture.</plot><year>2026</year></movie>\n"
SHOW_NFO = "<tvshow><title>Maestro Show</title><plot>Deterministic local Maestro series.</plot></tvshow>\n"
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


def write_nfo(path, text):
    if not path.exists() or path.read_text() != text:
        path.write_text(text)
        return True
    return False


def catalog_files():
    changed = False

    movie_dir = setup.STATE / "catalog" / "movies" / MOVIE_TITLE
    movie_dir.mkdir(parents=True, exist_ok=True)
    mp4 = movie_dir / f"{MOVIE_TITLE}.mp4"
    if not mp4.exists() or mp4.stat().st_size == 0:
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "color=c=0x1f2937:size=640x360:rate=24:duration=20",
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000:duration=20",
            "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
            "-shortest", "-movflags", "+faststart", str(mp4),
        ], check=True)
        changed = True
    changed = write_nfo(movie_dir / "movie.nfo", MOVIE_NFO) or changed

    show_dir = setup.STATE / "catalog" / "shows" / "Maestro Show"
    season_dir = show_dir / "Season 01"
    season_dir.mkdir(parents=True, exist_ok=True)
    changed = write_nfo(show_dir / "tvshow.nfo", SHOW_NFO) or changed
    for number, title in EPISODES:
        episode = season_dir / f"{number:02d}_{title}.mp4"
        if not episode.exists() or episode.stat().st_size == 0:
            shutil.copyfile(mp4, episode)
            changed = True
        changed = write_nfo(
            episode.with_suffix(".nfo"),
            f"<episodedetails><title>{title}</title><showtitle>Maestro Show</showtitle>"
            f"<season>1</season><episode>{number}</episode></episodedetails>\n",
        ) or changed

    album_dir = setup.STATE / "catalog" / "music" / "Maestro Artist" / "Maestro Album"
    album_dir.mkdir(parents=True, exist_ok=True)
    for number, title in TRACKS:
        flac = album_dir / f"{number:02d}_{title}.flac"
        if not flac.exists() or flac.stat().st_size == 0:
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
                "-t", "20", "-c:a", "flac",
                "-metadata", f"title={title}",
                "-metadata", "artist=Maestro Artist",
                "-metadata", "album=Maestro Album",
                "-metadata", "album_artist=Maestro Artist",
                "-metadata", f"track={number}",
                str(flac),
            ], check=True)
            changed = True
    return changed


def covered(items, expected):
    return len(items) == len(expected) and all(
        any(all(item.get(key) == value for key, value in want.items()) for item in items)
        for want in expected
    )


def seed():
    credentials()
    host = setup.api("/Users/AuthenticateByName", "POST", {"Username": "syncplay-host", "Pw": setup.PASSWORD})
    token = host["AccessToken"]
    items_query = f"/Users/{host['User']['Id']}/Items?"

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
            if not covered(result["Items"], spec["expected"]):
                pending[spec["name"]] = result["Items"]
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
