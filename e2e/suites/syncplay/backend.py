"""Where this checkout's Jellyfin and Seerr run: Docker Compose, or host processes.

The fixture commands reach the servers only through these methods, so both backends
serve them alike. `setup.backend()` picks one from SYNCPLAY_BACKEND.
"""

import json
import os
from pathlib import Path
import subprocess

from suites.syncplay import native, setup

DOCKER_JELLYFIN_HOSTNAME = "jellyfin"  # the compose service name, reachable on the shared network
DOCKER_JELLYFIN_PORT = 8096
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
        setup.refuse_foreign_project(owned["SYNCPLAY_PROJECT"])

    def compose(self, owned, *arguments):
        subprocess.run(
            ["docker", "compose", "-p", owned["SYNCPLAY_PROJECT"], "-f", str(setup.ROOT / "compose.yml"), *arguments],
            check=True, env={**os.environ, **owned},
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


BACKENDS = {"docker": DockerBackend, "native": NativeBackend}


def for_identity(owned):
    return BACKENDS[owned.get("SYNCPLAY_BACKEND", "docker")]()
