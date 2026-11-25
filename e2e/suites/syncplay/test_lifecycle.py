"""Setup, teardown and the Maestro env must stay inside this checkout's own instance."""

import contextlib
import io
import json
import os
from pathlib import Path
from subprocess import CompletedProcess
from tempfile import TemporaryDirectory
import unittest
from unittest import mock

from suites.syncplay import maestro_env, seerr, setup, teardown


def inspected(label, returncode=0):
    return CompletedProcess([], returncode, stdout=label + "\n")


def docker_fake(own_compose, name_owner=None, project=None):
    """Fake `subprocess.run` for the docker calls setup and teardown make.

    `docker ps` lists the project container ids, `docker inspect` reports each one's
    owning compose file (a None project entry means the label is absent), and
    `docker container inspect` checks the requested name, which name_owner="missing"
    answers as if no such container existed. A callable name_owner resolves each
    inspected name, so one container can be foreign while the other is missing.
    Anything else succeeds silently.
    """
    project = project or {}

    def run(command, **kwargs):
        if command[1] == "ps":
            return inspected("\n".join(project))
        if command[1] == "inspect":
            containers = []
            for container_id in command[2:]:
                labels = {}
                if project[container_id] is not None:
                    labels["com.docker.compose.project.config_files"] = project[container_id]
                containers.append({"Id": container_id, "Config": {"Labels": labels}})
            return inspected(json.dumps(containers))
        if command[1] == "container":
            owner = name_owner(command[3]) if callable(name_owner) else name_owner
            if owner == "missing":
                return inspected("", returncode=1)
            return inspected(owner or own_compose)
        return inspected("")

    return run


def setup_api(path, method="GET", data=None, token=None, device_id=None):
    if path == "/System/Info/Public":
        return {"StartupWizardCompleted": True, "Version": "10.11.11"}
    if path == "/Users/AuthenticateByName":
        return {"AccessToken": "local", "User": {"Id": "host", "Name": "syncplay-host"}}
    if path == "/Users":
        return [{"Id": "guest", "Name": "syncplay-guest"}]
    if path == "/Library/VirtualFolders":
        return [{"Name": "SyncPlay Fixtures", "ItemId": "fixture"}]
    if path.startswith("/Users/host/Items?"):
        return {"Items": [
            {"Name": f"SyncPlay Clip {number}", "Id": str(number), "RunTimeTicks": 1200000000}
            for number in range(1, 4)
        ]}
    if path == "/Library/Refresh" or path.startswith("/Users/") and path.endswith("/Policy"):
        return None
    raise AssertionError(path)


class IdentityTest(unittest.TestCase):
    def test_saved_identity_replaces_retyped_variables(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("SYNCPLAY_PROJECT=mine\nSYNCPLAY_CONTAINER=mine-jf\nSYNCPLAY_PORT=18117\n")
            with mock.patch.object(setup, "ENV_FILE", env_file), mock.patch.dict(os.environ, {}, clear=True):
                self.assertEqual(setup.identity()["SYNCPLAY_CONTAINER"], "mine-jf")
                self.assertEqual(setup.identity()["SYNCPLAY_PORT"], "18117")

    def test_a_variable_that_disagrees_with_the_saved_identity_is_refused(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("SYNCPLAY_PORT=18117\n")
            with mock.patch.object(setup, "ENV_FILE", env_file), mock.patch.dict(os.environ, {"SYNCPLAY_PORT": "18096"}):
                with self.assertRaisesRegex(RuntimeError, "conflicts"):
                    setup.identity()

    def test_a_container_started_by_another_checkout_is_refused(self):
        with mock.patch.object(setup.subprocess, "run", return_value=inspected("/elsewhere/compose.yml")):
            with self.assertRaisesRegex(RuntimeError, "not this checkout"):
                setup.refuse_foreign_container("streamyfin-syncplay-e2e-jellyfin")

    def test_an_own_or_missing_container_is_accepted(self):
        with mock.patch.object(setup.subprocess, "run", return_value=inspected(str((setup.ROOT / "compose.yml").resolve()))):
            setup.refuse_foreign_container("mine")
        with mock.patch.object(setup.subprocess, "run", return_value=inspected("", returncode=1)):
            setup.refuse_foreign_container("mine")

    def test_an_empty_or_own_project_is_accepted(self):
        own = str((setup.ROOT / "compose.yml").resolve())
        with mock.patch.object(setup.subprocess, "run", side_effect=docker_fake(own)):
            setup.refuse_foreign_project("mine")
        with mock.patch.object(setup.subprocess, "run", side_effect=docker_fake(own, project={"abc123": own})):
            setup.refuse_foreign_project("mine")

    def test_a_project_started_by_another_checkout_is_refused(self):
        docker = docker_fake(str((setup.ROOT / "compose.yml").resolve()), project={"abc123": "/elsewhere/compose.yml"})
        with mock.patch.object(setup.subprocess, "run", side_effect=docker):
            with self.assertRaisesRegex(RuntimeError, "not this checkout"):
                setup.refuse_foreign_project("streamyfin-syncplay-e2e")

    def test_a_project_container_with_no_owner_label_is_refused(self):
        docker = docker_fake(str((setup.ROOT / "compose.yml").resolve()), project={"abc123": None})
        with mock.patch.object(setup.subprocess, "run", side_effect=docker):
            with self.assertRaisesRegex(RuntimeError, "not this checkout"):
                setup.refuse_foreign_project("mine")


class SetupTest(unittest.TestCase):
    def run_setup(self, root, docker, environ=None):
        calls = []

        def recording(command, **kwargs):
            calls.append(command)
            return docker(command)

        with (
            mock.patch.object(setup, "ROOT", root),
            mock.patch.object(setup, "STATE", root / ".state"),
            mock.patch.object(setup, "ENV_FILE", root / ".env"),
            mock.patch.object(setup, "generate_media"),
            mock.patch.object(setup, "wait_for_server", return_value={"StartupWizardCompleted": True, "Version": "10.11.11"}),
            mock.patch.object(setup, "api", side_effect=setup_api),
            mock.patch.object(seerr, "ensure_ready"),
            mock.patch.object(setup.subprocess, "run", side_effect=recording),
            mock.patch.dict(os.environ, environ or {}, clear=True),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            try:
                setup.main()
            finally:
                self.calls = calls

    def test_up_targets_the_saved_project_not_an_inherited_compose_name(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text("SYNCPLAY_PROJECT=mine\n")
            self.run_setup(root, docker_fake(str((root / "compose.yml").resolve())), environ={"COMPOSE_PROJECT_NAME": "wrong"})
            up = [command for command in self.calls if "up" in command]
            self.assertEqual(len(up), 1)
            self.assertEqual(up[0][up[0].index("-p") + 1], "mine")

    def test_an_unwritable_config_dir_is_refused_before_compose_up(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            plugins = root / ".state" / "config" / "plugins"
            plugins.mkdir(parents=True)
            real_access = os.access

            def access(path, mode):
                return False if Path(path) == plugins else real_access(path, mode)

            docker = docker_fake(str((root / "compose.yml").resolve()), name_owner="missing")
            with mock.patch.object(setup.os, "access", side_effect=access):
                with self.assertRaisesRegex(RuntimeError, "not writable"):
                    self.run_setup(root, docker)
            self.assertFalse([command for command in self.calls if "up" in command])

    def test_a_foreign_project_is_refused_even_when_the_container_name_is_free(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            docker = docker_fake(
                str((root / "compose.yml").resolve()),
                name_owner="missing", project={"abc123": "/elsewhere/compose.yml"},
            )
            with self.assertRaisesRegex(RuntimeError, "not this checkout"):
                self.run_setup(root, docker)
            self.assertFalse((root / ".env").exists())
            self.assertFalse([command for command in self.calls if "up" in command or "down" in command])

    def test_a_foreign_seerr_container_is_refused_before_any_write_or_up(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            docker = docker_fake(
                str((root / "compose.yml").resolve()),
                name_owner=lambda name: "/elsewhere/compose.yml" if "seerr" in name else "missing",
            )
            with self.assertRaisesRegex(RuntimeError, "not this checkout"):
                self.run_setup(root, docker)
            self.assertFalse((root / ".env").exists())
            self.assertFalse([command for command in self.calls if "up" in command or "down" in command])


class TeardownTest(unittest.TestCase):
    def run_teardown(self, root, owner, project=None, environ=None):
        calls = []
        docker = docker_fake(str((root / "compose.yml").resolve()), name_owner=owner, project=project)

        def run(command, **kwargs):
            calls.append((command, kwargs))
            return docker(command)

        with (
            mock.patch.object(setup, "ROOT", root),
            mock.patch.object(setup, "STATE", root / ".state"),
            mock.patch.object(setup, "ENV_FILE", root / ".env"),
            mock.patch.object(setup.subprocess, "run", side_effect=run),
            mock.patch.dict(os.environ, environ or {}, clear=True),
            contextlib.redirect_stdout(io.StringIO()),
        ):
            try:
                teardown.teardown()
            finally:
                self.calls = calls

    def test_removes_the_container_and_every_local_file(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".state" / "config").mkdir(parents=True)
            (root / "artifacts").mkdir()
            (root / ".env").write_text("SYNCPLAY_PROJECT=mine\n")
            self.run_teardown(root, None, project={"abc123": str((root / "compose.yml").resolve())})
            down = [(command, kwargs) for command, kwargs in self.calls if "down" in command]
            self.assertEqual(len(down), 1)
            self.assertEqual(down[0][1]["env"]["SYNCPLAY_PROJECT"], "mine")
            for leftover in (".state", "artifacts", ".env"):
                self.assertFalse((root / leftover).exists())

    def test_down_targets_the_saved_project_not_an_inherited_compose_name(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text("SYNCPLAY_PROJECT=mine\n")
            self.run_teardown(root, None, environ={"COMPOSE_PROJECT_NAME": "wrong"})
            down = [command for command, _ in self.calls if "down" in command]
            self.assertEqual(len(down), 1)
            self.assertEqual(down[0][down[0].index("-p") + 1], "mine")

    def test_leaves_another_checkouts_container_and_files_alone(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".state").mkdir()
            with self.assertRaises(RuntimeError):
                self.run_teardown(root, "/elsewhere/compose.yml")
            self.assertFalse([command for command, _ in self.calls if "down" in command])
            self.assertTrue((root / ".state").exists())

    def test_leaves_a_foreign_seerr_container_and_files_alone(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".state").mkdir()
            with self.assertRaisesRegex(RuntimeError, "not this checkout"):
                self.run_teardown(root, lambda name: "/elsewhere/compose.yml" if "seerr" in name else "missing")
            self.assertFalse([command for command, _ in self.calls if "down" in command])
            self.assertTrue((root / ".state").exists())

    def test_leaves_a_foreign_projects_containers_and_files_alone(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".state").mkdir()
            (root / ".env").write_text("SYNCPLAY_PROJECT=mine\n")
            with self.assertRaisesRegex(RuntimeError, "not this checkout"):
                self.run_teardown(root, "missing", project={"abc123": "/elsewhere/compose.yml"})
            self.assertFalse([command for command, _ in self.calls if "down" in command])
            self.assertTrue((root / ".state").exists())


class MaestroEnvTest(unittest.TestCase):
    def test_reads_the_sign_in_from_this_instances_credentials(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "credentials.json").write_text(json.dumps({
                "url": "http://127.0.0.1:18117", "password": "pw",
                "host": {"name": "syncplay-host"}, "guest": {"name": "syncplay-guest"},
            }))
            with mock.patch.object(setup, "STATE", state):
                env = maestro_env.maestro_env()
        self.assertEqual(env["SERVER_URL"], "http://127.0.0.1:18117")
        self.assertEqual(env["ANDROID_SERVER_URL"], "http://10.0.2.2:18117")
        self.assertEqual((env["USERNAME"], env["GUEST_USERNAME"], env["PASSWORD"]), ("syncplay-host", "syncplay-guest", "pw"))


if __name__ == "__main__":
    unittest.main()
