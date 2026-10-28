"""Runs a Maestro flow on a device, with the environment variables the flow reads."""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--flow", required=True, type=Path)
    parser.add_argument("--device", help="adb serial or simulator udid; Maestro picks the only connected device otherwise")
    parser.add_argument("--env", action="append", default=[], metavar="KEY=VALUE")
    args = parser.parse_args(argv)
    env = dict(entry.split("=", 1) for entry in args.env)
    command = build_command(args.flow, args.device, env)
    process_env = dict(os.environ)
    java_home = resolve_java_home(process_env)
    if java_home:
        process_env["JAVA_HOME"] = java_home
    print("$", " ".join(command))
    return subprocess.run(command, check=False, env=process_env).returncode


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.exit(main())
