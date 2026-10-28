"""Inventory of the devices a bench run can drive: Android, iOS simulators and devices, Chromecasts.

Apple TV and other AirPlay receivers are not listed: AirPlay does not expose a device list,
the system route picker does the choosing.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path

if __name__ == "__main__":
    # Run as `python3 e2e/bench/devices.py`: put `e2e/` on the path so `bench.*` imports work.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from bench.config import CastTarget  # noqa: E402

COMMAND_TIMEOUT = 20.0
CAST_PORT = 8009


@dataclass(frozen=True)
class Device:
    kind: str
    id: str
    name: str
    state: str
    platform: str


def adb_path() -> Path:
    for variable in ("ANDROID_HOME", "ANDROID_SDK_ROOT"):
        if os.environ.get(variable):
            return Path(os.environ[variable]) / "platform-tools" / "adb"
    return Path.home() / "Library/Android/sdk/platform-tools/adb"


def emulator_path() -> Path:
    return adb_path().parents[1] / "emulator" / "emulator"


def _run(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True, timeout=COMMAND_TIMEOUT, check=False)
    return result.stdout


def parse_adb_devices(text: str) -> list[Device]:
    devices = []
    for line in text.splitlines():
        if not line.strip() or line.startswith("List of devices"):
            continue
        identifier, state, *details = line.split()
        model = next((item.split(":", 1)[1] for item in details if item.startswith("model:")), identifier)
        kind = "android-emulator" if identifier.startswith("emulator-") else "android-device"
        devices.append(Device(kind=kind, id=identifier, name=model, state=state, platform="android"))
    return devices


def android_devices(adb: Path | None = None) -> list[Device]:
    return parse_adb_devices(_run([str(adb or adb_path()), "devices", "-l"]))


def parse_avds(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip() and not line.startswith("INFO")]


def android_avds(emulator: Path | None = None) -> list[str]:
    return parse_avds(_run([str(emulator or emulator_path()), "-list-avds"]))


def parse_simctl(text: str, booted_only: bool = False) -> list[Device]:
    devices = []
    for runtime, entries in json.loads(text).get("devices", {}).items():
        platform = runtime.rsplit(".", 1)[-1].split("-")[0].lower()
        for entry in entries:
            if not entry.get("isAvailable", False):
                continue
            if booted_only and entry.get("state") != "Booted":
                continue
            devices.append(
                Device(kind=f"{platform}-simulator", id=entry["udid"], name=entry["name"], state=entry.get("state", "").lower(), platform=platform)
            )
    return devices


def ios_simulators(booted_only: bool = False) -> list[Device]:
    return parse_simctl(_run(["xcrun", "simctl", "list", "devices", "--json"]), booted_only=booted_only)


def ios_devices() -> list[Device]:
    """Physical Apple devices known to Xcode (devicectl); empty when the tool is unavailable."""
    with tempfile.NamedTemporaryFile(suffix=".json") as output:
        try:
            subprocess.run(["xcrun", "devicectl", "list", "devices", "--json-output", output.name], capture_output=True, timeout=COMMAND_TIMEOUT, check=False)
            payload = json.loads(Path(output.name).read_text() or "{}")
        except (OSError, ValueError, subprocess.SubprocessError):
            return []
    return parse_devicectl(payload)


def parse_devicectl(payload: dict) -> list[Device]:
    devices = []
    for entry in payload.get("result", {}).get("devices", []):
        properties = entry.get("deviceProperties", {})
        hardware = entry.get("hardwareProperties", {})
        # devicectl also lists simulators; simctl already covers those.
        if hardware.get("reality") != "physical":
            continue
        devices.append(
            Device(
                kind="ios-device",
                id=entry.get("identifier", ""),
                name=properties.get("name", hardware.get("marketingName", "")),
                state=entry.get("connectionProperties", {}).get("tunnelState", "unknown").lower(),
                platform=hardware.get("platform", "ios").lower(),
            )
        )
    return devices


def _connect_chromecast(host: str, timeout: float) -> dict:
    import pychromecast  # imported here so the inventory works without the package for everything else

    cast = pychromecast.get_chromecast_from_host((host, CAST_PORT, None, None, None), timeout=timeout)
    try:
        cast.wait(timeout=timeout)
        return {"friendly_name": cast.cast_info.friendly_name, "app": cast.app_display_name or "idle"}
    finally:
        cast.disconnect(timeout=timeout)


def chromecasts(targets: list[CastTarget], timeout: float = 5.0) -> list[Device]:
    devices = []
    for target in targets:
        try:
            info = _connect_chromecast(target.host, timeout)
            # Connecting by address skips discovery, so the friendly name may be unknown.
            name = info.get("friendly_name") or target.name
            devices.append(Device(kind="chromecast", id=target.host, name=f"{name} ({info['app']})", state="reachable", platform="cast"))
        except Exception:  # noqa: BLE001 - an unreachable target is a result, not a crash
            devices.append(Device(kind="chromecast", id=target.host, name=target.name, state="unreachable", platform="cast"))
    return devices


def inventory(targets: list[CastTarget], cast_timeout: float = 5.0) -> list[Device]:
    found: list[Device] = []
    for collect in (android_devices, lambda: ios_simulators(booted_only=False), ios_devices):
        try:
            found.extend(collect())
        except (OSError, subprocess.SubprocessError, ValueError):
            continue
    found.extend(chromecasts(targets, timeout=cast_timeout))
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--cast-timeout", type=float, default=5.0)
    args = parser.parse_args(argv)

    from bench.config import load_config

    config = load_config()
    devices = inventory(config.targets.chromecasts, cast_timeout=args.cast_timeout)
    if args.json:
        print(json.dumps([asdict(d) for d in devices], indent=2))
    else:
        for device in devices:
            print(f"{device.kind:16} {device.state:12} {device.id:40} {device.name}")
        print("Apple TV and AirPlay receivers: not enumerable, picked in the system route picker.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
