"""Radarr must list the offline root folder without freeSpace, and Seerr must default to it."""

import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
import urllib.error
import urllib.parse

from suites.syncplay import backend, native, radarr, seerr, setup
from suites.syncplay.test_seerr import OWNED, Response

KEY = "0123456789abcdef0123456789abcdef"


class FakeRadarr:
    """Radarr's v3 root folder API as the opener radarr.new_session builds.

    A registered folder reports freeSpace while its host folder exists, the way Radarr
    reports an inaccessible one: without the key.
    """

    def __init__(self, host_folder_of):
        self.host_folder_of = host_folder_of
        # Listings that still report freeSpace for a deleted folder, as a VM-backed bind
        # mount (Colima) shows a host-side delete about a second late.
        self.stale_listings = 0
        self.registered = []
        self.calls = []
        self.addheaders = []

    def open(self, request, timeout=None):
        method = request.get_method()
        path = urllib.parse.urlsplit(request.full_url).path
        body = json.loads(request.data.decode()) if request.data else None
        self.calls.append((method, path, body))
        if dict(self.addheaders).get("X-Api-Key") != KEY:
            raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {}, None)
        if (method, path) == ("GET", "/api/v3/system/status"):
            return self.reply({"version": native.RADARR_VERSION})
        if (method, path) == ("GET", "/api/v3/qualityprofile"):
            return self.reply([{"id": 4, "name": "HD-1080p"}, {"id": 1, "name": "Any"}])
        if (method, path) == ("POST", "/api/v3/rootfolder"):
            if not self.host_folder_of(body["path"]).is_dir():
                raise urllib.error.HTTPError(request.full_url, 400, "Folder does not exist", {}, None)
            self.registered.append(body["path"])
            return self.reply({"path": body["path"]})
        if (method, path) == ("GET", "/api/v3/rootfolder"):
            listed = []
            for number, folder in enumerate(self.registered, 1):
                entry = {"id": number, "path": folder, "accessible": self.host_folder_of(folder).is_dir()}
                if not entry["accessible"] and self.stale_listings:
                    self.stale_listings -= 1
                    entry["accessible"] = True
                if entry["accessible"]:
                    entry["freeSpace"] = 1
                listed.append(entry)
            return self.reply(listed)
        raise AssertionError(f"unexpected {method} {path}")

    def reply(self, payload):
        return Response(json.dumps(payload).encode())


def docker_host_folder(state):
    """Map a container path under /radarr-media to its host folder, as compose.yml mounts it."""
    return lambda path: state / "radarr-media" / Path(path).relative_to(backend.DOCKER_RADARR_MEDIA)


class ConfigTest(unittest.TestCase):
    def test_config_is_written_once_with_a_private_key_radarr_then_owns(self):
        with TemporaryDirectory() as directory, mock.patch.object(setup, "STATE", Path(directory)):
            radarr.write_config("127.0.0.1", 17878)
            path = Path(directory) / "radarr" / "config.xml"
            text = path.read_text()
            self.assertIn("<Port>17878</Port>", text)
            self.assertIn("<BindAddress>127.0.0.1</BindAddress>", text)
            self.assertRegex(radarr.api_key(), r"^[0-9a-f]{32}$")
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            radarr.write_config("*", 7878)
            self.assertEqual(path.read_text(), text)

    def test_the_compose_image_and_the_native_tarball_are_the_same_release(self):
        compose = (Path(radarr.__file__).parent / "compose.yml").read_text()
        image = re.search(r"image: lscr\.io/linuxserver/radarr:([0-9.]+)-ls\d+@sha256:[0-9a-f]{64}", compose)
        self.assertIsNotNone(image, "the radarr image must be pinned by tag and digest")
        self.assertEqual(image.group(1), native.RADARR_VERSION)


class EnsureReadyTest(unittest.TestCase):
    def run_ensure_ready(self, state, servers, fake, owned=OWNED):
        (state / "radarr").mkdir(parents=True, exist_ok=True)
        (state / "radarr" / "config.xml").write_text(f"<Config><ApiKey>{KEY}</ApiKey></Config>")
        with (
            mock.patch.object(setup, "STATE", state),
            mock.patch.object(radarr.urllib.request, "build_opener", return_value=fake),
            mock.patch.object(seerr, "ensure_radarr") as ensure_radarr,
            mock.patch.object(radarr.time, "sleep"),
        ):
            radarr.ensure_ready(owned, servers, "syncplay-host", "pw")
        return ensure_radarr

    def test_seerr_defaults_to_the_offline_folder_radarr_lists_without_free_space(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            fake = FakeRadarr(docker_host_folder(state))
            ensure_radarr = self.run_ensure_ready(state, backend.DockerBackend(), fake)
            self.assertEqual(fake.registered, ["/radarr-media/movies", "/radarr-media/movies-offline"])
            self.assertTrue((state / "radarr-media" / "movies").is_dir())
            self.assertFalse((state / "radarr-media" / "movies-offline").exists())
            owned, username, password, server = ensure_radarr.call_args.args
            self.assertEqual((owned, username, password), (OWNED, "syncplay-host", "pw"))
            self.assertEqual((server["hostname"], server["port"], server["apiKey"]), ("radarr", 7878, KEY))
            self.assertEqual(server["activeDirectory"], "/radarr-media/movies-offline")
            self.assertEqual((server["activeProfileId"], server["activeProfileName"]), (1, "Any"))
            self.assertTrue(server["isDefault"])
            self.assertTrue(server["preventSearch"])

    def test_a_rerun_registers_nothing_and_leaves_the_offline_folder_deleted(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            fake = FakeRadarr(docker_host_folder(state))
            self.run_ensure_ready(state, backend.DockerBackend(), fake)
            fake.calls.clear()
            self.run_ensure_ready(state, backend.DockerBackend(), fake)
            self.assertNotIn("POST", [method for method, _, _ in fake.calls])
            self.assertFalse((state / "radarr-media" / "movies-offline").exists())

    def test_native_radarr_gets_host_paths_and_seerr_reaches_it_on_loopback(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            fake = FakeRadarr(Path)
            native_owned = {**OWNED, "SYNCPLAY_BACKEND": "native"}
            ensure_radarr = self.run_ensure_ready(state, backend.NativeBackend(), fake, native_owned)
            media = state / "radarr-media"
            self.assertEqual(fake.registered, [str(media / "movies"), str(media / "movies-offline")])
            server = ensure_radarr.call_args.args[3]
            self.assertEqual((server["hostname"], server["port"]), ("127.0.0.1", 17878))
            self.assertEqual(server["activeDirectory"], str(media / "movies-offline"))

    def test_an_offline_folder_that_still_reports_free_space_is_refused(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            # A host folder that never goes away: Radarr keeps reporting freeSpace for it.
            fake = FakeRadarr(lambda path: state)
            with self.assertRaisesRegex(RuntimeError, "still reports freeSpace"):
                self.run_ensure_ready(state, backend.DockerBackend(), fake)

    def test_waits_for_a_deletion_the_bind_mount_shows_late(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            fake = FakeRadarr(docker_host_folder(state))
            fake.stale_listings = 2
            ensure_radarr = self.run_ensure_ready(state, backend.DockerBackend(), fake)
            self.assertEqual(ensure_radarr.call_args.args[3]["activeDirectory"], "/radarr-media/movies-offline")

    def test_a_radarr_that_never_answers_is_refused_after_the_bound(self):
        with TemporaryDirectory() as directory:
            state = Path(directory)
            (state / "radarr").mkdir()
            (state / "radarr" / "config.xml").write_text(f"<Config><ApiKey>{KEY}</ApiKey></Config>")
            opener = mock.Mock(open=mock.Mock(side_effect=urllib.error.URLError("connection refused")))
            with (
                mock.patch.object(setup, "STATE", state),
                mock.patch.object(radarr.urllib.request, "build_opener", return_value=opener),
                mock.patch.object(radarr.time, "sleep"),
            ):
                with self.assertRaisesRegex(RuntimeError, "did not become ready"):
                    radarr.ensure_ready(OWNED, backend.DockerBackend(), "syncplay-host", "pw")
            self.assertEqual(opener.open.call_count, radarr.READY_ATTEMPTS)


if __name__ == "__main__":
    unittest.main()
