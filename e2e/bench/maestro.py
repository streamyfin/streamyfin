"""Runs a Maestro flow on a device, with the environment variables the flow reads."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def maestro_path() -> Path:
    found = shutil.which("maestro")
    return Path(found) if found else Path.home() / ".maestro" / "bin" / "maestro"


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
    print("$", " ".join(command))
    return subprocess.run(command, check=False).returncode


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    sys.exit(main())
