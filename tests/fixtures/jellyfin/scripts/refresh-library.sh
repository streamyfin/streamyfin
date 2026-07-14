#!/bin/bash
# Trigger a Jellyfin library scan using the fixture username/password.

set -euo pipefail

JELLYFIN_URL="${1:-http://localhost:8096}"
USERNAME="${2:-admin}"
PASSWORD="${3:-admin}"

echo "Logging in to Jellyfin to request a library scan..."
LOGIN_RESULT=$(curl -sf "$JELLYFIN_URL/Users/AuthenticateByName" \
    -H "Authorization: MediaBrowser Client=TestScript, Device=LibraryScan, DeviceId=library-scan, Version=1.0" \
    -H "Content-Type: application/json" \
    -d "{\"Username\":\"$USERNAME\",\"Pw\":\"$PASSWORD\"}" 2>&1)

ACCESS_TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"AccessToken":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
    echo "Error: Login failed; cannot trigger library scan"
    echo "$LOGIN_RESULT" | head -c 500
    exit 1
fi

echo "Requesting Jellyfin library refresh..."
curl -sf -X POST "$JELLYFIN_URL/Library/Refresh" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" \
    > /dev/null

echo "Library scan requested."
