import unittest
from pathlib import Path

from bench.maestro import build_command, maestro_path


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
        self.assertEqual(maestro_path(), Path.home() / ".maestro" / "bin" / "maestro")


if __name__ == "__main__":
    unittest.main()
