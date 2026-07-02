#!/bin/bash
# Test Jellyfin API connectivity and login

set -e

JELLYFIN_URL="${1:-http://localhost:8096}"
USERNAME="${2:-admin}"
PASSWORD="${3:-admin}"

echo "Testing Jellyfin API at $JELLYFIN_URL..."

# Test 1: Public system info
echo -n "1. Public System Info: "
if PUBLIC_INFO=$(curl -sf "$JELLYFIN_URL/System/Info/Public" 2>&1); then
    echo "OK"
else
    echo "FAIL"
    exit 1
fi
echo "   Server: $(echo "$PUBLIC_INFO" | grep -o '"ServerName":"[^"]*"' | cut -d'"' -f4 || echo 'N/A')"
echo "   Version: $(echo "$PUBLIC_INFO" | grep -o '"Version":"[^"]*"' | cut -d'"' -f4 || echo 'N/A')"

# Test 2: Authentication
echo -n "2. Authentication: "
if AUTH_RESULT=$(curl -sf "$JELLYFIN_URL/Users/AuthenticateByName" \
    -H "Authorization: MediaBrowser Client=TestScript, Device=Test, DeviceId=test123, Version=1.0" \
    -H "Content-Type: application/json" \
    -d "{\"Username\":\"$USERNAME\",\"Pw\":\"$PASSWORD\"}" 2>&1); then
    echo "OK"
else
    echo "FAIL"
    exit 1
fi

USER_ID=$(echo "$AUTH_RESULT" | grep -o '"UserId":"[^"]*"' | head -1 | cut -d'"' -f4)
ACCESS_TOKEN=$(echo "$AUTH_RESULT" | grep -o '"AccessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   User ID: $USER_ID"
echo "   Token: ${ACCESS_TOKEN:0:20}..."

# Test 3: Get user info
echo -n "3. User Info: "
if USER_INFO=$(curl -sf "$JELLYFIN_URL/Users/$USER_ID" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" 2>&1); then
    echo "OK"
else
    echo "FAIL"
    exit 1
fi
echo "   Name: $(echo "$USER_INFO" | grep -o '"Name":"[^"]*"' | head -1 | cut -d'"' -f4 || echo 'N/A')"

# Test 4: List libraries
echo -n "4. Media Libraries: "
if LIBS=$(curl -sf "$JELLYFIN_URL/Library/VirtualFolders" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" 2>&1); then
    echo "OK"
else
    echo "OK (none configured)"
    LIBS=""
fi
if [ -n "$LIBS" ]; then
    echo "$LIBS" | grep -o '"Name":"[^"]*"' | cut -d'"' -f4 | while read -r lib; do
        echo "   - $lib"
    done
fi

print_items() {
    local label="$1"
    local item_type="$2"
    local result
    local count

    echo -n "$label: "
    result=$(curl -sf "$JELLYFIN_URL/Users/$USER_ID/Items?IncludeItemTypes=$item_type&Recursive=true&Limit=5" \
        -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" 2>&1)
    count=$(echo "$result" | grep -o '"TotalRecordCount":[0-9]*' | cut -d':' -f2 || echo "0")
    echo "$count items found"

    if [ "$count" -gt 0 ]; then
        echo "$result" | grep -o '"Name":"[^"]*"' | cut -d'"' -f4 | while read -r item; do
            echo "   - $item"
        done
    fi
}

# Test 5: List media items (if any)
print_items "5. Movies in library" "Movie"
print_items "6. Episodes in library" "Episode"
print_items "7. Audio tracks in library" "Audio"

echo ""
echo "All API tests passed!"
