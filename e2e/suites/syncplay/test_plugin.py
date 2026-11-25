"""The opt-in plugin install must target only this worktree's local server."""

import contextlib
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

SERVER_VERSION = "10.11.11"
RELEASES = "https://github.com/streamyfin/jellyfin-plugin-streamyfin/releases/download/"
ARCHIVE_URL = RELEASES + "0.70.0.0/streamyfin-0.70.0.0-jf11.zip"


def release(version, target_abi, url=ARCHIVE_URL, checksum="0" * 32):
    return {"version": version, "targetAbi": target_abi, "sourceUrl": url, "checksum": checksum}


def manifest(*versions):
    return [{"guid": plugin.PLUGIN_ID, "name": "Streamyfin", "versions": list(versions)}]


# The stable manifest as published on 2026-11-24: one build per Jellyfin major.
PUBLISHED = manifest(
    release("0.70.0.0", "12.0.0.0", RELEASES + "0.70.0.0/streamyfin-0.70.0.0-jf12.zip"),
    release("0.70.0.0", "10.11.9.0"),
    release("0.68.1.0", "10.11.11", RELEASES + "0.68.1.0/streamyfin-0.68.1.0.zip"),
)


class SelectReleaseTest(unittest.TestCase):
    def test_takes_the_newest_build_whose_target_this_server_meets(self):
        chosen = plugin.select_release(PUBLISHED, SERVER_VERSION)
        self.assertEqual((chosen["version"], chosen["targetAbi"]), ("0.70.0.0", "10.11.9.0"))

    def test_skips_a_build_that_targets_a_newer_jellyfin(self):
        only_newer = manifest(release("0.70.0.0", "12.0.0.0"), release("0.68.1.0", "10.11.11"))
        self.assertEqual(plugin.select_release(only_newer, SERVER_VERSION)["version"], "0.68.1.0")
        # A target written with four parts still matches the same three-part server version.
        self.assertEqual(plugin.select_release(manifest(release("0.69.0.0", "10.11.11.0")), SERVER_VERSION)["version"], "0.69.0.0")

    def test_a_pinned_version_wins_over_newer_ones(self):
        self.assertEqual(plugin.select_release(PUBLISHED, SERVER_VERSION, "0.68.1.0")["version"], "0.68.1.0")

    def test_a_pinned_version_this_server_cannot_run_is_refused(self):
        with self.assertRaisesRegex(RuntimeError, "^The Streamyfin plugin manifest has no stable 0.71.0.0 for Jellyfin 10.11.11$"):
            plugin.select_release(PUBLISHED, SERVER_VERSION, "0.71.0.0")
        with self.assertRaisesRegex(RuntimeError, "no stable build for Jellyfin 10.10.7$"):
            plugin.select_release(PUBLISHED, "10.10.7")

    def test_an_archive_outside_the_plugin_releases_is_refused(self):
        moved = manifest(release("0.70.0.0", "10.11.9.0", "https://example.test/streamyfin.zip"))
        with self.assertRaisesRegex(RuntimeError, "^Streamyfin plugin 0.70.0.0 archive is not under https://github.com/streamyfin/jellyfin-plugin-streamyfin/releases/download/$"):
            plugin.select_release(moved, SERVER_VERSION)

    def test_an_unreadable_manifest_is_a_clear_error(self):
        for broken in ({"versions": []}, [{"guid": "other"}], manifest({"version": "0.70.0.0"}), manifest(release("next", "10.11.9.0"))):
            with self.subTest(broken=broken), self.assertRaisesRegex(RuntimeError, "^Unreadable Streamyfin plugin manifest at https://"):
                plugin.select_release(broken, SERVER_VERSION)

    def test_a_manifest_that_does_not_download_or_parse_is_a_clear_error(self):
        for answer in ({"return_value": BytesIO(b"<html>rate limited</html>")}, {"side_effect": OSError("offline")}):
            with (
                self.subTest(answer=answer),
                mock.patch.object(plugin.urllib.request, "urlopen", **answer),
                self.assertRaisesRegex(RuntimeError, "^Could not read the Streamyfin plugin manifest at https://"),
            ):
                plugin.read_manifest()


class PluginInstallTest(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.state = Path(directory.name)
        archive = BytesIO()
        with zipfile.ZipFile(archive, "w") as bundle:
            bundle.writestr("Jellyfin.Plugin.Streamyfin.dll", b"stable plugin")
        self.payload = archive.getvalue()
        self.installed = []
        self.requests = []
        self.restarted = []
        self.status = "Active"

    def manifest_for(self, payload):
        return manifest(release("0.70.0.0", "10.11.9.0", checksum=hashlib.md5(payload).hexdigest()))

    def api(self, path, method="GET", data=None, token=None):
        if path == "/System/Info/Public":
            return {"Version": SERVER_VERSION}
        self.assertEqual(token, "stored-host-token")
        self.requests.append((method, path))
        if path == "/Plugins":
            return [{"Id": plugin.PLUGIN_ID.replace("-", ""), "Version": version, "Status": self.status} for version in self.installed]
        if path == "/Streamyfin/config":
            return {"settings": {}}
        if method == "DELETE" and path.startswith(f"/Plugins/{plugin.PLUGIN_ID}/"):
            return None
        if method == "POST" and path == f"/Plugins/{plugin.PLUGIN_ID}/0.70.0.0/Enable":
            self.status = "Active"
            return None
        raise AssertionError(path)

    def docker_output(self, command, text):
        container = {
            "Id": "local-container",
            "Config": {"Labels": {
                "com.docker.compose.project.config_files": str(setup.ROOT / "compose.yml"),
            }},
            "Mounts": [{"Destination": "/config", "Source": str(self.state / "config")}],
            "NetworkSettings": {"Ports": {"8096/tcp": [{
                "HostIp": "127.0.0.1", "HostPort": setup.URL.rsplit(":", 1)[1],
            }]}},
        }
        other = {
            "Id": "other-container", "Config": {"Labels": {}},
            "Mounts": [], "NetworkSettings": {"Ports": {}},
        }
        self.assertTrue(text)
        if command == ["docker", "ps", "-q"]:
            return "other-container\nlocal-container\n"
        if command == ["docker", "inspect", "other-container", "local-container"]:
            return json.dumps([other, container])
        raise AssertionError(command)

    def docker_restart(self, command, check, stdout):
        self.assertEqual(command, ["docker", "restart", "local-container"])
        self.assertTrue(check)
        self.restarted.append(True)
        self.installed = ["0.70.0.0"]

    def patched(self, published, archive):
        stack = contextlib.ExitStack()
        for patch in (
            mock.patch.object(setup, "STATE", self.state),
            mock.patch.object(setup, "ENV_FILE", self.state / ".env"),
            # A developer SYNCPLAY_BACKEND=native must not swap in the native backend.
            mock.patch.dict(os.environ, {"SYNCPLAY_BACKEND": "docker"}, clear=True),
            mock.patch.object(setup, "api", side_effect=self.api),
            mock.patch.object(setup, "wait_for_server"),
            mock.patch.object(plugin.time, "sleep"),
            mock.patch.object(plugin, "read_manifest", return_value=published),
            mock.patch.object(backend.subprocess, "check_output", side_effect=self.docker_output),
            mock.patch.object(backend.subprocess, "run", side_effect=self.docker_restart),
        ):
            stack.enter_context(patch)
        self.urlopen = stack.enter_context(
            mock.patch.object(download.urllib.request, "urlopen", return_value=BytesIO(archive)),
        )
        return stack

    def test_installs_the_stable_archive_and_restarts_only_the_matching_container(self):
        with self.patched(self.manifest_for(self.payload), self.payload):
            self.assertEqual(plugin.ensure("stored-host-token"), "0.70.0.0")
            installed = self.state / "config/plugins/Streamyfin_0.70.0.0/Jellyfin.Plugin.Streamyfin.dll"
            self.assertEqual(installed.read_bytes(), b"stable plugin")
            self.assertEqual(plugin.ensure("stored-host-token"), "0.70.0.0")
            self.urlopen.assert_called_once_with(ARCHIVE_URL, timeout=90)
        self.assertEqual(len(self.restarted), 1)
        self.assertEqual(self.requests.count(("GET", "/Streamyfin/config")), 2)

    def test_replaces_an_older_installed_version_with_the_latest(self):
        self.installed = ["0.68.1.0"]
        with self.patched(self.manifest_for(self.payload), self.payload):
            self.assertEqual(plugin.ensure("stored-host-token"), "0.70.0.0")
        self.assertIn(("DELETE", f"/Plugins/{plugin.PLUGIN_ID}/0.68.1.0"), self.requests)
        self.assertEqual(len(self.restarted), 1)

    def test_enables_the_selected_version_when_it_was_disabled(self):
        # Jellyfin reports Restart right after a disable, and Disabled after the next start.
        for status in ("Restart", "Disabled"):
            with self.subTest(status=status):
                self.installed, self.status, self.requests, self.restarted = ["0.70.0.0"], status, [], []
                with self.patched(self.manifest_for(self.payload), self.payload):
                    self.assertEqual(plugin.ensure("stored-host-token"), "0.70.0.0")
                self.assertIn(("POST", f"/Plugins/{plugin.PLUGIN_ID}/0.70.0.0/Enable"), self.requests)
                self.assertEqual(len(self.restarted), 1)

    def test_rejects_tampered_archive_before_install_or_restart(self):
        # The older build stays installed: nothing is uninstalled before the new one extracts.
        self.installed = ["0.68.1.0"]
        with self.patched(self.manifest_for(self.payload), b"wrong file"):
            with self.assertRaisesRegex(RuntimeError, "^Streamyfin plugin 0.70.0.0 download checksum mismatch; nothing installed$"):
                plugin.ensure("stored-host-token")
        self.assertFalse((self.state / "config/plugins/Streamyfin_0.70.0.0").exists())
        self.assertEqual(self.restarted, [])
        self.assertNotIn("DELETE", [method for method, _ in self.requests])


if __name__ == "__main__":
    unittest.main()
