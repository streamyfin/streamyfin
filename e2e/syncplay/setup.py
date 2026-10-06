#!/usr/bin/env python3
"""Create an isolated local Jellyfin with generated public-domain test media."""

import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent
STATE = ROOT / ".state"
URL = f"http://127.0.0.1:{os.environ.get('SYNCPLAY_PORT', '18096')}"
PASSWORD = "SyncPlay-local-2026"
AUTH = 'MediaBrowser Client="SyncPlay E2E setup", Device="Local", DeviceId="syncplay-setup", Version="1.0"'


def api(path, method="GET", data=None, token=None):
    headers = {"Authorization": AUTH, "Content-Type": "application/json"}
    if token:
        headers["X-Emby-Token"] = token
    body = json.dumps(data).encode() if data is not None else None
    request = urllib.request.Request(URL + path, body, headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        result = response.read()
        return json.loads(result) if result else None


def wait_for_server():
    for _ in range(90):
        try:
            info = api("/System/Info/Public")
            with urllib.request.urlopen(URL + "/health", timeout=5) as response:
                if response.read().decode() == "Healthy":
                    return info
        except (OSError, urllib.error.URLError):
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
    generate_media()
    (STATE / "config").mkdir(exist_ok=True)
    (STATE / "cache").mkdir(exist_ok=True)
    subprocess.run(["docker", "compose", "-f", str(ROOT / "compose.yml"), "up", "-d"], check=True)
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
    if not any(folder["Name"] == "SyncPlay Fixtures" for folder in folders):
        query = urllib.parse.urlencode({"name": "SyncPlay Fixtures", "collectionType": "movies", "refreshLibrary": "true"})
        api("/Library/VirtualFolders?" + query, "POST", {
            "LibraryOptions": {
                "PathInfos": [{"Path": "/media"}], "EnableRealtimeMonitor": False,
                "EnableInternetProviders": False, "EnableChapterImageExtraction": False,
                "EnableTrickplayImageExtraction": False,
                "TypeOptions": [{"Type": "Movie", "MetadataFetchers": [], "ImageFetchers": []}],
            }
        }, token)
    api("/Library/Refresh", "POST", token=token)
    items = []
    for _ in range(90):
        items = api(f"/Users/{host['User']['Id']}/Items?Recursive=true&IncludeItemTypes=Movie&Fields=MediaSources", token=token)["Items"]
        if len(items) >= 3:
            break
        time.sleep(2)
    if len(items) < 3:
        raise RuntimeError("Expected three generated media items after scanning")
    guest_auth = api("/Users/AuthenticateByName", "POST", {"Username": "syncplay-guest", "Pw": PASSWORD})
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
    main()
