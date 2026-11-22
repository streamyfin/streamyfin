"""Install the pinned Streamyfin companion on this worktree's local Jellyfin."""

import hashlib
from io import BytesIO
import json
from pathlib import Path, PurePosixPath
import subprocess
from tempfile import TemporaryDirectory
import time
import urllib.request
import zipfile

from suites.syncplay import setup

# The exact ABI and archive are published in the plugin's release manifest:
# https://github.com/streamyfin/jellyfin-plugin-streamyfin/blob/main/manifest.json
PLUGIN_ID = "1e9e5d38-6e67-4615-8719-e98a5c34f004"
PLUGIN_VERSION = "0.68.1.0"
PLUGIN_SHA256 = "735cebb5f21e23ce4068311e626abfc97bd2991798c40a52ce54ef6e23798ae0"
PLUGIN_URL = (
    "https://github.com/streamyfin/jellyfin-plugin-streamyfin/releases/download/"
    "0.68.1.0/streamyfin-0.68.1.0.zip"
)


def local_container():
    """Identify the running container by this checkout's config mount and host port."""
    ids = subprocess.check_output(["docker", "ps", "-q"], text=True).splitlines()
    if not ids:
        raise RuntimeError("No running Docker containers")
    containers = json.loads(subprocess.check_output(["docker", "inspect", *ids], text=True))
    expected_config = (setup.STATE / "config").resolve()
    expected_compose = str((setup.ROOT / "compose.yml").resolve())
    port = setup.URL.rsplit(":", 1)[1]
    matches = [
        container["Id"]
        for container in containers
        if container.get("Config", {}).get("Labels", {}).get("com.docker.compose.project.config_files") == expected_compose
        and any(
            mount["Destination"] == "/config" and Path(mount["Source"]).resolve() == expected_config
            for mount in container["Mounts"]
        )
        and any(
            mapping["HostPort"] == port and mapping["HostIp"] == "127.0.0.1"
            for mapping in (container.get("NetworkSettings", {}).get("Ports", {}).get("8096/tcp") or [])
        )
    ]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one worktree Jellyfin container on {setup.URL}, got {len(matches)}")
    return matches[0]


def extract_pinned_plugin(folder):
    with urllib.request.urlopen(PLUGIN_URL, timeout=90) as response:
        archive = response.read()
    if hashlib.sha256(archive).hexdigest() != PLUGIN_SHA256:
        raise RuntimeError("Streamyfin plugin release checksum mismatch; nothing installed")

    folder.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(BytesIO(archive)) as bundle:
        for member in bundle.infolist():
            path = PurePosixPath(member.filename)
            if path.is_absolute() or ".." in path.parts or (member.external_attr >> 16) & 0o170000 == 0o120000:
                raise RuntimeError(f"Unsafe plugin archive entry: {member.filename}")
        with TemporaryDirectory(dir=folder.parent) as temporary:
            bundle.extractall(temporary)
            Path(temporary).rename(folder)


def ensure(token):
    """Install once, restart only this Jellyfin container, verify plugin API is live."""
    existing = next(
        (plugin for plugin in setup.api("/Plugins", token=token) if plugin.get("Id", "").replace("-", "") == PLUGIN_ID.replace("-", "")),
        None,
    )
    if existing:
        if existing.get("Version") != PLUGIN_VERSION:
            raise RuntimeError(f"Streamyfin plugin version {existing.get('Version')} is not pinned {PLUGIN_VERSION}")
        if existing.get("Status") == "Active":
            setup.api("/Streamyfin/config", token=token)
            return False

    folder = setup.STATE / "config" / "plugins" / f"Streamyfin_{PLUGIN_VERSION}"
    if not folder.exists():
        extract_pinned_plugin(folder)

    container = local_container()
    subprocess.run(["docker", "restart", container], check=True, stdout=subprocess.DEVNULL)
    setup.wait_for_server()
    for _ in range(30):
        plugins = setup.api("/Plugins", token=token)
        if any(
            plugin.get("Id", "").replace("-", "") == PLUGIN_ID.replace("-", "")
            and plugin.get("Version") == PLUGIN_VERSION
            and plugin.get("Status") == "Active"
            for plugin in plugins
        ):
            setup.api("/Streamyfin/config", token=token)
            return True
        time.sleep(2)
    raise RuntimeError("Streamyfin plugin did not become Active after restarting Jellyfin")
