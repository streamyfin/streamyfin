"""Install the latest stable Streamyfin companion on this worktree's local Jellyfin."""

from io import BytesIO
import json
import os
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
import time
import urllib.request
import zipfile

from bench.download import fetch_verified
from suites.syncplay import setup

PLUGIN_ID = "1e9e5d38-6e67-4615-8719-e98a5c34f004"
# The stable manifest Jellyfin itself reads for this plugin. Each version names the oldest
# Jellyfin its build runs on (targetAbi), its archive and the archive's MD5.
MANIFEST_URL = "https://raw.githubusercontent.com/streamyfin/jellyfin-plugin-streamyfin/main/manifest.json"
# The manifest is trusted to name a version, not a host: archives come from the plugin's releases.
RELEASES_URL = "https://github.com/streamyfin/jellyfin-plugin-streamyfin/releases/download/"
# Set to a manifest version, such as 0.68.1.0, to replay a run against that exact build.
PIN_ENV = "STREAMYFIN_PLUGIN_VERSION"
MANIFEST_TIMEOUT_SECONDS = 30
DOWNLOAD_TIMEOUT_SECONDS = 90


def version_key(text):
    """Compare 10.11.11 and 10.11.11.0 as the same version."""
    parts = [int(part) for part in text.split(".")]
    return tuple(parts + [0] * (4 - len(parts)))


def read_manifest():
    try:
        with urllib.request.urlopen(MANIFEST_URL, timeout=MANIFEST_TIMEOUT_SECONDS) as response:
            return json.loads(response.read())
    except (OSError, ValueError) as error:
        raise RuntimeError(f"Could not read the Streamyfin plugin manifest at {MANIFEST_URL}: {error}") from error


def select_release(manifest, server_version, pinned=None):
    """The newest stable build this server runs, or the pinned version's build."""
    try:
        server = version_key(server_version)
        versions = next(entry for entry in manifest if entry["guid"] == PLUGIN_ID)["versions"]
        runnable = [
            (version_key(release["version"]), release)
            for release in versions
            if release["sourceUrl"] and release["checksum"] and version_key(release["targetAbi"]) <= server
        ]
    except (StopIteration, KeyError, TypeError, ValueError, AttributeError) as error:
        raise RuntimeError(f"Unreadable Streamyfin plugin manifest at {MANIFEST_URL}") from error
    if pinned:
        runnable = [(key, release) for key, release in runnable if release["version"] == pinned]
    if not runnable:
        raise RuntimeError(f"The Streamyfin plugin manifest has no stable {pinned or 'build'} for Jellyfin {server_version}")
    chosen = max(runnable, key=lambda candidate: candidate[0])[1]
    if not chosen["sourceUrl"].startswith(RELEASES_URL):
        raise RuntimeError(f"Streamyfin plugin {chosen['version']} archive is not under {RELEASES_URL}")
    return chosen


def extract_release(release, folder):
    archive = fetch_verified(
        release["sourceUrl"],
        release["checksum"].lower(),
        f"Streamyfin plugin {release['version']}",
        DOWNLOAD_TIMEOUT_SECONDS,
        algorithm="md5",
    )

    folder.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(BytesIO(archive)) as bundle:
        for member in bundle.infolist():
            path = PurePosixPath(member.filename)
            if path.is_absolute() or ".." in path.parts or (member.external_attr >> 16) & 0o170000 == 0o120000:
                raise RuntimeError(f"Unsafe plugin archive entry: {member.filename}")
        with TemporaryDirectory(dir=folder.parent) as temporary:
            bundle.extractall(temporary)
            Path(temporary).rename(folder)


def is_streamyfin(plugin):
    return plugin.get("Id", "").replace("-", "") == PLUGIN_ID.replace("-", "")


def ensure(token):
    """Leave the selected build Active, restarting only this checkout's Jellyfin, and return its version."""
    server_version = setup.api("/System/Info/Public")["Version"]
    release = select_release(read_manifest(), server_version, os.environ.get(PIN_ENV))
    version = release["version"]
    installed = [plugin for plugin in setup.api("/Plugins", token=token) if is_streamyfin(plugin)]
    if any(plugin.get("Version") == version and plugin.get("Status") == "Active" for plugin in installed):
        setup.api("/Streamyfin/config", token=token)
        return version

    for plugin in installed:
        if plugin.get("Version") != version:
            # Jellyfin deletes a version uninstalled this way when it next starts.
            setup.api(f"/Plugins/{PLUGIN_ID}/{plugin['Version']}", "DELETE", token=token)
    folder = setup.STATE / "config" / "plugins" / f"Streamyfin_{version}"
    if not folder.exists():
        extract_release(release, folder)

    owned = setup.identity()
    setup.backend(owned).restart_jellyfin(owned)
    setup.wait_for_server()
    for _ in range(30):
        if any(
            is_streamyfin(plugin) and plugin.get("Version") == version and plugin.get("Status") == "Active"
            for plugin in setup.api("/Plugins", token=token)
        ):
            setup.api("/Streamyfin/config", token=token)
            return version
        time.sleep(2)
    raise RuntimeError(f"Streamyfin plugin {version} did not become Active after restarting Jellyfin")
