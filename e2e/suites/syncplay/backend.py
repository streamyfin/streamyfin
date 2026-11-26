"""Where this checkout's Jellyfin, Seerr and Radarr run: Docker Compose, or host processes.

The fixture commands reach the servers only through these methods, so both backends
serve them alike. `setup.backend()` picks one from SYNCPLAY_BACKEND.
"""

import json
import os
from pathlib import Path
import subprocess

from suites.syncplay import native, radarr, setup

DOCKER_JELLYFIN_HOSTNAME = "jellyfin"  # the compose service name, reachable on the shared network
DOCKER_JELLYFIN_PORT = 8096
DOCKER_RADARR_HOSTNAME = "radarr"
DOCKER_RADARR_MEDIA = "/radarr-media"  # where compose.yml mounts .state/radarr-media
SEERR_CONTAINER_UID = 1000


def docker_jellyfin_container():
    """Identify the running container by this checkout's config mount and host port."""
    ids = subprocess.check_output(["docker", "ps", "-q"], text=True).splitlines()
    if not ids:
        raise RuntimeError("No running Docker containers")
    containers = json.loads(subprocess.check_output(["docker", "inspect", *ids], text=True))
    expected_config = (setup.STATE / "config").resolve()
    expected_compose = str((setup.ROOT / "compose.yml").resolve())
    port = setup.URL.rsplit(":", 1)[1]
    matches = [
        container["Id"]
        for container in containers
        if container.get("Config", {}).get("Labels", {}).get("com.docker.compose.project.config_files") == expected_compose
        and any(
            mount["Destination"] == "/config" and Path(mount["Source"]).resolve() == expected_config
            for mount in container["Mounts"]
        )
        and any(
            mapping["HostPort"] == port and mapping["HostIp"] == "127.0.0.1"
            for mapping in (container.get("NetworkSettings", {}).get("Ports", {}).get("8096/tcp") or [])
        )
    ]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one worktree Jellyfin container on {setup.URL}, got {len(matches)}")
    return matches[0]


class DockerBackend:
    name = "docker"

    def refuse_foreign(self, owned):
        setup.refuse_foreign_container(owned["SYNCPLAY_CONTAINER"])
        setup.refuse_foreign_container(owned["SYNCPLAY_SEERR_CONTAINER"])
        setup.refuse_foreign_container(owned["SYNCPLAY_RADARR_CONTAINER"])
        setup.refuse_foreign_project(owned["SYNCPLAY_PROJECT"])

    def compose(self, owned, *arguments):
        subprocess.run(
            ["docker", "compose", "-p", owned["SYNCPLAY_PROJECT"], "-f", str(setup.ROOT / "compose.yml"), *arguments],
            # The linuxserver Radarr image re-owns /config to PUID:PGID, which compose.yml reads
            # from these; any other uid leaves config.xml unreadable to setup on Linux.
            check=True, env={**os.environ, **owned, "SYNCPLAY_UID": str(os.getuid()), "SYNCPLAY_GID": str(os.getgid())},
        )

    def up(self, owned):
        # Seerr runs as uid 1000: the bind-mounted config must be writable by it on Linux too.
        # Only widen a directory uid 1000 cannot already write (owned by uid 1000 or
        # world-writable+executable); a tighter preexisting mode is left alone.
        seerr_dir = setup.STATE / "seerr"
        stat = seerr_dir.stat()
        uid_can_write = stat.st_uid == SEERR_CONTAINER_UID or (stat.st_mode & 0o003) == 0o003
        if not uid_can_write:
            try:
                seerr_dir.chmod(0o777)
            except PermissionError as error:
                raise RuntimeError(f"Cannot open {seerr_dir} for the Seerr container's uid 1000; fix its ownership or remove it first") from error
        self.compose(owned, "up", "-d")

    def down(self, owned):
        self.compose(owned, "down", "--remove-orphans")

    def restart_jellyfin(self, owned):
        subprocess.run(["docker", "restart", docker_jellyfin_container()], check=True, stdout=subprocess.DEVNULL)

    def host_path(self, container_path):
        return container_path

    def jellyfin_address_for_seerr(self, owned):
        return (DOCKER_JELLYFIN_HOSTNAME, DOCKER_JELLYFIN_PORT)

    def radarr_listen(self, owned):
        """Radarr listens on every interface inside the container; compose binds the host side."""
        return ("*", radarr.CONTAINER_PORT)

    def radarr_path(self, name):
        return f"{DOCKER_RADARR_MEDIA}/{name}"

    def radarr_address_for_seerr(self, owned):
        return (DOCKER_RADARR_HOSTNAME, radarr.CONTAINER_PORT)


class NativeBackend:
    name = "native"

    def refuse_foreign(self, owned):
        native.refuse_foreign(owned)

    def up(self, owned):
        native.up(owned)

    def down(self, owned):
        native.down(owned)

    def restart_jellyfin(self, owned):
        native.restart_jellyfin(owned)

    def host_path(self, container_path):
        """The host path of the folder compose.yml mounts at container_path, read through the
        media link: /media is <media link>/media, which resolves to .state/media."""
        return str(native.media_link() / container_path.lstrip("/"))

    def jellyfin_address_for_seerr(self, owned):
        return (native.LOOPBACK, int(owned["SYNCPLAY_PORT"]))

    def radarr_listen(self, owned):
        return (native.LOOPBACK, int(owned["SYNCPLAY_RADARR_PORT"]))

    radarr_address_for_seerr = radarr_listen

    def radarr_path(self, name):
        return str(radarr.media_dir() / name)


BACKENDS = {"docker": DockerBackend, "native": NativeBackend}


def for_identity(owned):
    return BACKENDS[owned.get("SYNCPLAY_BACKEND", "docker")]()
