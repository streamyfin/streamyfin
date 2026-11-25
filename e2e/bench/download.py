"""Download a pinned asset and verify its SHA-256 digest before returning its bytes."""

from __future__ import annotations

import hashlib
import urllib.request


def fetch_verified(
    url: str,
    sha256: str,
    name: str,
    timeout: float,
) -> bytes:
    """Fetch url within timeout seconds and return its body if its SHA-256 hex digest matches."""
    with urllib.request.urlopen(url, timeout=timeout) as response:
        payload = response.read()
    if hashlib.sha256(payload).hexdigest() != sha256:
        raise RuntimeError(f"{name} download checksum mismatch; nothing installed")
    return payload
