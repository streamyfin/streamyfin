"""The opt-in plugin install must target only this worktree's local server."""

import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
import zipfile

from bench import download
from suites.syncplay import backend, plugin, setup


class PluginInstallTest(unittest.TestCase):
    def test_installs_pinned_archive_and_restarts_only_the_matching_container(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            archive = BytesIO()
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("Jellyfin.Plugin.Streamyfin.dll", b"pinned plugin")
            payload = archive.getvalue()
            container = {
                "Id": "local-container",
                "Config": {"Labels": {
                    "com.docker.compose.project.config_files": str(setup.ROOT / "compose.yml"),
                }},
                "Mounts": [{"Destination": "/config", "Source": str(state / "config")}],
                "NetworkSettings": {"Ports": {"8096/tcp": [{
                    "HostIp": "127.0.0.1", "HostPort": setup.URL.rsplit(":", 1)[1],
                }]}},
            }
            other = {
                "Id": "other-container", "Config": {"Labels": {}},
                "Mounts": [], "NetworkSettings": {"Ports": {}},
            }
            requests = []
            restarted = []

            def api(path, method="GET", data=None, token=None):
                self.assertEqual(token, "stored-host-token")
                requests.append(path)
                if path == "/Plugins":
                    return ([{
                        "Id": plugin.PLUGIN_ID.replace("-", ""),
                        "Version": plugin.PLUGIN_VERSION, "Status": "Active",
                    }] if restarted else [])
                if path == "/Streamyfin/config":
                    return {"settings": {}}
                raise AssertionError(path)

            def docker_output(command, text):
                self.assertTrue(text)
                if command == ["docker", "ps", "-q"]:
                    return "other-container\nlocal-container\n"
                if command == ["docker", "inspect", "other-container", "local-container"]:
                    return json.dumps([other, container])
                raise AssertionError(command)

            def docker_restart(command, check, stdout):
                self.assertEqual(command, ["docker", "restart", "local-container"])
                self.assertTrue(check)
                restarted.append(True)

            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "ENV_FILE", state / ".env"),
                # A developer SYNCPLAY_BACKEND=native must not swap in the native backend.
                mock.patch.dict(os.environ, {"SYNCPLAY_BACKEND": "docker"}, clear=True),
                mock.patch.object(setup, "api", side_effect=api),
                mock.patch.object(setup, "wait_for_server"),
                mock.patch.object(plugin, "PLUGIN_SHA256", hashlib.sha256(payload).hexdigest()),
                mock.patch.object(download.urllib.request, "urlopen", return_value=BytesIO(payload)),
                mock.patch.object(backend.subprocess, "check_output", side_effect=docker_output),
                mock.patch.object(backend.subprocess, "run", side_effect=docker_restart),
            ):
                self.assertTrue(plugin.ensure("stored-host-token"))
                installed = state / "config/plugins/Streamyfin_0.68.1.0/Jellyfin.Plugin.Streamyfin.dll"
                self.assertEqual(installed.read_bytes(), b"pinned plugin")
                self.assertFalse(plugin.ensure("stored-host-token"))
            self.assertEqual(len(restarted), 1)
            self.assertEqual(requests.count("/Streamyfin/config"), 2)

    def test_rejects_tampered_archive_before_install_or_restart(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(setup, "ENV_FILE", state / ".env"),
                # A developer SYNCPLAY_BACKEND=native must not swap in the native backend.
                mock.patch.dict(os.environ, {"SYNCPLAY_BACKEND": "docker"}, clear=True),
                mock.patch.object(setup, "api", return_value=[]),
                mock.patch.object(download.urllib.request, "urlopen", return_value=BytesIO(b"wrong file")) as urlopen,
                mock.patch.object(backend.subprocess, "run") as restart,
            ):
                with self.assertRaisesRegex(RuntimeError, "^Streamyfin plugin download checksum mismatch; nothing installed$"):
                    plugin.ensure("stored-host-token")
            urlopen.assert_called_once_with(plugin.PLUGIN_URL, timeout=90)
            self.assertFalse((state / "config/plugins/Streamyfin_0.68.1.0").exists())
            restart.assert_not_called()


if __name__ == "__main__":
    unittest.main()
