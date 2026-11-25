"""The native backend must reproduce the Docker fixture with host processes it alone owns."""

import contextlib
from io import BytesIO
import hashlib
import io
import json
import os
from pathlib import Path
import re
import signal
from subprocess import CompletedProcess
from tempfile import TemporaryDirectory
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

from bench import download
from suites.syncplay import backend, enrich, native, seed, seerr, setup
from suites.syncplay.test_seerr import OWNED, FakeOpener, patched_opener

NATIVE = {**OWNED, "SYNCPLAY_BACKEND": "native"}


def completed(stdout="", returncode=0):
    return CompletedProcess([], returncode, stdout=stdout)


@contextlib.contextmanager
def on_apple_silicon():
    with (
        mock.patch.object(native.platform, "system", return_value="Darwin"),
        mock.patch.object(native.platform, "machine", return_value="arm64"),
    ):
        yield


@contextlib.contextmanager
def native_checkout(root, environ=None):
    """A temporary checkout whose saved identity selects the native backend."""
    (root / ".env").write_text("SYNCPLAY_BACKEND=native\n")
    with (
        mock.patch.object(setup, "ROOT", root),
        mock.patch.object(setup, "STATE", root / ".state"),
        mock.patch.object(setup, "ENV_FILE", root / ".env"),
        mock.patch.object(native, "TOOLS", root / ".tools"),
        mock.patch.object(native, "MEDIA_LINK_BASE", root),
        mock.patch.dict(os.environ, environ or {}, clear=True),
    ):
        yield


class Processes:
    """A process table at the os and ps boundary: pid -> command line, signals recorded."""

    def __init__(self, table):
        self.table = dict(table)
        self.signals = []

    def kill(self, pid, sig):
        if pid not in self.table:
            raise ProcessLookupError(pid)

    def killpg(self, pid, sig):
        self.signals.append((pid, sig))
        if sig == signal.SIGTERM and not self.table.get(pid, "").endswith("ignores-sigterm"):
            self.table.pop(pid, None)

    def ps(self, command):
        return completed(self.table.get(int(command[-1]), ""))

    @contextlib.contextmanager
    def installed(self, lsof=None):
        def run(command, **kwargs):
            if command[0] == "ps":
                return self.ps(command)
            if command[0] == "lsof":
                port = command[2].split(":")[1]
                return completed("\n".join(str(pid) for pid in (lsof or {}).get(port, ())))
            raise AssertionError(command)

        with (
            mock.patch.object(native.os, "kill", side_effect=self.kill),
            mock.patch.object(native.os, "killpg", side_effect=self.killpg),
            mock.patch.object(native.os, "waitpid", side_effect=ChildProcessError),
            mock.patch.object(native.subprocess, "run", side_effect=run),
        ):
            yield


class SelectionTest(unittest.TestCase):
    def test_the_backend_is_persisted_in_env_and_drives_the_fixture_library_path(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            posts = []
            folders = []

            def api(path, method="GET", data=None, token=None, device_id=None):
                if path.startswith("/Library/VirtualFolders?"):
                    posts.append(data)
                    folders.append({"Name": "SyncPlay Fixtures", "ItemId": "fixture"})
                    return None
                if path == "/Library/VirtualFolders":
                    return list(folders)
                from suites.syncplay.test_lifecycle import setup_api

                return setup_api(path, method, data, token, device_id)

            with (
                mock.patch.object(setup, "ROOT", root),
                mock.patch.object(setup, "STATE", root / ".state"),
                mock.patch.object(setup, "ENV_FILE", root / ".env"),
                mock.patch.object(setup, "generate_media"),
                mock.patch.object(setup, "wait_for_server", return_value={"StartupWizardCompleted": True, "Version": "10.11.11"}),
                mock.patch.object(setup, "api", side_effect=api),
                mock.patch.object(seerr, "ensure_ready"),
                mock.patch.object(backend.NativeBackend, "refuse_foreign") as refuse,
                mock.patch.object(backend.NativeBackend, "up") as up,
                mock.patch.object(setup.subprocess, "run", side_effect=AssertionError("no docker under native")),
                mock.patch.dict(os.environ, {"SYNCPLAY_BACKEND": "native"}, clear=True),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                setup.main()
                link = native.media_link()
            self.assertIn("SYNCPLAY_BACKEND=native\n", (root / ".env").read_text())
            refuse.assert_called_once()
            up.assert_called_once()
            self.assertEqual(posts[0]["LibraryOptions"]["PathInfos"], [{"Path": str(link / "media")}])

    def test_a_backend_that_disagrees_with_env_is_refused(self):
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("SYNCPLAY_BACKEND=docker\n")
            with mock.patch.object(setup, "ENV_FILE", env_file), mock.patch.dict(os.environ, {"SYNCPLAY_BACKEND": "native"}):
                with self.assertRaisesRegex(RuntimeError, "conflicts"):
                    setup.identity()

    def test_an_env_from_before_the_backend_key_counts_as_docker(self):
        # An instance set up before SYNCPLAY_BACKEND existed is a Docker one; switching it
        # silently would start host processes on ports its containers hold.
        with TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text("SYNCPLAY_PORT=18096\n")
            with mock.patch.object(setup, "ENV_FILE", env_file), mock.patch.dict(os.environ, {"SYNCPLAY_BACKEND": "native"}):
                with self.assertRaisesRegex(RuntimeError, "conflicts"):
                    setup.identity()
            with mock.patch.object(setup, "ENV_FILE", env_file), mock.patch.dict(os.environ, {}, clear=True):
                self.assertEqual(setup.identity()["SYNCPLAY_BACKEND"], "docker")

    def test_an_unknown_backend_is_refused(self):
        with TemporaryDirectory() as directory:
            with (
                mock.patch.object(setup, "ENV_FILE", Path(directory) / ".env"),
                mock.patch.dict(os.environ, {"SYNCPLAY_BACKEND": "podman"}, clear=True),
            ):
                with self.assertRaisesRegex(RuntimeError, "podman"):
                    setup.identity()

    def test_host_paths_follow_the_compose_volume_mapping_through_the_media_link(self):
        self.assertEqual(backend.DockerBackend().host_path("/catalog/movies"), "/catalog/movies")
        with mock.patch.object(setup, "ROOT", Path("/checkout")), mock.patch.object(setup, "STATE", Path("/checkout/.state")):
            link = native.media_link()
            self.assertEqual(backend.NativeBackend().host_path("/media"), str(link / "media"))
            self.assertEqual(backend.NativeBackend().host_path("/catalog/movies"), str(link / "catalog" / "movies"))

    def test_host_paths_hide_a_checkout_path_jellyfin_would_parse_as_an_episode(self):
        # A self-hosted runner's workspace held `5b17-4d99`; Jellyfin's catch-all episode
        # pattern `([0-9]+)-([0-9]+)` read it from the full path as S17E04 for every episode.
        root = Path("/Users/someone/.homerun/runners/22b8179c-5b17-4d99-9a3e/_work/streamyfin/e2e/suites/syncplay")
        with mock.patch.object(setup, "ROOT", root), mock.patch.object(setup, "STATE", root / ".state"):
            for mount in ("/media", "/catalog/shows"):
                path = backend.NativeBackend().host_path(mount)
                self.assertIsNone(re.search(r"[0-9]+-[0-9]+", path), path)
                self.assertFalse(any(character.isdigit() for character in path), path)
                self.assertTrue(path.startswith(str(native.MEDIA_LINK_BASE) + "/"), path)

    def test_seerr_reaches_jellyfin_by_service_name_or_loopback(self):
        self.assertEqual(backend.DockerBackend().jellyfin_address_for_seerr(OWNED), ("jellyfin", 8096))
        self.assertEqual(backend.NativeBackend().jellyfin_address_for_seerr({**NATIVE, "SYNCPLAY_PORT": "18117"}), ("127.0.0.1", 18117))

    def test_native_seerr_onboarding_targets_the_loopback_jellyfin(self):
        opener = FakeOpener()
        opener.serve("GET", "/api/v1/settings/public", {"initialized": False}, {"initialized": True})
        opener.serve("POST", "/api/v1/auth/jellyfin", {"id": 1})
        opener.serve("POST", "/api/v1/settings/jellyfin/library/sync", [{"id": "fx1", "name": "SyncPlay Fixtures"}])
        opener.serve("PUT", "/api/v1/settings/jellyfin/library/fx1", {"id": "fx1", "enabled": True})
        opener.serve("POST", "/api/v1/settings/initialize", {"initialized": True})
        with patched_opener(opener):
            seerr.ensure_ready(NATIVE, username="syncplay-host", password="pw")
        login = opener.calls[1][2]
        self.assertEqual((login["hostname"], login["port"]), ("127.0.0.1", 18096))


class PlatformTest(unittest.TestCase):
    def test_native_is_refused_off_macos_arm64(self):
        for system, machine in (("Linux", "x86_64"), ("Darwin", "x86_64"), ("Linux", "aarch64")):
            with (
                mock.patch.object(native.platform, "system", return_value=system),
                mock.patch.object(native.platform, "machine", return_value=machine),
                mock.patch.object(native.subprocess, "run", side_effect=AssertionError("checked nothing else")),
            ):
                with self.assertRaisesRegex(RuntimeError, "Apple silicon"):
                    backend.NativeBackend().refuse_foreign(NATIVE)

    def test_node_outside_seerrs_engine_range_is_refused(self):
        for version in ("v22.18.0", "v20.19.0", "v23.0.0", "v24.11.1"):
            with mock.patch.object(native.subprocess, "run", return_value=completed(version + "\n")):
                with self.assertRaisesRegex(RuntimeError, r"\^22\.19\.0"):
                    native.require_node()
        with mock.patch.object(native.subprocess, "run", side_effect=FileNotFoundError("node")):
            with self.assertRaisesRegex(RuntimeError, r"\^22\.19\.0"):
                native.require_node()
        with mock.patch.object(native.subprocess, "run", return_value=completed("v22.19.0\n")):
            native.require_node()


class OwnershipTest(unittest.TestCase):
    def write_pids(self, root, **pids):
        (root / ".state").mkdir(exist_ok=True)
        for name, pid in pids.items():
            (root / ".state" / f"{name}.pid").write_text(f"{pid}\n")

    def test_a_port_held_by_a_foreign_process_is_refused(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root), on_apple_silicon():
                self.write_pids(root, jellyfin=111)
                processes = Processes({111: f"{native.jellyfin_executable()} --datadir x", 999: "docker-proxy"})
                with processes.installed(lsof={"18096": [111], "15055": [999]}):
                    with self.assertRaisesRegex(RuntimeError, "15055.*999"):
                        backend.NativeBackend().refuse_foreign(NATIVE)
                with processes.installed(lsof={"18096": [111]}):
                    backend.NativeBackend().refuse_foreign(NATIVE)
            self.assertEqual(processes.signals, [])

    def test_a_reused_pid_running_something_else_is_not_owned(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root), on_apple_silicon():
                self.write_pids(root, jellyfin=111)
                processes = Processes({111: "/usr/bin/some-other-server"})
                with processes.installed(lsof={"18096": [111]}):
                    with self.assertRaisesRegex(RuntimeError, "18096"):
                        backend.NativeBackend().refuse_foreign(NATIVE)
                    backend.NativeBackend().down(NATIVE)
            self.assertEqual(processes.signals, [])

    def test_down_signals_only_owned_live_process_groups(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root):
                self.write_pids(root, jellyfin=111, seerr=222)
                processes = Processes({
                    111: f"{native.jellyfin_executable()} --datadir x",
                    333: f"node {native.seerr_dir() / 'dist' / 'index.js'}",
                })
                with processes.installed():
                    backend.NativeBackend().down(NATIVE)
                self.assertEqual(processes.signals, [(111, signal.SIGTERM)])
                self.assertIn(333, processes.table)
                self.assertFalse((root / ".state" / "jellyfin.pid").exists())
                self.assertFalse((root / ".state" / "seerr.pid").exists())

    def test_down_kills_a_group_that_outlives_the_stop_bound(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root):
                self.write_pids(root, seerr=222)
                processes = Processes({222: f"node {native.seerr_dir() / 'dist' / 'index.js'} ignores-sigterm"})
                clock = iter(range(0, 1000, 10))
                with (
                    processes.installed(),
                    mock.patch.object(native.time, "monotonic", side_effect=lambda: next(clock)),
                    mock.patch.object(native.time, "sleep"),
                ):
                    backend.NativeBackend().down(NATIVE)
                self.assertEqual(processes.signals, [(222, signal.SIGTERM), (222, signal.SIGKILL)])

    def test_up_reuses_running_owned_processes_and_starts_missing_ones_detached(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root), on_apple_silicon():
                self.write_pids(root, jellyfin=111)
                processes = Processes({111: f"{native.jellyfin_executable()} --datadir x"})
                started = []

                def popen(command, **kwargs):
                    started.append((command, kwargs))
                    return mock.Mock(pid=444)

                with (
                    processes.installed(),
                    mock.patch.object(native, "require_node"),
                    mock.patch.object(native, "install_jellyfin"),
                    mock.patch.object(native, "install_ffmpeg"),
                    mock.patch.object(native, "install_seerr"),
                    mock.patch.object(native, "ffmpeg_executable", return_value=Path("/tools/ffmpeg")),
                    mock.patch.object(native.subprocess, "Popen", side_effect=popen),
                ):
                    backend.NativeBackend().up(NATIVE)
                self.assertEqual(len(started), 1)
                command, kwargs = started[0]
                self.assertEqual(command, ["node", str(native.seerr_dir() / "dist" / "index.js")])
                self.assertTrue(kwargs["start_new_session"])
                self.assertEqual(kwargs["cwd"], native.seerr_dir())
                self.assertEqual(kwargs["env"]["CONFIG_DIRECTORY"], str(root / ".state" / "seerr"))
                self.assertEqual((kwargs["env"]["PORT"], kwargs["env"]["HOST"]), ("15055", "127.0.0.1"))
                self.assertEqual((kwargs["env"]["NODE_ENV"], kwargs["env"]["TZ"]), ("production", "UTC"))
                self.assertEqual((root / ".state" / "seerr.pid").read_text(), "444\n")

    def test_jellyfin_starts_with_the_docker_image_layout(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root):
                started = []
                with (
                    Processes({}).installed(),
                    mock.patch.object(native, "ffmpeg_executable", return_value=Path("/tools/ffmpeg")),
                    mock.patch.object(native.subprocess, "Popen", side_effect=lambda command, **kwargs: started.append((command, kwargs)) or mock.Mock(pid=555)),
                ):
                    native.start_jellyfin(NATIVE)
                command, kwargs = started[0]
                state = root / ".state"
                self.assertEqual(command, [
                    str(native.jellyfin_executable()),
                    "--datadir", str(state / "config"), "--configdir", str(state / "config" / "config"),
                    "--cachedir", str(state / "cache"), "--logdir", str(state / "logs" / "jellyfin"),
                    "--webdir", str(native.jellyfin_web()), "--ffmpeg", "/tools/ffmpeg",
                ])
                self.assertEqual(kwargs["env"]["JELLYFIN_PublishedServerUrl"], "http://127.0.0.1:18096")
                self.assertTrue(kwargs["start_new_session"])
                self.assertEqual((state / "jellyfin.pid").read_text(), "555\n")

    def test_network_xml_is_written_only_when_absent(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root):
                path = root / ".state" / "config" / "config" / "network.xml"
                self.assertTrue(native.write_network_config({**NATIVE, "SYNCPLAY_PORT": "18117"}))
                text = path.read_text()
                self.assertIn("<InternalHttpPort>18117</InternalHttpPort>", text)
                self.assertIn("<string>127.0.0.1</string>", text)
                path.write_text("<NetworkConfiguration>rewritten by Jellyfin</NetworkConfiguration>")
                self.assertFalse(native.write_network_config(NATIVE))
                self.assertIn("rewritten by Jellyfin", path.read_text())


class MediaLinkTest(unittest.TestCase):
    def test_the_tag_has_no_digit_and_differs_per_checkout(self):
        tags = set()
        for root in ("/Users/a/22b8179c-5b17-4d99", "/Users/b/streamyfin"):
            with mock.patch.object(setup, "ROOT", Path(root)):
                name = native.media_link().name
            self.assertTrue(name.startswith(native.MEDIA_LINK_PREFIX), name)
            self.assertFalse(any(character.isdigit() for character in name), name)
            self.assertEqual(len(name), len(native.MEDIA_LINK_PREFIX) + native.MEDIA_LINK_TAG_LENGTH)
            tags.add(name)
        self.assertEqual(len(tags), 2)

    def test_the_link_is_created_then_reused(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root):
                link = native.ensure_media_link()
                self.assertEqual(link, native.media_link())
                self.assertEqual(link.parent, root)
                self.assertEqual(Path(os.readlink(link)), setup.STATE)
                self.assertEqual(native.ensure_media_link(), link)
                self.assertEqual(Path(os.readlink(link)), setup.STATE)

    def test_a_link_to_elsewhere_or_a_real_folder_is_refused_and_kept(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root):
                link = native.media_link()
                link.symlink_to(root / "another-checkout" / ".state")
                with self.assertRaisesRegex(RuntimeError, str(link)):
                    native.ensure_media_link()
                self.assertEqual(Path(os.readlink(link)), root / "another-checkout" / ".state")
                link.unlink()
                link.mkdir()
                with self.assertRaisesRegex(RuntimeError, str(link)):
                    native.ensure_media_link()
                self.assertTrue(link.is_dir() and not link.is_symlink())

    def test_up_creates_the_link_before_jellyfin_starts(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root), on_apple_silicon():
                seen = []
                with (
                    mock.patch.object(native, "require_node"),
                    mock.patch.object(native, "install_jellyfin"),
                    mock.patch.object(native, "install_ffmpeg"),
                    mock.patch.object(native, "install_seerr"),
                    mock.patch.object(native, "start_jellyfin", side_effect=lambda owned: seen.append(native.media_link().is_symlink())),
                    mock.patch.object(native, "start_seerr"),
                ):
                    backend.NativeBackend().up(NATIVE)
                self.assertEqual(seen, [True])

    def test_down_removes_only_this_checkouts_link(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            with native_checkout(root), Processes({}).installed():
                link = native.ensure_media_link()
                backend.NativeBackend().down(NATIVE)
                self.assertFalse(link.is_symlink())
                link.symlink_to(root / "another-checkout" / ".state")
                backend.NativeBackend().down(NATIVE)
                self.assertTrue(link.is_symlink())
                link.unlink()
                link.mkdir()
                backend.NativeBackend().down(NATIVE)
                self.assertTrue(link.is_dir())


class InstallTest(unittest.TestCase):
    def test_a_tampered_download_installs_nothing(self):
        with TemporaryDirectory() as directory:
            tools = Path(directory) / ".tools"
            timeouts = []

            def fake_urlopen(url, timeout=None):
                timeouts.append(timeout)
                return BytesIO(b"tampered")

            with (
                mock.patch.object(native, "TOOLS", tools),
                mock.patch.object(download.urllib.request, "urlopen", side_effect=fake_urlopen),
                mock.patch.object(native.subprocess, "run", side_effect=AssertionError("nothing may run")),
            ):
                with self.assertRaisesRegex(RuntimeError, f"^Jellyfin {native.JELLYFIN_VERSION} download checksum mismatch; nothing installed$"):
                    native.install_jellyfin()
                with self.assertRaisesRegex(RuntimeError, f"^jellyfin-ffmpeg {native.FFMPEG_VERSION} download checksum mismatch; nothing installed$"):
                    native.install_ffmpeg()
            self.assertEqual(timeouts, [native.DOWNLOAD_TIMEOUT_SECONDS, native.DOWNLOAD_TIMEOUT_SECONDS])
            self.assertFalse((tools / f"jellyfin-{native.JELLYFIN_VERSION}").exists())
            self.assertFalse((tools / f"jellyfin-ffmpeg-{native.FFMPEG_VERSION}").exists())

    def test_jellyfin_is_installed_with_each_mach_o_resigned_on_a_new_inode(self):
        with TemporaryDirectory() as directory:
            tools = Path(directory) / ".tools"
            payload = b"pinned jellyfin"
            signed = []
            inodes = {}

            def run(command, **kwargs):
                if command[0] == "tar":
                    extracted = Path(command[command.index("-C") + 1])
                    (extracted / "jellyfin" / "jellyfin-web").mkdir(parents=True)
                    (extracted / "jellyfin" / "jellyfin").write_bytes(b"\xcf\xfa\xed\xfe apphost")
                    (extracted / "jellyfin" / "libSkiaSharp.dylib").write_bytes(b"\xcf\xfa\xed\xfe dylib")
                    (extracted / "jellyfin" / "Jellyfin.Server.dll").write_bytes(b"MZ dll")
                    for path in (extracted / "jellyfin").iterdir():
                        inodes[path.name] = path.stat().st_ino
                    return completed()
                if command[0] == "file":
                    return completed("Mach-O 64-bit executable arm64\n" if Path(command[-1]).read_bytes().startswith(b"\xcf") else "PE32 executable\n")
                if command[0] == "codesign":
                    copy = Path(command[-1])
                    self.assertNotIn("jellyfin", copy.relative_to(tools).parts[1:-1])
                    signed.append(copy.read_bytes())
                    return completed()
                raise AssertionError(command)

            with (
                mock.patch.object(native, "TOOLS", tools),
                mock.patch.object(native, "JELLYFIN_SHA256", hashlib.sha256(payload).hexdigest()),
                mock.patch.object(download.urllib.request, "urlopen", return_value=BytesIO(payload)),
                mock.patch.object(native.subprocess, "run", side_effect=run),
            ):
                native.install_jellyfin()
                self.assertEqual(sorted(signed), [b"\xcf\xfa\xed\xfe apphost", b"\xcf\xfa\xed\xfe dylib"])
                folder = native.jellyfin_executable().parent
                self.assertNotEqual(folder.joinpath("jellyfin").stat().st_ino, inodes["jellyfin"])
                self.assertEqual(folder.joinpath("Jellyfin.Server.dll").stat().st_ino, inodes["Jellyfin.Server.dll"])
                with mock.patch.object(download.urllib.request, "urlopen", side_effect=AssertionError("reinstalled")):
                    native.install_jellyfin()

    def test_a_seerr_clone_off_the_pinned_commit_is_refused_before_any_build(self):
        with TemporaryDirectory() as directory:
            tools = Path(directory) / ".tools"
            commands = []

            def run(command, **kwargs):
                commands.append(command)
                if command[:2] == ["git", "clone"]:
                    Path(command[-1]).mkdir(parents=True)
                    return completed()
                if command[:2] == ["git", "-C"]:
                    return completed("0000000000000000000000000000000000000000\n")
                raise AssertionError(command)

            with mock.patch.object(native, "TOOLS", tools), mock.patch.object(native.subprocess, "run", side_effect=run):
                with self.assertRaisesRegex(RuntimeError, "pinned"):
                    native.install_seerr()
            self.assertFalse(any("pnpm" in " ".join(command) for command in commands))
            self.assertFalse((tools / f"seerr-{native.SEERR_TAG}").exists())

    def test_seerr_is_built_with_the_corepack_pnpm_and_marked_complete_after_dist(self):
        with TemporaryDirectory() as directory:
            tools = Path(directory) / ".tools"
            commands = []

            def run(command, **kwargs):
                commands.append((command, kwargs))
                if command[:2] == ["git", "clone"]:
                    Path(command[-1]).mkdir(parents=True)
                elif command[:2] == ["git", "-C"]:
                    return completed(native.SEERR_COMMIT + "\n")
                elif command[-1] == "build":
                    (kwargs["cwd"] / "dist").mkdir()
                    (kwargs["cwd"] / "dist" / "index.js").write_text("")
                return completed()

            with mock.patch.object(native, "TOOLS", tools), mock.patch.object(native.subprocess, "run", side_effect=run):
                native.install_seerr()
                pnpm = [(command, kwargs) for command, kwargs in commands if command[0].endswith("pnpm")]
                self.assertEqual([command[1:] for command, _ in pnpm], [["install", "--frozen-lockfile"], ["build"]])
                for _, kwargs in pnpm:
                    self.assertTrue(kwargs["env"]["PATH"].startswith(str(tools / "bin") + os.pathsep))
                    self.assertEqual(kwargs["env"]["COREPACK_ENABLE_DOWNLOAD_PROMPT"], "0")
                    self.assertEqual(kwargs["env"]["CYPRESS_INSTALL_BINARY"], "0")
                self.assertIn(["corepack", "enable", "--install-directory", str(tools / "bin"), "pnpm"], [c for c, _ in commands])
                count = len(commands)
                native.install_seerr()
                self.assertEqual(len(commands), count)


class MappedPathsTest(unittest.TestCase):
    def test_seed_creates_and_accepts_libraries_at_host_paths(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / ".state"
            state.mkdir()
            inventory_path = root / "inventory.json"
            inventory_path.write_text(json.dumps({"movies": [], "shows": [], "episodes": [], "tracks": []}))
            (state / "credentials.json").write_text(json.dumps({"url": setup.URL, "host": {"token": "t", "userId": "host"}}))
            folders = []
            posts = []
            expected_items = {spec["name"]: spec["expected"] for spec in seed.LIBRARIES}

            def api(path, method="GET", data=None, token=None):
                if path == "/Library/VirtualFolders":
                    return folders
                if path.startswith("/Library/VirtualFolders?"):
                    name = parse_qs(urlsplit(path).query)["name"][0]
                    posts.append((name, data))
                    folders.append({
                        "Name": name, "Locations": [data["LibraryOptions"]["PathInfos"][0]["Path"]],
                        "CollectionType": next(s for s in seed.LIBRARIES if s["name"] == name)["collectionType"],
                        "ItemId": name,
                    })
                    return None
                if path.startswith("/Users/host/Items?"):
                    return {"Items": expected_items[parse_qs(urlsplit(path).query)["ParentId"][0]]}
                if path == "/Library/Refresh":
                    return None
                raise AssertionError(path)

            with (
                native_checkout(root),
                mock.patch.object(setup, "api", side_effect=api),
                mock.patch.object(seed, "catalog_files", return_value=False),
                mock.patch.object(seed.catalog_seed, "generate", return_value=False),
            ):
                seed.seed(inventory_path=inventory_path)
                seed.seed(inventory_path=inventory_path)
                link = native.media_link()
            self.assertEqual(
                {name: data["LibraryOptions"]["PathInfos"] for name, data in posts},
                {
                    "Movies": [{"Path": str(link / "catalog" / "movies")}],
                    "Shows": [{"Path": str(link / "catalog" / "shows")}],
                    "Music": [{"Path": str(link / "catalog" / "music")}],
                },
            )

    def test_enrich_accepts_only_the_host_path_libraries(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)

            def folders(mapped):
                return [
                    {
                        "Name": spec["name"], "CollectionType": spec["collectionType"], "ItemId": spec["name"],
                        "Locations": [str(native.media_link() / spec["mount"].lstrip("/")) if mapped else spec["mount"]],
                    }
                    for spec in seed.LIBRARIES
                ]

            with native_checkout(root):
                with mock.patch.object(setup, "api", return_value=folders(mapped=True)):
                    self.assertEqual(set(enrich.libraries("t")), {"Movies", "Shows", "Music"})
                with mock.patch.object(setup, "api", return_value=folders(mapped=False)):
                    with self.assertRaisesRegex(RuntimeError, "does not own"):
                        enrich.libraries("t")


if __name__ == "__main__":
    unittest.main()
