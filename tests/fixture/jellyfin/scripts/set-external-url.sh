#!/bin/bash
# Set Jellyfin external/public URL for Android emulator access

set -e

JELLYFIN_URL="${1:-http://localhost:8096}"
USERNAME="${2:-admin}"
PASSWORD="${3:-admin}"
EXTERNAL_URL="${4:-http://10.0.2.2:8096}"

echo "Setting external URL to: $EXTERNAL_URL"

# Login and get token
LOGIN_RESULT=$(curl -s -X POST "$JELLYFIN_URL/Users/AuthenticateByName" \
    -H "Authorization: MediaBrowser Client=TestScript, Device=Init, DeviceId=init, Version=1.0" \
    -H "Content-Type: application/json" \
    -d "{\"Username\":\"$USERNAME\",\"Pw\":\"$PASSWORD\"}" 2>&1)

if ! echo "$LOGIN_RESULT" | grep -q "AccessToken"; then
    echo "Error: Login failed"
    echo "$LOGIN_RESULT" | head -c 500
    exit 1
fi

ACCESS_TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"AccessToken":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "Logged in, fetching current configuration..."

# Get full current network config
curl -s "$JELLYFIN_URL/System/Configuration/Network" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" \
    -H "Content-Type: application/json" > /tmp/network-config.json

echo "Updating external URL to: $EXTERNAL_URL"

# Create updated config - Jellyfin requires all fields, so we modify the existing JSON
python3 -c "
import json
with open('/tmp/network-config.json') as f:
    config = json.load(f)

# Set the external URL (PublishedServerUriBySubnet is used for external access)
config['PublishedServerUriBySubnet'] = ['$EXTERNAL_URL']
config['EnableRemoteAccess'] = True

# Write updated config
with open('/tmp/network-config.json', 'w') as f:
    json.dump(config, f)
print('Config updated with external URL: $EXTERNAL_URL')
" 2>/dev/null || {
    # Fallback if python3 not available
    echo "Warning: Could not use Python to update config, trying direct curl..."
}

# Update network config
curl -s -X POST "$JELLYFIN_URL/System/Configuration/Network" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d @/tmp/network-config.json > /dev/null

echo "Configuration sent, waiting for it to take effect..."

# Verify
NEW_CONFIG=$(curl -s "$JELLYFIN_URL/System/Configuration/Network" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN")

if echo "$NEW_CONFIG" | grep -q "$EXTERNAL_URL"; then
    echo "✅ PublishedServerUriBySubnet set successfully to: $EXTERNAL_URL"
else
    echo "⚠️  Warning: PublishedServerUriBySubnet may not have been set correctly"
    echo "$NEW_CONFIG" | grep -o '"PublishedServerUriBySubnet":\[[^]]*\]' || echo "No PublishedServerUriBySubnet found"
fi

echo ""
echo "📋 Current Network Configuration:"
echo "$NEW_CONFIG" | grep -E '"(PublishedServerUriBySubnet|EnableRemoteAccess|PublicPort)"' | sed 's/^/  /'

echo ""
echo "🔄 Restarting Jellyfin to apply network configuration changes..."
curl -s -X POST "$JELLYFIN_URL/System/Restart" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" || true

# Wait for restart
sleep 5
echo "   Waiting for Jellyfin to come back up..."
for i in {1..30}; do
    if curl -sf "$JELLYFIN_URL/System/Info/Public" > /dev/null 2>&1; then
        echo "   ✅ Jellyfin is back online"
        break
    fi
    printf "."
    sleep 2
done

echo ""
echo "🔗 Testing image URL resolution..."
# Re-login after restart
LOGIN_RESULT=$(curl -s "$JELLYFIN_URL/Users/AuthenticateByName" \
    -H "Authorization: MediaBrowser Client=TestScript, Device=Init, DeviceId=init, Version=1.0" \
    -H "Content-Type: application/json" \
    -d "{\"Username\":\"$USERNAME\",\"Pw\":\"$PASSWORD\"}" 2>&1)
ACCESS_TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"AccessToken":"[^"]*"' | head -1 | cut -d'"' -f4)

ITEMS=$(curl -s "$JELLYFIN_URL/Items?Limit=1&Recursive=true&IncludeItemTypes=Movie" \
    -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" 2>/dev/null)
if echo "$ITEMS" | grep -q '"Id"'; then
    ITEM_ID=$(echo "$ITEMS" | grep -o '"Id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  Sample item ID: $ITEM_ID"
    echo "  Image URL will be: $EXTERNAL_URL/Items/$ITEM_ID/Images/Primary"
else
    echo "  No items found to test (library may be empty)"
fi

echo ""
echo "✅ Jellyfin restarted with '$EXTERNAL_URL' as published server URI"
echo "   Both iOS Simulator and Android Emulator can access images at this URL"
