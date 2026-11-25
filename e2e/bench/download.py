"""Download a pinned asset and verify its digest before returning its bytes."""

from __future__ import annotations

import hashlib
import urllib.request


def fetch_verified(
    url: str,
    digest: str,
    name: str,
    timeout: float,
    algorithm: str = "sha256",
) -> bytes:
    """Fetch url within timeout seconds and return its body if its hex digest matches.

    The digest is SHA-256 unless algorithm names another hashlib algorithm, such as the
    MD5 a Jellyfin plugin manifest publishes.
    """
    with urllib.request.urlopen(url, timeout=timeout) as response:
        payload = response.read()
    if hashlib.new(algorithm, payload).hexdigest() != digest:
        raise RuntimeError(f"{name} download checksum mismatch; nothing installed")
    return payload
