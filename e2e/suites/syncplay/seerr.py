"""Onboard and configure this checkout's throwaway Seerr against its Jellyfin.

The endpoints below are Seerr v3.5.0's; /settings/public answers without a session,
everything else rides the cookie the Jellyfin login sets, so one opener keeps the jar.
"""

import http.cookiejar
import json
import time
import urllib.request

READY_ATTEMPTS = 90
READY_DELAY_SECONDS = 2
MEDIA_SERVER_TYPE_JELLYFIN = 2
FIXTURE_LIBRARY = "SyncPlay Fixtures"


def base_url(owned):
    return f"http://127.0.0.1:{owned['SYNCPLAY_SEERR_PORT']}"


def new_session():
    """An opener whose cookie jar keeps the admin session Seerr sets at login."""
    jar = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def request(opener, url, path, method="GET", data=None):
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    call = urllib.request.Request(url + path, body, headers, method=method)
    with opener.open(call, timeout=30) as response:
        result = response.read()
        return json.loads(result) if result else None


def wait_for_public(opener, url):
    """Seerr refuses connections until its server binds; the public settings answer first."""
    for _ in range(READY_ATTEMPTS):
        try:
            return request(opener, url, "/api/v1/settings/public")
        except OSError:
            time.sleep(READY_DELAY_SECONDS)
    raise RuntimeError(f"Seerr at {url} did not become ready within {READY_ATTEMPTS * READY_DELAY_SECONDS} seconds")


def login(opener, url, username, password, jellyfin=None):
    """Sign in to Seerr through Jellyfin; jellyfin, a (hostname, port) pair, onboards it first."""
    body = {"username": username, "password": password}
    if jellyfin is not None:
        # Seerr only accepts a hostname while none is saved; sending one on a rerun is a 500.
        hostname, port = jellyfin
        body.update({
            "hostname": hostname,
            "port": port,
            "useSsl": False,
            "urlBase": "",
            "email": f"{username}@localhost",
            "serverType": MEDIA_SERVER_TYPE_JELLYFIN,
        })
    request(opener, url, "/api/v1/auth/jellyfin", "POST", body)


def enable_named(opener, url, names):
    """Sync Jellyfin's folders into Seerr's list, then enable each named one by its id.
    A missing name aborts before any library is touched."""
    libraries = request(opener, url, "/api/v1/settings/jellyfin/library/sync", "POST")
    known = {library.get("name"): library for library in libraries}
    missing = [name for name in names if name not in known]
    if missing:
        raise RuntimeError(f"Seerr synced no {missing[0]!r} library (got {sorted(known)}); is the Jellyfin catalog seeded?")
    for name in names:
        updated = request(opener, url, f"/api/v1/settings/jellyfin/library/{known[name]['id']}", "PUT", {"enabled": True})
        if not updated.get("enabled"):
            raise RuntimeError(f"Seerr did not enable the {name!r} library")
    return libraries


def ensure_radarr(owned, username, password, server):
    """Add the Radarr server once, matched by name. A rerun leaves a saved one as it is."""
    url = base_url(owned)
    opener = new_session()
    login(opener, url, username, password)
    saved = request(opener, url, "/api/v1/settings/radarr")
    if any(entry.get("name") == server["name"] for entry in saved):
        return
    request(opener, url, "/api/v1/settings/radarr", "POST", server)


def ensure_ready(owned, username, password):
    """Idempotent onboarding: first run connects Jellyfin and enables the fixture library;
    a rerun just proves the owner login still works."""
    from suites.syncplay import setup

    url = base_url(owned)
    opener = new_session()
    public = wait_for_public(opener, url)
    if public.get("initialized"):
        login(opener, url, username, password)
        return
    # Seerr saves settings.jellyfin.ip at first login, before initialize; a retry of an
    # unfinished run must not send a hostname — the saved ip makes it a 500.
    try:
        configured_ip = json.loads((setup.STATE / "seerr" / "settings.json").read_text()).get("jellyfin", {}).get("ip")
    except FileNotFoundError:
        configured_ip = None
    jellyfin = None if configured_ip else setup.backend(owned).jellyfin_address_for_seerr(owned)
    login(opener, url, username, password, jellyfin=jellyfin)
    enable_named(opener, url, (FIXTURE_LIBRARY,))
    request(opener, url, "/api/v1/settings/initialize", "POST")
    if not request(opener, url, "/api/v1/settings/public").get("initialized"):
        raise RuntimeError("Seerr initialization did not stick: /api/v1/settings/public still reports initialized=false")
