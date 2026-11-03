"""Runs a Maestro flow on a device, with the environment variables the flow reads."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from bench.devices import Device


MASK = "[masqué]"
# A smoke flow takes a minute; a Maestro that cannot reach its device would otherwise hang a shell or a CI job.
DEFAULT_TIMEOUT_SECONDS = 900.0

JDK_CANDIDATES = (
    Path("/opt/homebrew/opt/openjdk@17"),
    Path("/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"),
    Path("/Applications/Android Studio.app/Contents/jbr/Contents/Home"),
)


def maestro_path() -> Path:
    found = shutil.which("maestro")
    return Path(found) if found else Path.home() / ".maestro" / "bin" / "maestro"


def resolve_java_home(env: dict[str, str], candidates: list[Path] | tuple[Path, ...] = JDK_CANDIDATES) -> str | None:
    """Maestro runs on the JVM; a JDK installed by Homebrew or Android Studio is invisible to java_home."""
    if env.get("JAVA_HOME"):
        return env["JAVA_HOME"]
    for candidate in candidates:
        if (Path(candidate) / "bin" / "java").exists():
            return str(candidate)
    return None


def build_command(flow: Path, device: str | None, env: dict[str, str], maestro: Path | None = None) -> list[str]:
    command = [str(maestro or maestro_path())]
    if device:
        command += ["--device", device]
    command.append("test")
    for key, value in env.items():
        command += ["-e", f"{key}={value}"]
    command.append(str(flow))
    return command


def describe_command(command: list[str]) -> str:
    """The command as echoed: a flow variable may carry a password, so its value never reaches a terminal or a CI log."""
    shown = []
    mask_next = False
    for token in command:
        if mask_next:
            key, _, _ = token.partition("=")
            shown.append(f"{key}={MASK}")
        else:
            shown.append(token)
        mask_next = token == "-e"
    return " ".join(shown)


# The simulators the app is built for: a watchOS or visionOS one would run the flow without it.
APP_SIMULATORS = ("ios-simulator", "tvos-simulator")


class NoDevice(Exception):
    """No device to run a flow on without --device: no emulator or simulator, or several."""


def discover() -> tuple[list[Device], list[str]]:
    """The Android devices and the booted simulators, with the error of each tool that failed."""
    from bench.devices import android_devices, collect, ios_simulators

    return collect(android_devices, lambda: ios_simulators(booted_only=True))


def pick_device(found: list[Device]) -> str:
    """The one emulator or simulator ready, for a run that names no device. A flow may clear the
    app's data, as the smoke flow does at launch, so a phone is used only when --device names it."""
    ready = [d for d in found if (d.kind == "android-emulator" and d.state == "device") or (d.kind in APP_SIMULATORS and d.state == "booted")]
    if len(ready) == 1:
        return ready[0].id
    if ready:
        raise NoDevice(f"several emulators and simulators are running ({', '.join(d.id for d in ready)}): name one with --device")
    phones = [d.id for d in found if not d.kind.endswith(("-emulator", "-simulator"))]
    if phones:
        raise NoDevice(f"no emulator or simulator is running, and {', '.join(phones)} runs a flow only when --device names it: a flow may clear the app's data")
    raise NoDevice("no emulator or simulator is running: start one, or name a device with --device")


def run_flow(command: list[str], env: dict[str, str], timeout: float) -> int:
    """Runs Maestro with a bound on its time; a stall ends with 124, as timeout(1) would."""
    try:
        return subprocess.run(command, check=False, env=env, timeout=timeout).returncode
    except subprocess.TimeoutExpired:
        print(f"maestro: no result after {timeout:g} s, stopped", file=sys.stderr)
        return 124


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--flow", required=True, type=Path)
    parser.add_argument("--device", help="adb serial or simulator udid; the one emulator or simulator running otherwise, never a phone")
    parser.add_argument("--env", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS, help="seconds before a stalled Maestro is stopped")
    args = parser.parse_args(argv)
    env = dict(entry.split("=", 1) for entry in args.env)
    device = args.device
    if not device:
        found, problems = discover()
        try:
            device = pick_device(found)
        except NoDevice as error:
            print(f"maestro: {error}", file=sys.stderr)
            for problem in problems:
                print(f"maestro: {problem}", file=sys.stderr)
            return 2
    command = build_command(args.flow, device, env)
    process_env = dict(os.environ)
    java_home = resolve_java_home(process_env)
    if java_home:
        process_env["JAVA_HOME"] = java_home
    print("$", describe_command(command))
    return run_flow(command, process_env, args.timeout)


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.exit(main())
