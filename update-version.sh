#!/bin/bash

# Script to update version codes across multiple files
# Usage: ./update-version.sh <old_version> <new_version>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if correct number of arguments provided
if [ $# -ne 2 ]; then
    print_error "Usage: $0 <old_version> <new_version>"
    print_error "Example: $0 0.29.1 0.30.0"
    exit 1
fi

OLD_VERSION="$1"
NEW_VERSION="$2"

print_status "Updating version from $OLD_VERSION to $NEW_VERSION"

# Validate version format (basic check for semantic versioning)
if [[ ! $NEW_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_warning "Version format doesn't match semantic versioning (x.y.z)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Aborted"
        exit 1
    fi
fi

# Create backup directory
BACKUP_DIR="version-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
print_status "Created backup directory: $BACKUP_DIR"

# Files to update
FILES=("app.json" "eas.json" "providers/JellyfinProvider.tsx")

# Create backups
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/"
        print_status "Backed up $file"
    else
        print_warning "File not found: $file"
    fi
done

# Function to update app.json
update_app_json() {
    local file="app.json"
    if [ ! -f "$file" ]; then
        print_error "$file not found"
        return 1
    fi
    
    print_status "Updating $file..."
    
    # Update version field
    sed -i.tmp "s/\"version\": \"$OLD_VERSION\"/\"version\": \"$NEW_VERSION\"/g" "$file"
    
    # Calculate new version code (increment by 1)
    local current_version_code=$(grep -o '"versionCode": [0-9]*' "$file" | grep -o '[0-9]*')
    if [ -n "$current_version_code" ]; then
        local new_version_code=$((current_version_code + 1))
        sed -i.tmp "s/\"versionCode\": $current_version_code/\"versionCode\": $new_version_code/g" "$file"
        print_status "Updated versionCode from $current_version_code to $new_version_code"
    fi
    
    rm -f "$file.tmp"
    print_status "✓ Updated $file"
}

# Function to update eas.json
update_eas_json() {
    local file="eas.json"
    if [ ! -f "$file" ]; then
        print_error "$file not found"
        return 1
    fi
    
    print_status "Updating $file..."
    
    # Update channel fields in production builds
    sed -i.tmp "s/\"channel\": \"$OLD_VERSION\"/\"channel\": \"$NEW_VERSION\"/g" "$file"
    
    rm -f "$file.tmp"
    print_status "✓ Updated $file"
}

# Function to update JellyfinProvider.tsx
update_jellyfin_provider() {
    local file="providers/JellyfinProvider.tsx"
    if [ ! -f "$file" ]; then
        print_error "$file not found"
        return 1
    fi
    
    print_status "Updating $file..."
    
    # Update version in clientInfo
    sed -i.tmp "s/clientInfo: { name: \"Streamyfin\", version: \"$OLD_VERSION\" }/clientInfo: { name: \"Streamyfin\", version: \"$NEW_VERSION\" }/g" "$file"
    
    # Update version in authorization header
    sed -i.tmp "s/Version=\"$OLD_VERSION\"/Version=\"$NEW_VERSION\"/g" "$file"
    
    rm -f "$file.tmp"
    print_status "✓ Updated $file"
}

# Update all files
update_app_json
update_eas_json
update_jellyfin_provider

print_status "Version update completed!"
print_status "Summary of changes:"
echo "  • app.json: version and versionCode updated"
echo "  • eas.json: channel fields updated"
echo "  • JellyfinProvider.tsx: client version and auth header updated"
echo ""
print_status "Backups saved in: $BACKUP_DIR"
print_warning "Don't forget to test the changes and commit them!"

# Optional: Show diff preview
read -p "Show diff preview? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    print_status "Diff preview:"
    for file in "${FILES[@]}"; do
        if [ -f "$file" ] && [ -f "$BACKUP_DIR/$(basename $file)" ]; then
            echo "--- Changes in $file ---"
            diff "$BACKUP_DIR/$(basename $file)" "$file" || true
            echo ""
        fi
    done
fi 