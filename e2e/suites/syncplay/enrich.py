#!/usr/bin/env python3
"""Opt-in online artwork/metadata refresh for the local catalog.

The offline seed intentionally disables remote fetchers. Discover available
providers on this Jellyfin build rather than hardcoding their display names.
"""

import argparse
import json
from pathlib import Path
import sys
import urllib.parse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parents[1]))

from suites.syncplay import catalog_seed, plugin, seed, setup  # noqa: E402

TYPES = {
    "Maestro Movies": {"Movie"},
    "Maestro Shows": {"Series", "Episode"},
    "Maestro Music": {"MusicArtist", "MusicAlbum", "Audio"},
}


def libraries(token):
    folders = setup.api("/Library/VirtualFolders", token=token)
    selected = {}
    for spec in seed.LIBRARIES:
        matches = [folder for folder in folders if folder["Name"] == spec["name"]]
        if len(matches) != 1:
            raise RuntimeError(f"Expected one {spec['name']!r} library; run e2e:seed first")
        folder = matches[0]
        if folder.get("Locations") != [spec["mount"]] or folder.get("CollectionType") != spec["collectionType"]:
            raise RuntimeError(f"{spec['name']!r} does not own the expected {spec['mount']} mount")
        selected[spec["name"]] = folder
    return selected


def enable_fetchers(folder, spec, token):
    options = dict(folder["LibraryOptions"])
    available = setup.api(
        "/Libraries/AvailableOptions?"
        + urllib.parse.urlencode({"libraryContentType": spec["collectionType"], "isNewLibrary": "false"}),
        token=token,
    )
    # Jellyfin 10.11 does not persist the deprecated EnableInternetProviders flag;
    # per-type fetcher lists are the durable control: github.com/jellyfin/jellyfin/pull/7005.
    previous = {option["Type"]: option for option in options.get("TypeOptions") or []}
    for kind in available["TypeOptions"]:
        if kind["Type"] not in TYPES[spec["name"]]:
            continue
        current = dict(previous.get(kind["Type"], {"Type": kind["Type"]}))
        for field in ("MetadataFetchers", "ImageFetchers"):
            current[field] = [
                provider["Name"] for provider in kind[field] if provider.get("DefaultEnabled")
            ]
        previous[kind["Type"]] = current
    options["TypeOptions"] = list(previous.values())
    if options != folder["LibraryOptions"]:
        setup.api("/Library/VirtualFolders/LibraryOptions", "POST", {
            "Id": folder["ItemId"], "LibraryOptions": options,
        }, token)
        return True
    return False


def items_in_library(folder, spec, user_id, token):
    items = []
    start = 0
    while True:
        query = urllib.parse.urlencode({
            "ParentId": folder["ItemId"], "Recursive": "true",
            "IncludeItemTypes": spec["include"], "Fields": "ProviderIds,Overview",
            "StartIndex": start, "Limit": 200,
        })
        result = setup.api(f"/Users/{user_id}/Items?{query}", token=token)
        page = result["Items"]
        items.extend(page)
        total = result.get("TotalRecordCount", len(items))
        if len(items) >= total:
            if len(items) != total:
                raise RuntimeError(f"Inconsistent item count in {spec['name']}")
            return items
        if not page:
            raise RuntimeError(f"Incomplete item listing in {spec['name']}")
        start += len(page)


def run(limit=None):
    creds = seed.credentials()
    token = creds["host"]["token"]
    selected = libraries(token)
    plugin.ensure(token)
    inventory = json.loads((ROOT / "inventory.json").read_text())
    expected = catalog_seed.expected_items(inventory)
    configured = []
    for spec in seed.LIBRARIES:
        if enable_fetchers(selected[spec["name"]], spec, token):
            configured.append(spec["name"])

    queued = []
    available = 0
    without_ids = 0
    for spec in seed.LIBRARIES:
        library = spec["name"]
        for item in items_in_library(selected[library], spec, creds["host"]["userId"], token):
            if not any(all(item.get(key) == value for key, value in wanted.items()) for wanted in expected[library]):
                continue
            if item["Type"] == "Audio":
                continue
            has_art = bool(item.get("ImageTags", {}).get("Primary"))
            available += has_art
            needs_metadata = item["Type"] in ("Movie", "Series") and not item.get("Overview")
            if has_art and not needs_metadata:
                continue
            if not item.get("ProviderIds"):
                without_ids += 1
                continue
            if limit is not None and len(queued) >= limit:
                continue
            query = urllib.parse.urlencode({
                "metadataRefreshMode": "FullRefresh" if needs_metadata else "None",
                "imageRefreshMode": "None" if has_art else "FullRefresh",
                "replaceAllMetadata": "false", "replaceAllImages": "false",
            })
            setup.api(f"/Items/{item['Id']}/Refresh?{query}", "POST", token=token)
            queued.append(item["Id"])
    result = {
        "url": setup.URL, "plugin": f"Streamyfin {plugin.PLUGIN_VERSION}",
        "configuredLibraries": configured, "queued": len(queued),
        "alreadyWithArtwork": available, "withoutProviderIds": without_ids,
    }
    print(json.dumps(result))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, help="Refresh at most this many items in this run")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")
    run(args.limit)
