#!/usr/bin/env python3
"""Create an isolated local Jellyfin with generated public-domain test media."""

import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
STATE = ROOT / ".state"
ENV_FILE = ROOT / ".env"
IDENTITY = {
    "SYNCPLAY_PROJECT": "streamyfin-syncplay-e2e",
    "SYNCPLAY_CONTAINER": "streamyfin-syncplay-e2e-jellyfin",
    "SYNCPLAY_PORT": "18096",
    "SYNCPLAY_SEERR_CONTAINER": "streamyfin-syncplay-e2e-seerr",
    "SYNCPLAY_SEERR_PORT": "15055",
    "SYNCPLAY_BACKEND": "docker",
}
BACKEND_NAMES = ("docker", "native")


def saved_identity():
    if not ENV_FILE.is_file():
        return {}
    return dict(line.split("=", 1) for line in ENV_FILE.read_text().splitlines() if "=" in line)


URL = f"http://127.0.0.1:{os.environ.get('SYNCPLAY_PORT') or saved_identity().get('SYNCPLAY_PORT') or IDENTITY['SYNCPLAY_PORT']}"
PASSWORD = "SyncPlay-local-2026"
AUTH = 'MediaBrowser Client="SyncPlay E2E setup", Device="Local", DeviceId="syncplay-setup", Version="1.0"'


def api(path, method="GET", data=None, token=None, device_id=None):
    headers = {
        "Authorization": AUTH if device_id is None else AUTH.replace('DeviceId="syncplay-setup"', f'DeviceId="{device_id}"'),
        "Content-Type": "application/json",
    }
    if token:
        headers["X-Emby-Token"] = token
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(URL + path, body, headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        result = response.read()
        return json.loads(result) if result else None


def identity():
    """The backend, compose project, containers and ports this checkout owns.

    .env (next to compose.yml, so compose reads it too) persists them from the first
    setup, so later commands never need the variables retyped. An explicit variable
    that disagrees with .env is refused: it would target another instance.
    """
    saved = saved_identity()
    if ENV_FILE.is_file():
        # A .env written before SYNCPLAY_BACKEND existed belongs to a Docker instance.
        saved.setdefault("SYNCPLAY_BACKEND", "docker")
    resolved = {}
    for key, default in IDENTITY.items():
        explicit = os.environ.get(key)
        if explicit and saved.get(key) and explicit != saved[key]:
            raise RuntimeError(f"{key}={explicit} conflicts with {saved[key]} in {ENV_FILE}; run e2e:down first, or unset it")
        resolved[key] = explicit or saved.get(key) or default
    if resolved["SYNCPLAY_BACKEND"] not in BACKEND_NAMES:
        raise RuntimeError(f"SYNCPLAY_BACKEND={resolved['SYNCPLAY_BACKEND']} is not one of {', '.join(BACKEND_NAMES)}")
    return resolved


def backend(owned=None):
    """The backend that runs this checkout's servers, Docker Compose or host processes."""
    from suites.syncplay import backend as backends

    return backends.for_identity(owned or identity())


def refuse_foreign_container(name):
    """Never recreate or remove a container that another checkout's compose.yml started."""
    inspected = subprocess.run(
        ["docker", "container", "inspect", name, "--format", '{{ index .Config.Labels "com.docker.compose.project.config_files" }}'],
        capture_output=True, text=True,
    )
    if inspected.returncode != 0:
        return
    owner = inspected.stdout.strip()
    if owner != str((ROOT / "compose.yml").resolve()):
        raise RuntimeError(
            f"Container {name!r} belongs to {owner or 'another compose project'}, not this checkout. "
            "Pass unique SYNCPLAY_PROJECT, SYNCPLAY_CONTAINER and SYNCPLAY_PORT."
        )


def refuse_foreign_project(project):
    """Refuse to run compose against a project another checkout's compose.yml started.

    The container-name guard alone is not enough: `compose -p <project> up/down` acts on
    every container carrying the project label, so a free SYNCPLAY_CONTAINER name still
    leaves foreign containers under this project to adopt or destroy.
    """
    listed = subprocess.run(
        ["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={project}"],
        capture_output=True, text=True, check=True,
    )
    ids = listed.stdout.split()
    if not ids:
        return
    inspected = subprocess.run(
        ["docker", "inspect", *ids],
        capture_output=True, text=True, check=True,
    )
    compose = str((ROOT / "compose.yml").resolve())
    for container in json.loads(inspected.stdout):
        labels = (container.get("Config") or {}).get("Labels") or {}
        owner = labels.get("com.docker.compose.project.config_files")
        if owner != compose:
            raise RuntimeError(
                f"Compose project {project!r} includes a container from {owner or 'another compose project'}, "
                "not this checkout. Pass a unique SYNCPLAY_PROJECT."
            )


def wait_for_server():
    for _ in range(90):
        try:
            info = api("/System/Info/Public")
            with urllib.request.urlopen(URL + "/health", timeout=5) as response:
                if response.read().decode() == "Healthy":
                    return info
        except (OSError, ValueError):
            # Not up yet, or up and answering with something else.
            pass
        time.sleep(2)
    raise RuntimeError("Jellyfin did not become ready within 180 seconds")


def generate_media():
    media = STATE / "media"
    media.mkdir(parents=True, exist_ok=True)
    for number, color in enumerate(("0x2563eb", "0x16a34a", "0xdc2626"), 1):
        title = f"SyncPlay Clip {number}"
        folder = media / title
        folder.mkdir(exist_ok=True)
        target = folder / f"{title}.mp4"
        if not target.exists() or target.stat().st_size == 0:
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", f"testsrc2=size=640x360:rate=24:duration=120",
                "-f", "lavfi", "-i", f"sine=frequency={330 + number * 110}:sample_rate=48000:duration=120",
                "-vf", f"drawbox=x=0:y=0:w=640:h=72:color={color}:t=fill",
                "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k",
                "-movflags", "+faststart", "-shortest", str(target),
            ], check=True)
        (folder / "movie.nfo").write_text(
            f"<movie><title>{title}</title><plot>Generated two-minute test pattern for local SyncPlay validation.</plot><year>2026</year></movie>\n"
        )


def main():
    owned = identity()
    servers = backend(owned)
    servers.refuse_foreign(owned)
    ENV_FILE.write_text("".join(f"{key}={value}\n" for key, value in owned.items()))
    generate_media()
    # Docker creates a missing bind source as root, which the seed then cannot write into on Linux.
    for folder in ("config", "config/plugins", "cache", "catalog/movies", "catalog/shows", "catalog/music", "seerr"):
        path = STATE / folder
        try:
            path.mkdir(parents=True, exist_ok=True)
        except PermissionError as error:
            raise RuntimeError(f"Cannot create {path}; fix its parent's ownership or remove it first") from error
        if not os.access(path, os.W_OK):
            raise RuntimeError(f"{path} is not writable; fix its ownership or remove it first")
    servers.up(owned)
    info = wait_for_server()
    if not info.get("StartupWizardCompleted"):
        api("/Startup/Configuration", "POST", {
            "ServerName": "Streamyfin SyncPlay E2E", "UICulture": "en-US",
            "MetadataCountryCode": "US", "PreferredMetadataLanguage": "en",
        })
        api("/Startup/User")
        api("/Startup/User", "POST", {"Name": "syncplay-host", "Password": PASSWORD})
        # The host-only Docker port is local. Remote-access permission allows the
        # container's bridged gateway to authenticate browser/simulator clients.
        api("/Startup/RemoteAccess", "POST", {"EnableRemoteAccess": True, "EnableAutomaticPortMapping": False})
        api("/Startup/Complete", "POST")
    host = api("/Users/AuthenticateByName", "POST", {"Username": "syncplay-host", "Pw": PASSWORD})
    token = host["AccessToken"]
    users = api("/Users", token=token)
    guest = next((user for user in users if user["Name"] == "syncplay-guest"), None)
    if not guest:
        guest = api("/Users/New", "POST", {"Name": "syncplay-guest", "Password": PASSWORD}, token)
    for user in (host["User"], guest):
        policy = dict(user.get("Policy", {}))
        policy.update({"EnableAllFolders": True, "EnableMediaPlayback": True, "SyncPlayAccess": "CreateAndJoinGroups"})
        api(f"/Users/{user['Id']}/Policy", "POST", policy, token)
    folders = api("/Library/VirtualFolders", token=token)
    fixture = next((folder for folder in folders if folder["Name"] == "SyncPlay Fixtures"), None)
    if fixture is None:
        query = urllib.parse.urlencode({"name": "SyncPlay Fixtures", "collectionType": "movies", "refreshLibrary": "true"})
        api("/Library/VirtualFolders?" + query, "POST", {
            "LibraryOptions": {
                "PathInfos": [{"Path": servers.host_path("/media")}], "EnableRealtimeMonitor": False,
                "EnableInternetProviders": False, "EnableChapterImageExtraction": False,
                "EnableTrickplayImageExtraction": False,
                "TypeOptions": [{"Type": "Movie", "MetadataFetchers": [], "ImageFetchers": []}],
            }
        }, token)
        folders = api("/Library/VirtualFolders", token=token)
        fixture = next((folder for folder in folders if folder["Name"] == "SyncPlay Fixtures"), None)
    if fixture is None:
        raise RuntimeError("'SyncPlay Fixtures' was accepted but is not listed")
    api("/Library/Refresh", "POST", token=token)
    clip_names = {f"SyncPlay Clip {number}" for number in range(1, 4)}
    items = []
    for _ in range(90):
        items = api(f"/Users/{host['User']['Id']}/Items?ParentId={fixture['ItemId']}&Recursive=true&IncludeItemTypes=Movie&Fields=MediaSources", token=token)["Items"]
        if len(items) == 3 and {item.get("Name") for item in items} == clip_names:
            break
        time.sleep(2)
    if len(items) != 3 or {item.get("Name") for item in items} != clip_names:
        raise RuntimeError(f"Expected the three SyncPlay clips in 'SyncPlay Fixtures', got {[item.get('Name') for item in items]}")
    from suites.syncplay import seerr

    seerr.ensure_ready(owned, username="syncplay-host", password=PASSWORD)
    guest_auth = api("/Users/AuthenticateByName", "POST", {"Username": "syncplay-guest", "Pw": PASSWORD}, device_id="syncplay-guest-setup")
    credentials = {
        "url": URL, "serverVersion": info["Version"], "password": PASSWORD,
        "host": {"name": "syncplay-host", "userId": host["User"]["Id"], "token": token},
        "guest": {"name": "syncplay-guest", "userId": guest["Id"], "token": guest_auth["AccessToken"]},
        "items": [{"id": item["Id"], "name": item["Name"], "durationTicks": item.get("RunTimeTicks")} for item in items],
    }
    credentials_path = STATE / "credentials.json"
    credentials_path.write_text(json.dumps(credentials, indent=2) + "\n")
    credentials_path.chmod(0o600)
    print(json.dumps({"url": URL, "users": ["syncplay-host", "syncplay-guest"], "password": PASSWORD, "items": credentials["items"], "credentialsFile": str(credentials_path)}, indent=2))


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT.parents[1]))
    main()
