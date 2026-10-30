import unittest
from pathlib import Path

from bench.maestro import build_command, describe_command, maestro_path, resolve_java_home, run_flow


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


if __name__ == "__main__":
    unittest.main()
