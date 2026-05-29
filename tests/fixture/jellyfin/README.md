# Jellyfin Test Fixture

Pre-configured Jellyfin Docker container for Streamyfin UI testing.

## Quick Start

```bash
cd tests/fixture/jellyfin
make up
```

This will:
1. Reset to the static config snapshot
2. Start Jellyfin container
3. Wait for health check
4. Run initialization to create demo user and media library

## Credentials

- **Demo User**: `demo_user` / `demo_password`
- **Admin User**: `admin` / `setup123!` (for management)

## Make Targets

| Target | Description |
|--------|-------------|
| `make up` | Start Jellyfin (resets to clean state) |
| `make down` | Stop and remove container |
| `make reset` | Full reset and restart |
| `make status` | Show container status |
| `make wait-ready` | Wait for Jellyfin to be ready |
| `make api-test` | Test API connectivity |
| `make logs` | Show container logs |

## Directory Structure

```
jellyfin/
├── docker-compose.yml      # Docker Compose config
├── Makefile               # Management commands
├── README.md              # This file
├── static/                # Static config snapshot
│   └── config/            # Pre-configured Jellyfin config
│       └── system.xml     # System configuration
├── scripts/               # Helper scripts
│   ├── init-jellyfin.sh   # First-time setup
│   └── api-test.sh        # API connectivity test
├── config/                # Runtime config (mounted to container)
├── cache/                 # Runtime cache (mounted to container)
└── media/                 # Media files (read-only mount)
    ├── movies/            # Movie files
    └── shows/             # TV shows
```

## Adding Media

Place movie files in `media/movies/` and TV shows in `media/shows/`. The container mounts these as read-only.

## Integration with Maestro Tests

Set your `.env.local` to point to the local Jellyfin:

```bash
MAESTRO_SERVER_URL=http://localhost:8096
MAESTRO_USERNAME=demo_user
MAESTRO_PASSWORD=demo_password
```

## API Usage

```bash
# Test connectivity
make api-test

# Or manually with curl
export JELLYFIN_URL=http://localhost:8096
export USERNAME=demo_user
export PASSWORD=demo_password

# Authenticate
TOKEN=$(curl -s $JELLYFIN_URL/Users/AuthenticateByName \
  -H "Content-Type: application/json" \
  -d "{\"Username\":\"$USERNAME\",\"Pw\":\"$PASSWORD\"}" \
  | jq -r .AccessToken)

# Get movies
curl -s $JELLYFIN_URL/Users/Me/Items?IncludeItemTypes=Movie \
  -H "Authorization: MediaBrowser Token=$TOKEN" | jq
```
