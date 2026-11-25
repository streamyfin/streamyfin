"""Variables a Maestro flow reads to sign in to this checkout's throwaway Jellyfin."""

import json

from suites.syncplay import setup


def maestro_env():
    """SERVER_URL works on an iOS simulator, or an Android emulator after `adb reverse`;
    ANDROID_SERVER_URL needs no adb reverse because 10.0.2.2 is the emulator's host loopback."""
    path = setup.STATE / "credentials.json"
    if not path.is_file():
        raise RuntimeError(f"{path} is missing; run setup.py first")
    credentials = json.loads(path.read_text())
    port = credentials["url"].rsplit(":", 1)[1]
    return {
        "SERVER_URL": credentials["url"],
        "ANDROID_SERVER_URL": f"http://10.0.2.2:{port}",
        "USERNAME": credentials["host"]["name"],
        "GUEST_USERNAME": credentials["guest"]["name"],
        "PASSWORD": credentials["password"],
    }
