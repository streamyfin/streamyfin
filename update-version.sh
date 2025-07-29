#!/bin/bash

# Script to update version codes across multiple files
# Usage: ./update-version.sh <new_version>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
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

print_header() {
    echo -e "${BLUE}${BOLD}$1${NC}"
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    print_error "jq is required but not installed. Please install jq first."
    print_error "On macOS: brew install jq"
    print_error "On Ubuntu/Debian: apt-get install jq"
    exit 1
fi

# Detect available diff tools
DIFF_TOOL="diff"
if command -v delta &> /dev/null; then
    DIFF_TOOL="delta"
    print_status "Using delta for enhanced diff display"
elif command -v git &> /dev/null; then
    DIFF_TOOL="git"
    print_status "Using git diff for colored output"
fi

# Function to show colored diff
show_diff() {
    local original="$1"
    local modified="$2"
    local filename="$3"
    
    if [ ! -f "$original" ] || [ ! -f "$modified" ]; then
        print_warning "Skipping $filename - files not found"
        return 1
    fi
    
    echo ""
    print_header "📝 Changes in $filename"
    
    # Temporarily disable exit on error for diff operations
    set +e
    
    case "$DIFF_TOOL" in
        "delta")
            if command -v delta &> /dev/null; then
                delta "$original" "$modified" 2>/dev/null
                local delta_exit=$?
                if [ $delta_exit -eq 0 ] || [ $delta_exit -eq 1 ]; then
                    set -e
                    return 0
                fi
            fi
            # Fallback to git diff
            if command -v git &> /dev/null; then
                git diff --no-index --color=always "$original" "$modified" 2>/dev/null
                local git_exit=$?
                if [ $git_exit -eq 0 ] || [ $git_exit -eq 1 ]; then
                    set -e
                    return 0
                fi
            fi
            # Final fallback to regular diff
            diff -u "$original" "$modified" 2>/dev/null || true
            ;;
        "git")
            if command -v git &> /dev/null; then
                git diff --no-index --color=always "$original" "$modified" 2>/dev/null
                local git_exit=$?
                if [ $git_exit -eq 0 ] || [ $git_exit -eq 1 ]; then
                    set -e
                    return 0
                fi
            fi
            # Fallback to regular diff
            diff -u "$original" "$modified" 2>/dev/null || true
            ;;
        *)
            diff -u "$original" "$modified" 2>/dev/null || true
            ;;
    esac
    
    # Re-enable exit on error
    set -e
    return 0
}

# Check if correct number of arguments provided
if [ $# -ne 1 ]; then
    print_error "Usage: $0 <new_version>"
    print_error "Example: $0 0.30.0"
    exit 1
fi

NEW_VERSION="$1"

# Auto-detect current version from app.json
if [ ! -f "app.json" ]; then
    print_error "app.json not found. This script must be run from the project root."
    exit 1
fi

OLD_VERSION=$(jq -r '.expo.version // "unknown"' app.json)

if [ "$OLD_VERSION" = "unknown" ] || [ "$OLD_VERSION" = "null" ]; then
    print_error "Could not detect current version from app.json"
    exit 1
fi

print_status "Auto-detected current version: ${BOLD}$OLD_VERSION${NC}"
print_status "Updating version to: ${BOLD}$NEW_VERSION${NC}"

# Check if versions are the same
if [ "$OLD_VERSION" = "$NEW_VERSION" ]; then
    print_warning "New version is the same as current version ($OLD_VERSION)"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Aborted"
        exit 1
    fi
fi

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

# Files to update
FILES=("app.json" "eas.json" "providers/JellyfinProvider.tsx")

# Create temporary directory for preview files
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Function to create preview of app.json changes
preview_app_json() {
    local file="app.json"
    local temp_file="$TEMP_DIR/$(basename $file)"
    
    if [ ! -f "$file" ]; then
        return 1
    fi
    
    # Get current version code and increment it
    local current_version_code=$(jq -r '.expo.android.versionCode // 0' "$file")
    local new_version_code=$((current_version_code + 1))
    
    # Create preview file with updated version and versionCode
    jq --arg new_version "$NEW_VERSION" \
       --argjson new_version_code "$new_version_code" \
       '.expo.version = $new_version | .expo.android.versionCode = $new_version_code' \
       "$file" > "$temp_file"
}

# Function to create preview of eas.json changes
preview_eas_json() {
    local file="eas.json"
    local temp_file="$TEMP_DIR/$(basename $file)"
    
    if [ ! -f "$file" ]; then
        return 1
    fi
    
    # Create preview file with updated channel fields
    jq --arg new_version "$NEW_VERSION" \
       '(.build // {}) |= with_entries(
         if .value.channel then 
           .value.channel = $new_version 
         else . end
       )' \
       "$file" > "$temp_file"
}

# Function to create preview of JellyfinProvider.tsx changes
preview_jellyfin_provider() {
    local file="providers/JellyfinProvider.tsx"
    local temp_file="$TEMP_DIR/$(basename $file)"
    
    if [ ! -f "$file" ]; then
        return 1
    fi
    
    # Create preview file with updated versions
    cp "$file" "$temp_file"
    sed -i.tmp "s/clientInfo: { name: \"Streamyfin\", version: \"$OLD_VERSION\" }/clientInfo: { name: \"Streamyfin\", version: \"$NEW_VERSION\" }/g" "$temp_file"
    sed -i.tmp "s/Version=\"$OLD_VERSION\"/Version=\"$NEW_VERSION\"/g" "$temp_file"
    rm -f "$temp_file.tmp"
}

# Create preview files
echo ""
print_status "🔍 Generating preview of changes..."
preview_app_json
preview_eas_json
preview_jellyfin_provider

# Show diff preview with modern styling
echo ""
print_header "═══════════════════════════════════════════════════════════════"
print_header "                         📋 PREVIEW OF CHANGES"
print_header "═══════════════════════════════════════════════════════════════"

for file in "${FILES[@]}"; do
    print_status "Processing $file..."
    if [ -f "$file" ] && [ -f "$TEMP_DIR/$(basename $file)" ]; then
        show_diff "$file" "$TEMP_DIR/$(basename $file)" "$file"
    else
        print_warning "Skipping $file - original or preview file missing"
    fi
done

# Ask for confirmation with modern styling
echo ""
print_header "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "${BOLD}Apply these changes?${NC}"
echo -e "  ${GREEN}✓ Yes${NC} - Apply the version update"
echo -e "  ${RED}✗ No${NC}  - Cancel and exit"
echo ""
read -p "Your choice (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_error "❌ Aborted by user"
    exit 1
fi

# Function to update app.json
update_app_json() {
    local file="app.json"
    local temp_file="$TEMP_DIR/$(basename $file)"
    
    if [ -f "$temp_file" ]; then
        mv "$temp_file" "$file"
        print_status "✅ Updated $file"
    fi
}

# Function to update eas.json
update_eas_json() {
    local file="eas.json"
    local temp_file="$TEMP_DIR/$(basename $file)"
    
    if [ -f "$temp_file" ]; then
        mv "$temp_file" "$file"
        print_status "✅ Updated $file"
    fi
}

# Function to update JellyfinProvider.tsx
update_jellyfin_provider() {
    local file="providers/JellyfinProvider.tsx"
    local temp_file="$TEMP_DIR/$(basename $file)"
    
    if [ -f "$temp_file" ]; then
        mv "$temp_file" "$file"
        print_status "✅ Updated $file"
    fi
}

# Apply the changes
echo ""
print_status "🚀 Applying changes..."
update_app_json
update_eas_json
update_jellyfin_provider

echo ""
print_header "═══════════════════════════════════════════════════════════════"
print_header "                    🎉 VERSION UPDATE COMPLETED!"
print_header "═══════════════════════════════════════════════════════════════"
echo ""
print_status "📦 Summary of changes:"
echo -e "  ${GREEN}•${NC} app.json: version and versionCode updated"
echo -e "  ${GREEN}•${NC} eas.json: channel fields updated"
echo -e "  ${GREEN}•${NC} JellyfinProvider.tsx: client version and auth header updated"
echo ""
print_warning "🔧 Don't forget to test the changes and commit them!"
echo "" 