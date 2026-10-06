#!/usr/bin/env python3
"""Start a dedicated Android test emulator without changing existing AVD data."""
import os
from pathlib import Path
import subprocess

sdk = Path(os.environ.get("ANDROID_HOME", str(Path.home() / "Library/Android/sdk")))
avd_home = Path("/private/tmp/streamyfin-syncplay-avd-home")
avd = avd_home / "StreamyfinSyncPlay.avd"
avd.mkdir(parents=True, exist_ok=True)
config = {
    "AvdId": "StreamyfinSyncPlay", "avd.ini.displayname": "Streamyfin SyncPlay",
    "avd.ini.encoding": "UTF-8", "abi.type": "arm64-v8a",
    "image.sysdir.1": "system-images/android-36/google_apis_playstore/arm64-v8a/",
    "tag.id": "google_apis_playstore", "tag.display": "Google Play",
    "PlayStore.enabled": "true", "hw.cpu.arch": "arm64", "hw.cpu.ncore": "2",
    "hw.ramSize": "3072", "vm.heapSize": "256", "hw.keyboard": "yes",
    "hw.gpu.enabled": "yes", "hw.gpu.mode": "host", "hw.initialOrientation": "portrait",
    "hw.lcd.width": "720", "hw.lcd.height": "1600", "hw.lcd.density": "320",
    "hw.battery": "yes", "hw.accelerometer": "yes", "hw.gps": "yes",
    "hw.sdCard": "no", "hw.mainKeys": "no", "disk.dataPartition.size": "2147483648",
    "fastboot.forceColdBoot": "yes", "showDeviceFrame": "no",
    "skin.dynamic": "yes", "skin.name": "720x1600",
}
(avd / "config.ini").write_text("".join(f"{key}={value}\n" for key, value in config.items()))
(avd_home / "StreamyfinSyncPlay.ini").write_text(f"avd.ini.encoding=UTF-8\npath={avd}\ntarget=android-36\n")
env = {**os.environ, "ANDROID_AVD_HOME": str(avd_home), "ANDROID_HOME": str(sdk)}
raise SystemExit(subprocess.call([str(sdk / "emulator/emulator"), "-avd", "StreamyfinSyncPlay",
    "-port", "5580", "-no-snapshot", "-gpu", "host", "-memory", "3072"], env=env))
