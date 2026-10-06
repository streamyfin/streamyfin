#!/usr/bin/env python3
"""Give the official Qt emulator a local macOS app identity for CUA testing.

Prepares a copy only. Does not stop, launch, or modify any installed emulator.
"""

import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys


def main():
    if sys.platform != "darwin":
        raise SystemExit("This local CUA bundle is for macOS only")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", type=Path, default=Path(os.environ.get(
        "ANDROID_HOME", str(Path.home() / "Library/Android/sdk"))))
    parser.add_argument("--output", type=Path, default=Path(
        "/private/tmp/Streamyfin Native Android.app"))
    args = parser.parse_args()
    sdk = args.sdk.resolve()
    architecture = "aarch64" if os.uname().machine == "arm64" else "x86_64"
    source = sdk / f"emulator/qemu/darwin-{architecture}/qemu-system-{architecture}"
    if not source.is_file():
        raise SystemExit(f"Official emulator binary missing: {source}")
    executable = args.output.resolve() / "Contents/MacOS/StreamyfinAndroid"
    try:
        processes = subprocess.check_output(["ps", "-axo", "command="], text=True)
    except (OSError, subprocess.CalledProcessError):
        raise SystemExit("Cannot verify running emulators; preserved without changes")
    if any(line.lstrip().startswith(str(executable)) for line in processes.splitlines()):
        raise SystemExit("Prepared emulator is running; preserved without changes")
    executable.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, executable)
    environment = {
        "ANDROID_HOME": str(sdk),
        "ANDROID_SDK_ROOT": str(sdk),
        "ANDROID_AVD_HOME": "/private/tmp/streamyfin-syncplay-avd-home",
        "ANDROID_EMULATOR_LAUNCHER_DIR": str(sdk / "emulator"),
        "ANDROID_EMULATOR_PREBUILTS_DIR": str(sdk / "emulator"),
        "QT_PLUGIN_PATH": str(sdk / "emulator/lib64/qt/plugins"),
    }
    info = {
        "CFBundleName": "Streamyfin Native Android",
        "CFBundleDisplayName": "Streamyfin Native Android",
        "CFBundleIdentifier": "local.streamyfin.nativeandroid",
        "CFBundleExecutable": executable.name,
        "CFBundlePackageType": "APPL",
        "CFBundleVersion": "1",
        "CFBundleShortVersionString": "1.0",
        "NSHighResolutionCapable": True,
        "LSEnvironment": environment,
    }
    (executable.parent.parent / "Info.plist").write_bytes(plistlib.dumps(info))
    for directory in [sdk / "emulator/lib64", sdk / "emulator/lib64/qt/lib"]:
        subprocess.run(["install_name_tool", "-add_rpath", str(directory),
                        str(executable)], check=True)
    # Retain the official binary's Hypervisor/JIT permissions on this local copy.
    subprocess.run(["codesign", "--force", "--sign", "-",
                    "--preserve-metadata=entitlements,flags",
                    str(args.output.resolve())], check=True)
    print(f"Prepared {args.output.resolve()}; installed SDK unchanged")
    print("Launch this bundle with the existing SyncPlay AVD and explicit arguments.")


if __name__ == "__main__":
    main()
