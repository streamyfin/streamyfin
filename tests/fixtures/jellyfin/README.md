# Jellyfin Test Fixture

Preconfigured Jellyfin Docker container for Streamyfin UI and API testing.

## Quick Start

From the repository root:

```bash
make jellyfin-up
make jellyfin-api-test
```

From this fixture directory:

```bash
make up
make api-test
```

Generated media files are ignored by Git. Use `make jellyfin-download-media` to download and transcode the stable public source URLs without starting Jellyfin.

To rebuild `base_config` safely, configure Jellyfin through the UI and then snapshot the resulting config:

```bash
make jellyfin-clean-media
make jellyfin-up-clean
# In Jellyfin: create admin/admin and add libraries for /media/movies, /media/shows, and /media/music.
make jellyfin-save-config
make jellyfin-down
make jellyfin-download-media
make jellyfin-up
```

The fixture intentionally does not seed Jellyfin's database directly. The saved `base_config` should come from Jellyfin's own setup flow.

## Credentials

- User: `admin`
- Password: `admin`

## Media Set

The fixture media set is small and covers the main Jellyfin library shapes:

- Movies: `Big Buck Bunny (2008)` and `Steamboat Willie (1928)`
- Shows: one episode each from `The Beverly Hillbillies` and `The Lucy Show`
- Music: one public-domain Scott Joplin `Maple Leaf Rag` MP3

Movie and show folders include provider IDs such as `[imdbid-...]` and `[tvdbid-...]` so Jellyfin has deterministic metadata hints.

## Make Targets

| Target | Description |
|--------|-------------|
| `make up` | Start Jellyfin from `base_config` and publish URLs |
| `make clean-media` | Delete generated media while preserving media directories |
| `make download-media` | Download/transcode public fixture media |
| `make up-clean` | Start Jellyfin with blank runtime config |
| `make save-config` | Snapshot current runtime config into `base_config` |
| `make reset` | Stop/remove runtime container and start blank Jellyfin for manual setup |
| `make down` | Stop and remove container and volumes |
| `make status` | Show container status |
| `make wait-ready` | Wait for Jellyfin to respond |
| `make api-test` | Test API connectivity, login, libraries, movies, episodes, and audio tracks |
| `make configure-urls` | Update Maestro env with the reachable Jellyfin URL and trigger a library scan |
| `make logs` | Follow container logs |

## Directory Structure

```text
jellyfin/
├── base_config/           # Saved Jellyfin config snapshot
├── cache/                 # Runtime cache, ignored
├── config/                # Runtime config, ignored
├── media/                 # Read-only media mount
│   ├── music/
│   ├── movies/
│   └── shows/
├── scripts/               # Helper scripts
├── docker-compose.yml
├── Makefile
└── README.md
```

## Maestro Integration

`make jellyfin-up` and `make jellyfin-configure-urls` update `tests/maestro/.env.local` with `MAESTRO_SERVER_URL`. Jellyfin's own network configuration is not rewritten by the fixture.
