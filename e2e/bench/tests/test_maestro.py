import io
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from bench.devices import Device
from bench.maestro import NoDevice, build_command, describe_command, main, maestro_path, pick_device, resolve_java_home, run_flow

PHONE = Device(kind="android-device", id="R58M12ABCDE", name="SM_G973F", state="device", platform="android")
EMULATOR = Device(kind="android-emulator", id="emulator-5554", name="sdk_gphone64", state="device", platform="android")
SIMULATOR = Device(kind="ios-simulator", id="0F1E2D3C-UDID", name="iPhone 17", state="booted", platform="ios")


class BuildCommandTests(unittest.TestCase):
    def test_build_command_without_device(self):
        command = build_command(Path("e2e/suites/cast/flows/smoke-launch.yml"), device=None, env={}, maestro=Path("/opt/maestro"))
        self.assertEqual(command, ["/opt/maestro", "test", "e2e/suites/cast/flows/smoke-launch.yml"])

    def test_build_command_with_device_and_env(self):
        command = build_command(
            Path("flow.yml"), device="emulator-5554", env={"SERVER_URL": "http://x", "FAKE_CAST": "1"}, maestro=Path("/opt/maestro")
        )
        self.assertEqual(
            command,
            ["/opt/maestro", "--device", "emulator-5554", "test", "-e", "SERVER_URL=http://x", "-e", "FAKE_CAST=1", "flow.yml"],
        )

    def test_default_maestro_path_is_the_user_install(self):
        from unittest import mock

        with mock.patch("bench.maestro.shutil.which", return_value=None):
            self.assertEqual(maestro_path(), Path.home() / ".maestro" / "bin" / "maestro")
        with mock.patch("bench.maestro.shutil.which", return_value="/usr/local/bin/maestro"):
            self.assertEqual(maestro_path(), Path("/usr/local/bin/maestro"))


class RunTests(unittest.TestCase):
    # A flow can take its credentials through -e; the echoed command must not spell them out.
    def test_describe_command_masks_every_environment_value(self):
        command = ["/opt/maestro", "test", "-e", "PASSWORD=hunter2", "-e", "SERVER_URL=http://x", "flow.yml"]
        self.assertEqual(describe_command(command), "/opt/maestro test -e PASSWORD=[masqué] -e SERVER_URL=[masqué] flow.yml")

    def test_run_flow_returns_124_when_maestro_stalls(self):
        import os

        self.assertEqual(run_flow(["sleep", "5"], dict(os.environ), timeout=0.2), 124)

    def test_run_flow_returns_the_process_code(self):
        import os

        self.assertEqual(run_flow(["true"], dict(os.environ), timeout=5), 0)


class JavaHomeTests(unittest.TestCase):
    # Maestro is a JVM program; on a Mac whose JDK comes from Homebrew or Android Studio,
    # java_home does not know it and Maestro dies with "Unable to locate a Java Runtime".
    def test_keeps_an_explicit_java_home(self):
        self.assertEqual(resolve_java_home({"JAVA_HOME": "/custom/jdk"}, candidates=[]), "/custom/jdk")

    def test_falls_back_to_the_first_existing_candidate(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            jdk = Path(tmp) / "jdk"
            (jdk / "bin").mkdir(parents=True)
            (jdk / "bin" / "java").touch()
            found = resolve_java_home({}, candidates=[Path(tmp) / "missing", jdk])
        self.assertEqual(found, str(jdk))

    def test_returns_none_without_any_jdk(self):
        self.assertIsNone(resolve_java_home({}, candidates=[Path("/nonexistent/jdk")]))


class DeviceChoiceTests(unittest.TestCase):
    # The smoke flow launches with clearState: on a phone attached by habit, that wiped the user's
    # own Streamyfin data. Without --device, only an emulator or a simulator is ever picked.
    def test_the_one_emulator_or_simulator_running_is_picked(self):
        self.assertEqual(pick_device([PHONE, EMULATOR]), "emulator-5554")
        self.assertEqual(pick_device([SIMULATOR]), "0F1E2D3C-UDID")

    def test_a_phone_is_never_picked(self):
        with self.assertRaises(NoDevice) as caught:
            pick_device([PHONE])
        self.assertIn("--device", str(caught.exception))
        self.assertIn("R58M12ABCDE", str(caught.exception))

    def test_several_emulators_need_a_choice(self):
        other = Device(kind="android-emulator", id="emulator-5556", name="tv", state="device", platform="android")
        with self.assertRaises(NoDevice) as caught:
            pick_device([EMULATOR, other, SIMULATOR])
        for identifier in ("emulator-5554", "emulator-5556", "0F1E2D3C-UDID"):
            self.assertIn(identifier, str(caught.exception))

    def test_an_emulator_not_ready_does_not_count(self):
        with self.assertRaises(NoDevice):
            pick_device([Device(kind="android-emulator", id="emulator-5554", name="sdk", state="offline", platform="android")])

    def test_main_passes_the_picked_device_to_maestro(self):
        with mock.patch("bench.maestro.discover", return_value=([PHONE, EMULATOR], [])), mock.patch("bench.maestro.run_flow", return_value=0) as run, redirect_stdout(io.StringIO()):
            self.assertEqual(main(["--flow", "e2e/suites/cast/flows/smoke-launch.yml"]), 0)
        command = run.call_args[0][0]
        self.assertEqual(command[command.index("--device") + 1], "emulator-5554")

    def test_main_runs_nothing_without_a_device_to_use(self):
        errors = io.StringIO()
        with mock.patch("bench.maestro.discover", return_value=([PHONE], ["xcrun simctl list devices --json: not found"])), mock.patch("bench.maestro.run_flow") as run, redirect_stderr(errors):
            self.assertEqual(main(["--flow", "e2e/suites/cast/flows/smoke-launch.yml"]), 2)
        run.assert_not_called()
        self.assertIn("R58M12ABCDE", errors.getvalue())
        self.assertIn("xcrun simctl", errors.getvalue())

    def test_a_named_device_is_used_without_looking(self):
        with mock.patch("bench.maestro.discover") as discover, mock.patch("bench.maestro.run_flow", return_value=0) as run, redirect_stdout(io.StringIO()):
            self.assertEqual(main(["--flow", "f.yml", "--device", "R58M12ABCDE"]), 0)
        discover.assert_not_called()
        self.assertIn("R58M12ABCDE", run.call_args[0][0])


if __name__ == "__main__":
    unittest.main()
