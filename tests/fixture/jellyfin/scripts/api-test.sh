#!/bin/bash
# Test Jellyfin API connectivity and login

set -e

JELLYFIN_URL="${1:-http://localhost:8096}"
USERNAME="${2:-admin}"
PASSWORD="${3:-admin}"

echo "Testing Jellyfin API at $JELLYFIN_URL..."

# Test 1: Public system info
echo -n "1. Public System Info: "
PUBLIC_INFO=$(curl -sf "$JELLYFIN_URL/System/Info/Public" 2>&1) && echo "OK" || { echo "FAIL"; exit 1; }
echo "   Server: $(echo "$PUBLIC_INFO" | grep -o '"ServerName":"[^"]*"' | cut -d'"' -f4 || echo 'N/A')"
echo "   Version: $(echo "$PUBLIC_INFO" | grep -o '"Version":"[^"]*"' | cut -d'"' -f4 || echo 'N/A')"

# Test 2: Authentication
echo -n "2. Authentication: "
AUTH_RESULT=$(curl -sf "$JELLYFIN_URL/Users/AuthenticateByName" \
    -H "Authorization: MediaBrowser Client=TestScript, Device=Test, DeviceId=test123, Version=1.0" \
    -H "Content-Type: application/json" \
    -d "{\"Username\":\"$USERNAME\",\"Pw\":\"$PASSWORD\"}" 2>&1) && echo "OK" || { echo "FAIL"; exit 1; }

USER_ID=$(echo "$AUTH_RESULT" | grep -o '"UserId":"[^"]*"' | head -1 | cut -d'"' -f4)
ACCESS_TOKEN=$(echo "$AUTH_RESULT" | grep -o '"AccessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   User ID: $USER_ID"
echo "   Token: ${ACCESS_TOKEN:0:20}..."

# Test 3: Get user info
echo -n "3. User Info: "
USER_INFO=$(curl -sf "$JELLYFIN_URL/Users/$USER_ID" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" 2>&1) && echo "OK" || { echo "FAIL"; exit 1; }
echo "   Name: $(echo "$USER_INFO" | grep -o '"Name":"[^"]*"' | head -1 | cut -d'"' -f4 || echo 'N/A')"

# Test 4: List libraries
echo -n "4. Media Libraries: "
LIBS=$(curl -sf "$JELLYFIN_URL/Library/VirtualFolders" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" 2>&1) && echo "OK" || { echo "OK (none configured)"; LIBS=""; }
if [ -n "$LIBS" ]; then
    echo "$LIBS" | grep -o '"Name":"[^"]*"' | cut -d'"' -f4 | while read lib; do
        echo "   - $lib"
    done
fi

# Test 5: List movies (if any)
echo -n "5. Movies in library: "
ITEMS=$(curl -sf "$JELLYFIN_URL/Users/$USER_ID/Items?IncludeItemTypes=Movie&Recursive=true&Limit=5" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" 2>&1)
COUNT=$(echo "$ITEMS" | grep -o '"TotalRecordCount":[0-9]*' | cut -d':' -f2 || echo "0")
echo "$COUNT items found"

if [ "$COUNT" -gt 0 ]; then
    echo "$ITEMS" | grep -o '"Name":"[^"]*"' | cut -d'"' -f4 | while read movie; do
        echo "   - $movie"
    done
fi

echo ""
echo "All API tests passed!"
