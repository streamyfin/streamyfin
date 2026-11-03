import os
import unittest
from pathlib import Path
from unittest import mock

from bench.config import CastTarget
from bench.config import BenchConfigError
from bench.devices import Device, adb_path, chromecasts, configured_targets, inventory, parse_adb_devices, parse_avds, parse_devicectl, parse_simctl

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class AndroidTests(unittest.TestCase):
    def test_parse_adb_devices_skips_header_and_offline(self):
        devices = parse_adb_devices((FIXTURES / "adb-devices.txt").read_text())
        self.assertEqual([d.id for d in devices], ["emulator-5554", "R58M12ABCDE", "0A1B2C3D", "9Z8Y7X6W"])
        self.assertEqual([d.state for d in devices], ["device", "device", "offline", "unauthorized"])
        self.assertEqual(devices[0].kind, "android-emulator")
        self.assertEqual(devices[1].kind, "android-device")
        self.assertEqual(devices[1].name, "SM_G973F")

    def test_parse_avds_lists_names(self):
        self.assertEqual(parse_avds("Medium_Phone\nReview_Phone\n\nTelevision_4K\n"), ["Medium_Phone", "Review_Phone", "Television_4K"])

    def test_adb_path_prefers_environment_then_default_sdk(self):
        with mock.patch.dict(os.environ, {"ANDROID_HOME": "/opt/sdk", "ANDROID_SDK_ROOT": "/other"}):
            self.assertEqual(adb_path(), Path("/opt/sdk/platform-tools/adb"))
        with mock.patch.dict(os.environ, {"ANDROID_HOME": "", "ANDROID_SDK_ROOT": "/other"}):
            self.assertEqual(adb_path(), Path("/other/platform-tools/adb"))
        with mock.patch.dict(os.environ, {"ANDROID_HOME": "", "ANDROID_SDK_ROOT": ""}):
            self.assertEqual(adb_path(), Path.home() / "Library/Android/sdk/platform-tools/adb")


class SimulatorTests(unittest.TestCase):
    def test_parse_simctl_json_filters_booted(self):
        text = (FIXTURES / "simctl-devices.json").read_text()
        all_devices = parse_simctl(text)
        self.assertEqual([d.id for d in all_devices], ["AAAA-1111", "BBBB-2222", "DDDD-4444"])
        self.assertEqual(all_devices[0].platform, "ios")
        self.assertEqual(all_devices[2].platform, "tvos")
        booted = parse_simctl(text, booted_only=True)
        self.assertEqual([d.name for d in booted], ["iPhone 17 Pro"])
        self.assertEqual(booted[0].kind, "ios-simulator")


class DevicectlTests(unittest.TestCase):
    def test_parse_devicectl_keeps_physical_devices_only(self):
        # devicectl lists simulators too (reality "simulated"); the inventory already has them from simctl.
        payload = {
            "result": {
                "devices": [
                    {"identifier": "SIM-1", "hardwareProperties": {"platform": "iOS", "reality": "simulated"}, "deviceProperties": {"name": "iPhone 17 Pro"}, "connectionProperties": {"tunnelState": "disconnected"}},
                    {"identifier": "PHY-1", "hardwareProperties": {"platform": "iOS", "reality": "physical", "marketingName": "iPhone 15"}, "deviceProperties": {"name": "My iPhone"}, "connectionProperties": {"tunnelState": "connected"}},
                ]
            }
        }
        devices = parse_devicectl(payload)
        self.assertEqual(devices, [Device(kind="ios-device", id="PHY-1", name="My iPhone", state="connected", platform="ios")])


class ScriptTests(unittest.TestCase):
    def test_runs_as_a_script_from_the_repository_root(self):
        import subprocess
        import sys

        script = Path(__file__).resolve().parents[1] / "devices.py"
        result = subprocess.run([sys.executable, str(script), "--help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--cast-timeout", result.stdout)


class ChromecastTests(unittest.TestCase):
    def test_chromecast_unreachable_is_reported_not_raised(self):
        target = CastTarget(name="Salon", host="192.0.2.10", kind="chromecast-gen3")
        with mock.patch("bench.devices._connect_chromecast", side_effect=OSError("no route")):
            [device] = chromecasts([target], timeout=0.1)
        self.assertEqual(device, Device(kind="chromecast", id="192.0.2.10", name="Salon", state="unreachable", platform="cast"))

    def test_chromecast_reachable_without_friendly_name_uses_the_configured_name(self):
        # Connecting by address skips discovery, so the SDK may not know the friendly name.
        target = CastTarget(name="Salon", host="192.0.2.10", kind="chromecast-gen3")
        with mock.patch("bench.devices._connect_chromecast", return_value={"friendly_name": None, "app": "Backdrop"}):
            [device] = chromecasts([target], timeout=0.1)
        self.assertEqual(device.name, "Salon (Backdrop)")

    def test_chromecast_reachable_reports_the_receiver_status(self):
        target = CastTarget(name="Salon", host="192.0.2.10", kind="chromecast-gen3")
        with mock.patch("bench.devices._connect_chromecast", return_value={"friendly_name": "Salon - Chromecast", "app": "Backdrop"}):
            [device] = chromecasts([target], timeout=0.1)
        self.assertEqual(device.state, "reachable")
        self.assertIn("Backdrop", device.name)


class ChromecastSetupTests(unittest.TestCase):
    def test_missing_pychromecast_is_its_own_state(self):
        target = CastTarget(name="Salon", host="192.0.2.10", kind="chromecast-gen3")
        with mock.patch("bench.devices._connect_chromecast", side_effect=ImportError("No module named 'pychromecast'")):
            [device] = chromecasts([target])
        self.assertEqual(device.state, "unavailable")
        self.assertEqual(device.name, "Salon (pychromecast not installed)")

    def test_configured_targets_are_empty_without_a_configuration(self):
        import io
        from contextlib import redirect_stderr

        def missing():
            raise BenchConfigError("no bench configuration at e2e/bench/config.local.json")

        errors = io.StringIO()
        with redirect_stderr(errors):
            self.assertEqual(configured_targets(load=missing), [])
        self.assertIn("Cast targets are skipped", errors.getvalue())


class DiscoveryFailureTests(unittest.TestCase):
    # adb or simctl failing used to print an empty list, as if nothing was attached.
    def inventory_errors(self, **run) -> str:
        import io
        from contextlib import redirect_stderr

        errors = io.StringIO()
        with mock.patch("bench.devices.subprocess.run", **run), mock.patch("bench.devices.ios_devices", return_value=[]), redirect_stderr(errors):
            self.assertEqual(inventory([]), [])
        return errors.getvalue()

    def test_a_tool_that_fails_is_reported_with_its_error(self):
        import subprocess

        failed = subprocess.CompletedProcess(["adb"], 1, stdout="", stderr="adb: failed to start daemon\n")
        errors = self.inventory_errors(return_value=failed)
        self.assertIn("adb devices -l", errors)
        self.assertIn("failed to start daemon", errors)
        self.assertIn("xcrun simctl list devices --json", errors)

    def test_a_missing_tool_is_reported(self):
        errors = self.inventory_errors(side_effect=FileNotFoundError(2, "No such file or directory"))
        self.assertIn("adb devices -l", errors)
        self.assertIn("No such file or directory", errors)

if __name__ == "__main__":
    unittest.main()
