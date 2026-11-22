#!/usr/bin/env python3
"""Seed an opt-in 'Maestro Movies' catalog on the throwaway SyncPlay server.

setup.py keeps owning the SyncPlay fixture library; this adds a second movies
library over .state/catalog/movies (mounted read-only at /catalog/movies) so
Maestro flows have a browseable item without touching those fixtures.
"""

import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.parse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1]))

from suites.syncplay import setup  # noqa: E402

LIBRARY_NAME = "Maestro Movies"
CONTAINER_PATH = "/catalog/movies"
MOVIE_TITLE = "Maestro Movie"
NFO = "<movie><title>Maestro Movie</title><plot>Deterministic local Maestro fixture.</plot><year>2026</year></movie>\n"


def credentials():
    path = setup.STATE / "credentials.json"
    if not path.exists():
        raise RuntimeError(f"{path} is missing; run setup.py first")
    creds = json.loads(path.read_text())
    if creds.get("url") != setup.URL:
        raise RuntimeError(f"{path} targets {creds.get('url')!r}, not {setup.URL}; rerun setup.py")


def movie_files():
    directory = setup.STATE / "catalog" / "movies" / MOVIE_TITLE
    directory.mkdir(parents=True, exist_ok=True)
    changed = False
    mp4 = directory / f"{MOVIE_TITLE}.mp4"
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
    nfo = directory / "movie.nfo"
    if not nfo.exists() or nfo.read_text() != NFO:
        nfo.write_text(NFO)
        changed = True
    return changed


def seed():
    credentials()
    host = setup.api("/Users/AuthenticateByName", "POST", {"Username": "syncplay-host", "Pw": setup.PASSWORD})
    token = host["AccessToken"]

    folders = setup.api("/Library/VirtualFolders", token=token)
    library = None
    for folder in folders:
        locations = folder.get("Locations", [])
        if folder.get("Name") == LIBRARY_NAME:
            if locations != [CONTAINER_PATH]:
                raise RuntimeError(f"'{LIBRARY_NAME}' exists with locations {locations}; expected only {CONTAINER_PATH}")
            if folder.get("CollectionType") != "movies":
                raise RuntimeError(f"'{LIBRARY_NAME}' exists with CollectionType {folder.get('CollectionType')!r}; expected 'movies'")
            library = folder
        elif CONTAINER_PATH in locations:
            raise RuntimeError(f"{CONTAINER_PATH} is already claimed by library {folder.get('Name')!r}")

    changed = movie_files()
    if library is None:
        query = urllib.parse.urlencode({"name": LIBRARY_NAME, "collectionType": "movies", "refreshLibrary": "false"})
        setup.api("/Library/VirtualFolders?" + query, "POST", {
            "LibraryOptions": {
                "PathInfos": [{"Path": CONTAINER_PATH}], "EnableRealtimeMonitor": False,
                "EnableInternetProviders": False, "EnableChapterImageExtraction": False,
                "EnableTrickplayImageExtraction": False,
                "TypeOptions": [{"Type": "Movie", "MetadataFetchers": [], "ImageFetchers": []}],
            }
        }, token)
        changed = True
        folders = setup.api("/Library/VirtualFolders", token=token)
        library = next((folder for folder in folders if folder.get("Name") == LIBRARY_NAME), None)
        if library is None:
            raise RuntimeError(f"'{LIBRARY_NAME}' was accepted but is not listed")
    library_id = library["ItemId"]

    result = setup.api(
        f"/Users/{host['User']['Id']}/Items?ParentId={library_id}&Recursive=true&IncludeItemTypes=Movie",
        token=token,
    )
    missing = not any(item.get("Name") == MOVIE_TITLE and item.get("Type") == "Movie" for item in result["Items"])
    if changed or missing:
        setup.api("/Library/Refresh", "POST", token=token)

    items = []
    for _ in range(90):
        result = setup.api(
            f"/Users/{host['User']['Id']}/Items?ParentId={library_id}&Recursive=true&IncludeItemTypes=Movie",
            token=token,
        )
        items = result["Items"]
        if len(items) == 1 and items[0].get("Name") == MOVIE_TITLE and items[0].get("Type") == "Movie":
            print(json.dumps({"url": setup.URL, "library": LIBRARY_NAME, "item": items[0]["Name"]}))
            return
        time.sleep(2)
    raise RuntimeError(f"Expected exactly one '{MOVIE_TITLE}' in '{LIBRARY_NAME}', got {items!r}")


if __name__ == "__main__":
    seed()
