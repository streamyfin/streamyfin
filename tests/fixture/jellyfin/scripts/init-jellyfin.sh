#!/bin/bash
# Initialize Jellyfin with demo user and media library
# Uses direct database seeding for reliable user creation

set -e

JELLYFIN_URL="${JELLYFIN_URL:-http://localhost:8096}"
DEMO_USER="${DEMO_USER:-admin}"
DEMO_PASSWORD="${DEMO_PASSWORD:-admin}"

echo "Initializing Jellyfin at $JELLYFIN_URL..."

# Wait for Jellyfin to be fully ready
for i in {1..30}; do
    if curl -sf "$JELLYFIN_URL/System/Info/Public" > /dev/null 2>&1; then
        echo " Jellyfin is responding"
        break
    fi
    echo "Waiting for Jellyfin to respond... ($i/30)"
    sleep 2
done

# Check if already initialized
IS_INIT=$(curl -sf "$JELLYFIN_URL/System/Info/Public" | grep -o '"StartupWizardCompleted":[^,}]*' | cut -d':' -f2 || echo "false")

if [ "$IS_INIT" = "true" ]; then
    echo "Jellyfin already initialized"
    exit 0
fi

echo "Running first-time setup..."

# Step 1: Set configuration (language, country)
echo "Setting configuration..."
curl -s -X POST "$JELLYFIN_URL/Startup/Configuration" \
    -H "Content-Type: application/json" \
    -d '{"UICulture":"en-US","MetadataCountryCode":"US","PreferredMetadataLanguage":"en"}' || true

# Step 2: Set remote access
echo "Setting remote access..."
curl -s -X POST "$JELLYFIN_URL/Startup/RemoteAccess" \
    -H "Content-Type: application/json" \
    -d '{"EnableRemoteAccess":true,"EnableAutomaticPortMapping":false}' || true

# Step 3: Stop Jellyfin to seed the database
echo "Stopping Jellyfin to seed database..."
docker compose stop
sleep 2

# Step 4: Create demo user in database
DB_PATH="./config/data/jellyfin.db"
USER_ID=$(uuidgen | tr 'A-Z' 'a-z')

if [ -f "$DB_PATH" ]; then
    echo "Creating user in database..."
    sqlite3 "$DB_PATH" <<EOF 2>/dev/null || echo "User may already exist"
INSERT INTO Users (
    Id, Username, Password, AuthenticationProviderId, PasswordResetProviderId,
    DisplayCollectionsView, DisplayMissingEpisodes, EnableAutoLogin, EnableLocalPassword,
    EnableNextEpisodeAutoPlay, EnableUserPreferenceAccess, HidePlayedInLatest,
    InternalId, InvalidLoginAttemptCount, MaxActiveSessions, MustUpdatePassword,
    PlayDefaultAudioTrack, RememberAudioSelections, RememberSubtitleSelections,
    RowVersion, SubtitleMode, SyncPlayAccess
) VALUES (
    '$USER_ID', '$DEMO_USER', '',
    'DefaultAuthenticationProvider', 'DefaultPasswordResetProvider',
    1, 0, 1, 0,
    1, 1, 0,
    1, 0, 0, 0,
    1, 1, 1,
    0, 0, 0
);
EOF
    echo " User created (no password)"
else
    echo " Warning: Database not found at $DB_PATH"
fi

# Step 5: Restart Jellyfin
echo "Restarting Jellyfin..."
docker compose start
sleep 3

# Step 6: Wait for Jellyfin to be ready
echo "Waiting for Jellyfin to be ready..."
for i in {1..30}; do
    if curl -sf "$JELLYFIN_URL/System/Info/Public" > /dev/null 2>&1; then
        echo " Jellyfin is ready"
        break
    fi
    sleep 1
done

# Step 7: Complete the startup wizard
echo "Completing startup wizard..."
curl -s -X POST "$JELLYFIN_URL/Startup/Complete" || true

# Wait for completion
for i in {1..10}; do
    IS_INIT=$(curl -sf "$JELLYFIN_URL/System/Info/Public" | grep -o '"StartupWizardCompleted":[^,}]*' | cut -d':' -f2 || echo "false")
    if [ "$IS_INIT" = "true" ]; then
        echo " Startup wizard completed"
        break
    fi
    sleep 1
done

# Step 8: Login without password (empty password) and set password
echo "Setting up password..."
sleep 2

# Try to login without password
LOGIN_RESULT=$(curl -s "$JELLYFIN_URL/Users/AuthenticateByName" \
    -H "Authorization: MediaBrowser Client=TestScript, Device=Init, DeviceId=init, Version=1.0" \
    -H "Content-Type: application/json" \
    -d "{\"Username\":\"$DEMO_USER\",\"Pw\":\"\"}" 2>&1)

if echo "$LOGIN_RESULT" | grep -q "AccessToken"; then
    echo " Login successful (no password)!"
    ACCESS_TOKEN=$(echo "$LOGIN_RESULT" | grep -o '"AccessToken":"[^"]*"' | head -1 | cut -d'"' -f4)
    USER_ID=$(echo "$LOGIN_RESULT" | grep -o '"UserId":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    # Set password using the API
    echo " Setting password..."
    curl -s -X POST "$JELLYFIN_URL/Users/$USER_ID/Password" \
        -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"CurrentPassword\":\"\",\"NewPassword\":\"$DEMO_PASSWORD\"}" || echo "Password may already be set"
    
    # Step 9: Create media library if we have media
    if [ -d "./media/movies" ] && [ "$(ls -A ./media/movies 2>/dev/null)" ]; then
        echo "Creating media library..."
        curl -s "$JELLYFIN_URL/Library/VirtualFolders" \
            -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" \
            -H "Content-Type: application/json" \
            -d '{
                "Name": "Movies",
                "CollectionType": "movies",
                "Paths": ["/media/movies"],
                "LibraryOptions": {
                    "EnableRealtimeMonitor": false,
                    "EnableChapterImageExtraction": false,
                    "ExtractChapterImagesDuringLibraryScan": false
                }
            }' || echo "Library may already exist"
        
        # Trigger scan
        curl -s "$JELLYFIN_URL/Library/Refresh" \
            -H "Authorization: MediaBrowser Token=$ACCESS_TOKEN" \
            -X POST || true
    fi
    
    # Verify password works
    echo "Verifying login with new password..."
    VERIFY_LOGIN=$(curl -s "$JELLYFIN_URL/Users/AuthenticateByName" \
        -H "Authorization: MediaBrowser Client=TestScript, Device=Init, DeviceId=init, Version=1.0" \
        -H "Content-Type: application/json" \
        -d "{\"Username\":\"$DEMO_USER\",\"Pw\":\"$DEMO_PASSWORD\"}" 2>&1)
    
    if echo "$VERIFY_LOGIN" | grep -q "AccessToken"; then
        echo " Password verified successfully!"
    else
        echo " Warning: Could not verify password"
    fi
else
    echo " Warning: Could not login without password"
    echo " Response: $(echo "$LOGIN_RESULT" | head -c 200)"
fi

echo ""
echo "Jellyfin initialization complete!"
echo "URL: $JELLYFIN_URL"
echo "Login: $DEMO_USER / $DEMO_PASSWORD"
