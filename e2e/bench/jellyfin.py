"""Minimal Jellyfin API client for the bench, standard library only."""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from bench.config import Account

CLIENT_NAME = "Streamyfin E2E bench"
DEVICE_ID_PREFIX = "streamyfin-e2e-bench"
CLIENT_VERSION = "1.0"
USER_AGENT = "Streamyfin-E2E-bench/1.0"


class JellyfinHttpError(Exception):
    def __init__(self, status: int, path: str, body: str = ""):
        super().__init__(f"HTTP {status} on {path}" + (f": {body[:200]}" if body else ""))
        self.status = status
        self.path = path


@dataclass(frozen=True)
class AuthSession:
    token: str
    user_id: str


class JellyfinClient:
    def __init__(self, url: str, client_name: str = CLIENT_NAME, device_id: str | None = None, timeout: float = 30.0):
        self.url = url.rstrip("/")
        self.client_name = client_name
        # One device id per client: Jellyfin revokes the previous token of a (user, device) pair
        # on sign-in, so two bench processes sharing an id would log each other out.
        self.device_id = device_id or f"{DEVICE_ID_PREFIX}-{uuid.uuid4().hex[:8]}"
        self.timeout = timeout

    def _authorization(self, token: str | None) -> str:
        parts = [f'Client="{self.client_name}"', 'Device="Bench"', f'DeviceId="{self.device_id}"', f'Version="{CLIENT_VERSION}"']
        if token:
            parts.append(f'Token="{token}"')
        return "MediaBrowser " + ", ".join(parts)

    def request(self, method: str, path: str, params: dict | None = None, body: Any = None, token: str | None = None) -> Any:
        query = f"?{urlencode(params)}" if params else ""
        # Cloudflare's browser integrity check refuses the default Python-urllib agent with a 403.
        headers = {"Authorization": self._authorization(token), "Accept": "application/json", "User-Agent": USER_AGENT}
        if token:
            headers["X-Emby-Token"] = token
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        request = Request(self.url + path + query, data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read()
        except HTTPError as error:
            raise JellyfinHttpError(error.code, path, _read_error(error)) from error
        return json.loads(raw) if raw else None

    def get(self, path: str, params: dict | None = None, token: str | None = None) -> Any:
        return self.request("GET", path, params=params, token=token)

    def post(self, path: str, body: Any = None, token: str | None = None, params: dict | None = None) -> Any:
        return self.request("POST", path, params=params, body=body, token=token)

    def public_info(self) -> dict:
        return self.get("/System/Info/Public")

    def authenticate(self, account: Account) -> AuthSession:
        result = self.post("/Users/AuthenticateByName", {"Username": account.username, "Pw": account.password})
        return AuthSession(token=result["AccessToken"], user_id=result["User"]["Id"])

    def logout(self, session: AuthSession) -> None:
        """Revoke the token so bench runs do not pile up devices on the server."""
        self.post("/Sessions/Logout", token=session.token)

    def find_item(self, session: AuthSession, query: str, include_types: tuple[str, ...] = ("Movie",)) -> dict | None:
        """Find a test library item by lab code (kept in its Tags) or by name prefix."""
        code = query.split(" ")[0]
        params = {
            "SearchTerm": code,
            "Recursive": "true",
            "IncludeItemTypes": ",".join(include_types),
            "Fields": "MediaSources,Path,Tags",
            "userId": session.user_id,
        }
        result = self.get("/Items", params=params, token=session.token)
        found = _match(result.get("Items", []), code, query)
        if found is None:
            # Jellyfin 10.11 does not search tags; the Tags filter works on every version.
            params = {**params, "Tags": code}
            del params["SearchTerm"]
            found = _match(self.get("/Items", params=params, token=session.token).get("Items", []), code, query)
        return found

    def sessions(self, token: str) -> list[dict]:
        return self.get("/Sessions", token=token) or []

    def channels(self, session: AuthSession) -> list[dict]:
        result = self.get("/LiveTv/Channels", params={"userId": session.user_id}, token=session.token)
        return result.get("Items", []) if isinstance(result, dict) else []


def _match(items: list[dict], code: str, query: str) -> dict | None:
    # A bare code only matches its tag: "V01" must not pick "V010 · something" by name.
    for item in items:
        if code in item.get("Tags", []) or (query != code and item.get("Name", "").startswith(query)):
            return item
    return None


def _read_error(error: HTTPError) -> str:
    try:
        return error.read().decode(errors="replace")
    except Exception:  # noqa: BLE001 - the body is only a hint for the message
        return ""
