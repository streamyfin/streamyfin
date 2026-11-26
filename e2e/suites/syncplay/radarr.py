"""Set up this checkout's throwaway Radarr and register it in Seerr.

Radarr gets two root folders. `movies` is a real folder. `movies-offline` is registered,
then its folder is deleted, so Radarr lists it as inaccessible and without `freeSpace`.
Seerr passes that shape through `/api/v1/service/radarr/:id` unchanged. It is Seerr's
default folder, so every request modal opens on it: a client that reads `freeSpace`
unguarded fails there.

The endpoints are Radarr v3's API, as Radarr 7.0.3 serves it.
"""

import secrets
import shutil
import time
import urllib.request
from xml.etree import ElementTree

from suites.syncplay import seerr, setup

READY_ATTEMPTS = 90
READY_DELAY_SECONDS = 2
CONTAINER_PORT = 7878
SCANNED_FOLDER = "movies"
OFFLINE_FOLDER = "movies-offline"
QUALITY_PROFILE = "Any"
SEERR_SERVER_NAME = "Radarr"

# Radarr keeps every setting it is not given at its default and rewrites the file at
# first start. External authentication leaves the API key as the only credential.
CONFIG_XML = """<Config>
  <BindAddress>{bind}</BindAddress>
  <Port>{port}</Port>
  <ApiKey>{api_key}</ApiKey>
  <AuthenticationMethod>External</AuthenticationMethod>
  <AuthenticationRequired>DisabledForLocalAddresses</AuthenticationRequired>
  <AnalyticsEnabled>False</AnalyticsEnabled>
  <LaunchBrowser>False</LaunchBrowser>
</Config>
"""


def config_dir():
    return setup.STATE / "radarr"


def media_dir():
    """The host folder that holds both root folders, mounted at /radarr-media under Docker."""
    return setup.STATE / "radarr-media"


def write_config(bind, port):
    """Write config.xml with a fresh API key, only when absent: after its first start the file is Radarr's."""
    path = config_dir() / "config.xml"
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(CONFIG_XML.format(bind=bind, port=port, api_key=secrets.token_hex(16)))
    path.chmod(0o600)


def api_key():
    key = ElementTree.parse(config_dir() / "config.xml").getroot().findtext("ApiKey")
    if not key:
        raise RuntimeError(f"{config_dir() / 'config.xml'} has no ApiKey")
    return key


def base_url(owned):
    return f"http://127.0.0.1:{owned['SYNCPLAY_RADARR_PORT']}"


def new_session(key):
    """An opener that sends the API key, Radarr's only credential, on every request."""
    opener = urllib.request.build_opener()
    opener.addheaders = [("X-Api-Key", key)]
    return opener


def wait_for_ready(opener, url):
    for _ in range(READY_ATTEMPTS):
        try:
            return seerr.request(opener, url, "/api/v3/system/status")
        except OSError:
            time.sleep(READY_DELAY_SECONDS)
    raise RuntimeError(f"Radarr at {url} did not become ready within {READY_ATTEMPTS * READY_DELAY_SECONDS} seconds")


def ensure_root_folders(opener, url, servers):
    """Register both root folders, then delete the offline one's folder.

    Radarr refuses a folder that does not exist or that it cannot write, so each is
    created open to the container's user first. A rerun recreates the offline folder
    only when it still has to be registered.
    """
    paths = {name: servers.radarr_path(name) for name in (SCANNED_FOLDER, OFFLINE_FOLDER)}
    registered = {folder["path"] for folder in seerr.request(opener, url, "/api/v3/rootfolder")}
    for name, path in paths.items():
        if path in registered:
            continue
        folder = media_dir() / name
        folder.mkdir(parents=True, exist_ok=True)
        folder.chmod(0o777)
        seerr.request(opener, url, "/api/v3/rootfolder", "POST", {"path": path})
    offline = media_dir() / OFFLINE_FOLDER
    if offline.exists():
        shutil.rmtree(offline)
    listed = {folder["path"]: folder for folder in seerr.request(opener, url, "/api/v3/rootfolder")}
    if "freeSpace" in listed[paths[OFFLINE_FOLDER]]:
        raise RuntimeError(f"Radarr still reports freeSpace for {paths[OFFLINE_FOLDER]!r} after its folder was deleted")


def quality_profile(opener, url):
    for profile in seerr.request(opener, url, "/api/v3/qualityprofile"):
        if profile.get("name") == QUALITY_PROFILE:
            return profile
    raise RuntimeError(f"Radarr has no {QUALITY_PROFILE!r} quality profile")


def ensure_ready(owned, servers, username, password):
    """Wait for Radarr, register its root folders, and add it to Seerr as the default server."""
    url = base_url(owned)
    key = api_key()
    opener = new_session(key)
    wait_for_ready(opener, url)
    ensure_root_folders(opener, url, servers)
    profile = quality_profile(opener, url)
    hostname, port = servers.radarr_address_for_seerr(owned)
    seerr.ensure_radarr(owned, username, password, {
        "name": SEERR_SERVER_NAME,
        "hostname": hostname,
        "port": port,
        "apiKey": key,
        "useSsl": False,
        "baseUrl": "",
        "activeProfileId": profile["id"],
        "activeProfileName": profile["name"],
        "activeDirectory": servers.radarr_path(OFFLINE_FOLDER),
        "is4k": False,
        "minimumAvailability": "released",
        "tags": [],
        "isDefault": True,
        "syncEnabled": False,
        "preventSearch": True,
    })

