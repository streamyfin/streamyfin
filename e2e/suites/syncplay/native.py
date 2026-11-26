"""Run this checkout's Jellyfin, Seerr and Radarr as host processes, for Macs that cannot run Docker.

Standard Apple silicon GitHub runners have no nested virtualization, so Docker cannot run
there. Every download is pinned by hash or commit and verified before it is used. Tools
live in `.tools/`, outside `.state/`, so a teardown keeps them and CI can cache them.
"""

from contextlib import suppress
import hashlib
import os
from pathlib import Path
import platform
import shutil
import signal
import subprocess
from tempfile import TemporaryDirectory
import time

from bench.download import fetch_verified
from suites.syncplay import radarr, setup

TOOLS = setup.ROOT / ".tools"

JELLYFIN_VERSION = "10.11.11"
JELLYFIN_URL = (
    "https://repo.jellyfin.org/files/server/macos/stable/"
    f"v{JELLYFIN_VERSION}/arm64/jellyfin_{JELLYFIN_VERSION}-arm64.tar.xz"
)
JELLYFIN_SHA256 = "27c0bcbeac7a698cf0fd034e347f124f69083bc4463816099b52bebead614a47"
FFMPEG_VERSION = "7.1.4-3"
FFMPEG_URL = (
    "https://github.com/jellyfin/jellyfin-ffmpeg/releases/download/"
    f"v{FFMPEG_VERSION}/jellyfin-ffmpeg_{FFMPEG_VERSION}_portable_macarm64-gpl.tar.xz"
)
FFMPEG_SHA256 = "99d689816a41075574928a0b3059101fd454fc58f465c99105a73b5c415ac86d"
SEERR_TAG = "v3.5.0"
SEERR_REPO = "https://github.com/seerr-team/seerr.git"
SEERR_COMMIT = "e2f24cb46079746936516c723b09820360f95113"
# Seerr's package.json engines range; its install enforces it with engine-strict.
NODE_RANGE = "^22.19.0"
NODE_MAJOR = 22
NODE_MIN_MINOR = 19
SEERR_BUILT_MARKER = ".streamyfin-built"
# Keep in lockstep with the radarr image in compose.yml. Its Mach-O files ship signed.
RADARR_VERSION = "7.0.3.10918"
RADARR_URL = (
    "https://github.com/Radarr/Radarr/releases/download/"
    f"v{RADARR_VERSION}/Radarr.master.{RADARR_VERSION}.osx-core-arm64.tar.gz"
)
RADARR_SHA256 = "e77f93c2e29a94703c727dca3c1dd98bb26c5f53ba5737d3f89100f96ea08fac"

# Jellyfin 10.11 parses season and episode numbers out of the full media path, so a digit
# run such as `5b17-4d99` in a checkout path overrides every NFO. Jellyfin reads media
# through a link whose path holds no digit, one per checkout.
MEDIA_LINK_BASE = Path("/tmp")
MEDIA_LINK_PREFIX = "streamyfin-media-"
MEDIA_LINK_TAG_LENGTH = 16

LOOPBACK = "127.0.0.1"
DOWNLOAD_TIMEOUT_SECONDS = 300
STOP_TIMEOUT_SECONDS = 30
STOP_POLL_SECONDS = 0.5

# Jellyfin fills in every other element with its default and rewrites the file at first start.
NETWORK_XML = """<?xml version="1.0" encoding="utf-8"?>
<NetworkConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <InternalHttpPort>{port}</InternalHttpPort>
  <LocalNetworkAddresses><string>{address}</string></LocalNetworkAddresses>
</NetworkConfiguration>
"""


def require_platform():
    if platform.system() != "Darwin" or platform.machine() != "arm64":
        raise RuntimeError(
            f"SYNCPLAY_BACKEND=native needs macOS on Apple silicon, not {platform.system()} {platform.machine()}; "
            "use SYNCPLAY_BACKEND=docker"
        )


def require_node():
    try:
        version = subprocess.run(["node", "-v"], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as error:
        raise RuntimeError(f"Seerr {SEERR_TAG} needs Node {NODE_RANGE} on PATH") from error
    major, minor = (int(part) for part in version.lstrip("v").split(".")[:2])
    if major != NODE_MAJOR or minor < NODE_MIN_MINOR:
        raise RuntimeError(f"Seerr {SEERR_TAG} needs Node {NODE_RANGE}, found {version}")


def jellyfin_dir():
    return TOOLS / f"jellyfin-{JELLYFIN_VERSION}"


def jellyfin_executable():
    return jellyfin_dir() / "jellyfin" / "jellyfin"


def jellyfin_web():
    return jellyfin_dir() / "jellyfin" / "jellyfin-web"


def ffmpeg_dir():
    return TOOLS / f"jellyfin-ffmpeg-{FFMPEG_VERSION}"


def ffmpeg_executable():
    return next(path for path in ffmpeg_dir().rglob("ffmpeg") if path.is_file())


def seerr_dir():
    return TOOLS / f"seerr-{SEERR_TAG}"


def seerr_entry():
    return seerr_dir() / "dist" / "index.js"


def radarr_dir():
    return TOOLS / f"radarr-{RADARR_VERSION}"


def radarr_executable():
    return radarr_dir() / "Radarr" / "Radarr"


def download_verified(url, sha256, name):
    return fetch_verified(url, sha256, name, DOWNLOAD_TIMEOUT_SECONDS)


def install_archive(target, url, sha256, name, prepare=None):
    """Extract a verified tarball into place in one rename, so a present target is complete."""
    if target.exists():
        return target
    archive = download_verified(url, sha256, name)
    TOOLS.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(dir=TOOLS) as temporary:
        work = Path(temporary)
        (work / "archive").write_bytes(archive)
        extracted = work / "extracted"
        extracted.mkdir()
        # tar detects the compression itself: Jellyfin ships xz, Radarr gzip.
        subprocess.run(["tar", "-xf", str(work / "archive"), "-C", str(extracted)], check=True)
        if prepare:
            prepare(extracted, work)
        extracted.rename(target)
    return target


def sign_mach_o(folder, scratch):
    """Sign every Mach-O file ad hoc: Apple silicon kills unsigned arm64 code (exit 137).

    codesign refuses a file inside the folder over the unsigned .NET DLLs beside it, so it
    signs a copy outside. The copy replaces the original as a new inode, because the kernel
    caches its verdict per inode.
    """
    for path in sorted(folder.rglob("*")):
        if path.is_symlink() or not path.is_file():
            continue
        kind = subprocess.run(["file", "-b", str(path)], capture_output=True, text=True, check=True).stdout
        if "Mach-O" not in kind:
            continue
        copy = scratch / "signing"
        shutil.copy2(path, copy)
        subprocess.run(["codesign", "-fs", "-", str(copy)], check=True, capture_output=True)
        os.replace(copy, path)


def install_jellyfin():
    def prepare(extracted, work):
        layout = extracted / "jellyfin"
        if not (layout / "jellyfin").is_file() or not (layout / "jellyfin-web").is_dir():
            raise RuntimeError(f"Jellyfin {JELLYFIN_VERSION} tarball lacks jellyfin/jellyfin or jellyfin/jellyfin-web")
        sign_mach_o(extracted, work)

    return install_archive(jellyfin_dir(), JELLYFIN_URL, JELLYFIN_SHA256, f"Jellyfin {JELLYFIN_VERSION}", prepare)


def install_ffmpeg():
    return install_archive(ffmpeg_dir(), FFMPEG_URL, FFMPEG_SHA256, f"jellyfin-ffmpeg {FFMPEG_VERSION}")


def install_radarr():
    def prepare(extracted, work):
        if not (extracted / "Radarr" / "Radarr").is_file():
            raise RuntimeError(f"Radarr {RADARR_VERSION} tarball lacks Radarr/Radarr")

    return install_archive(radarr_dir(), RADARR_URL, RADARR_SHA256, f"Radarr {RADARR_VERSION}", prepare)


def install_seerr():
    """Clone and build the pinned Seerr in place.

    The build is not moved after it finishes, since its output may record the folder it was
    built in. A marker written after dist/index.js exists tells a complete build from an
    interrupted one, which is removed and rebuilt.
    """
    folder = seerr_dir()
    if (folder / SEERR_BUILT_MARKER).is_file():
        return folder
    if folder.exists():
        shutil.rmtree(folder)
    TOOLS.mkdir(parents=True, exist_ok=True)
    subprocess.run(["git", "clone", "--quiet", "--depth", "1", "--branch", SEERR_TAG, SEERR_REPO, str(folder)], check=True)
    head = subprocess.run(["git", "-C", str(folder), "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    if head != SEERR_COMMIT:
        shutil.rmtree(folder)
        raise RuntimeError(f"Seerr {SEERR_TAG} resolved to {head}, not the pinned {SEERR_COMMIT}; nothing built")
    # Seerr's build script calls pnpm by name, so corepack's shim must be on PATH.
    bin_dir = TOOLS / "bin"
    bin_dir.mkdir(exist_ok=True)
    subprocess.run(["corepack", "enable", "--install-directory", str(bin_dir), "pnpm"], check=True)
    env = {
        **os.environ,
        "PATH": f"{bin_dir}{os.pathsep}{os.environ.get('PATH', '')}",
        "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0",
        "CYPRESS_INSTALL_BINARY": "0",
    }
    pnpm = str(bin_dir / "pnpm")
    subprocess.run([pnpm, "install", "--frozen-lockfile"], cwd=folder, env=env, check=True)
    subprocess.run([pnpm, "build"], cwd=folder, env=env, check=True)
    if not seerr_entry().is_file():
        raise RuntimeError(f"Seerr {SEERR_TAG} built without {seerr_entry()}")
    (folder / SEERR_BUILT_MARKER).write_text(SEERR_COMMIT + "\n")
    return folder


def media_link():
    """This checkout's link path: a sha256 of ROOT with each hex digit mapped to a letter."""
    digest = hashlib.sha256(str(setup.ROOT.resolve()).encode()).hexdigest()
    tag = "".join(chr(ord("a") + int(digit, 16)) for digit in digest[:MEDIA_LINK_TAG_LENGTH])
    return MEDIA_LINK_BASE / f"{MEDIA_LINK_PREFIX}{tag}"


def owns_media_link(link):
    return link.is_symlink() and Path(os.readlink(link)) == setup.STATE


def ensure_media_link():
    """Link media_link() to STATE; refuse a path that is anything else."""
    link = media_link()
    with suppress(FileExistsError):
        link.symlink_to(setup.STATE, target_is_directory=True)
    if not owns_media_link(link):
        raise RuntimeError(f"{link} exists and is not this checkout's link to {setup.STATE}; remove it, then rerun setup")
    return link


def pid_file(name):
    return setup.STATE / f"{name}.pid"


def alive(pid):
    """Whether pid is a live process this user may signal; a finished child of ours is reaped."""
    with suppress(ChildProcessError):
        if os.waitpid(pid, os.WNOHANG)[0]:
            return False
    try:
        os.kill(pid, 0)
    except (ProcessLookupError, PermissionError):
        return False
    return True


def command_marker(name):
    """The absolute path in the command line of this checkout's process. A PID file outlives a
    reboot, and the PID in it may then belong to an unrelated process."""
    return str({"jellyfin": jellyfin_executable, "seerr": seerr_entry, "radarr": radarr_executable}[name]())


def owned_pid(name):
    try:
        pid = int(pid_file(name).read_text().strip())
    except (FileNotFoundError, ValueError):
        return None
    if not alive(pid):
        return None
    command = subprocess.run(["ps", "-ww", "-o", "command=", "-p", str(pid)], capture_output=True, text=True).stdout
    return pid if command_marker(name) in command else None


def refuse_foreign(owned):
    """Refuse a fixture port that a process outside this checkout's PID files listens on."""
    require_platform()
    ours = {pid for pid in map(owned_pid, ("jellyfin", "seerr", "radarr")) if pid is not None}
    for key in ("SYNCPLAY_PORT", "SYNCPLAY_SEERR_PORT", "SYNCPLAY_RADARR_PORT"):
        port = owned[key]
        listing = subprocess.run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"], capture_output=True, text=True)
        foreign = sorted({int(pid) for pid in listing.stdout.split()} - ours)
        if foreign:
            raise RuntimeError(
                f"Port {port} is held by PID {', '.join(map(str, foreign))}, not this checkout's fixture. "
                f"Pass a free {key}, or stop that process."
            )


def start(name, command, env, cwd=None):
    logs = setup.STATE / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    with open(logs / f"{name}.log", "ab") as log:
        # A new session keeps the server alive after this command exits, and gives it a
        # process group of its own for stop() to signal.
        process = subprocess.Popen(
            command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            env=env, cwd=cwd, start_new_session=True,
        )
    pid_file(name).write_text(f"{process.pid}\n")


def stop(name):
    """Stop the process group of an owned, live PID: SIGTERM, then SIGKILL after the bound."""
    pid = owned_pid(name)
    if pid is not None:
        with suppress(ProcessLookupError):
            os.killpg(pid, signal.SIGTERM)
        deadline = time.monotonic() + STOP_TIMEOUT_SECONDS
        while alive(pid) and time.monotonic() < deadline:
            time.sleep(STOP_POLL_SECONDS)
        if alive(pid):
            with suppress(ProcessLookupError):
                os.killpg(pid, signal.SIGKILL)
    pid_file(name).unlink(missing_ok=True)


def write_network_config(owned):
    """Set the port and bind only when absent: after its first start, the file is Jellyfin's."""
    path = setup.STATE / "config" / "config" / "network.xml"
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(NETWORK_XML.format(port=owned["SYNCPLAY_PORT"], address=LOOPBACK))
    return True


def start_jellyfin(owned):
    """Start Jellyfin with the Docker image's layout: data in /config, config in /config/config."""
    if owned_pid("jellyfin") is not None:
        return
    state = setup.STATE
    write_network_config(owned)
    (state / "cache").mkdir(parents=True, exist_ok=True)
    (state / "logs" / "jellyfin").mkdir(parents=True, exist_ok=True)
    start("jellyfin", [
        str(jellyfin_executable()),
        "--datadir", str(state / "config"), "--configdir", str(state / "config" / "config"),
        "--cachedir", str(state / "cache"), "--logdir", str(state / "logs" / "jellyfin"),
        "--webdir", str(jellyfin_web()), "--ffmpeg", str(ffmpeg_executable()),
    ], env={**os.environ, "JELLYFIN_PublishedServerUrl": f"http://{LOOPBACK}:{owned['SYNCPLAY_PORT']}"})


def start_seerr(owned):
    if owned_pid("seerr") is not None:
        return
    config = setup.STATE / "seerr"
    config.mkdir(parents=True, exist_ok=True)
    start("seerr", ["node", str(seerr_entry())], env={
        **os.environ, "NODE_ENV": "production", "CONFIG_DIRECTORY": str(config),
        "PORT": owned["SYNCPLAY_SEERR_PORT"], "HOST": LOOPBACK, "TZ": "UTC",
    }, cwd=seerr_dir())


def start_radarr(owned):
    """Radarr reads its port, bind and API key from the config.xml setup writes first."""
    if owned_pid("radarr") is not None:
        return
    start("radarr", [str(radarr_executable()), "-nobrowser", f"-data={radarr.config_dir()}"], env={**os.environ, "TZ": "UTC"})


def up(owned):
    require_platform()
    require_node()
    install_jellyfin()
    install_ffmpeg()
    install_seerr()
    install_radarr()
    ensure_media_link()
    start_jellyfin(owned)
    start_seerr(owned)
    start_radarr(owned)


def down(owned):
    stop("radarr")
    stop("seerr")
    stop("jellyfin")
    link = media_link()
    if owns_media_link(link):
        link.unlink()


def restart_jellyfin(owned):
    stop("jellyfin")
    start_jellyfin(owned)
