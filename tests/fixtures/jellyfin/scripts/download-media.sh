#!/bin/bash
# Download and transcode the small public media set used by the Jellyfin fixture.

set -euo pipefail

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Missing required command: $1" >&2
        exit 1
    fi
}

download_file() {
    local name="$1"
    local url="$2"
    local output="$3"
    local tmp="${output}.tmp"

    mkdir -p "$(dirname "$output")"

    if [ -s "$output" ]; then
        echo "Already present: $name"
        return
    fi

    echo "Downloading: $name"
    rm -f "$tmp"
    if ! curl -fL "$url" -o "$tmp"; then
        rm -f "$tmp"
        return 1
    fi
    mv "$tmp" "$output"
    echo "Created: $output"
}

transcode_video() {
    local name="$1"
    local url="$2"
    local output="$3"
    local tmp="${output}.tmp.mp4"

    mkdir -p "$(dirname "$output")"

    if [ -s "$output" ]; then
        echo "Already present: $name"
        return
    fi

    echo "Downloading and transcoding: $name"
    rm -f "$tmp"
    if ! ffmpeg -hide_banner -loglevel error -y \
        -i "$url" \
        -vf "scale=320:-2" \
        -c:v libx264 -preset veryfast -crf 35 \
        -c:a aac -b:a 48k \
        -f mp4 \
        "$tmp"; then
        rm -f "$tmp"
        return 1
    fi
    mv "$tmp" "$output"
    echo "Created: $output"
}

media_summary() {
    echo ""
    echo "Fixture media files:"
    while IFS= read -r -d '' file; do
        local size
        local duration

        size=$(du -h "$file" | awk '{print $1}')
        duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$file" 2>/dev/null || true)
        if [ -n "$duration" ]; then
            duration=$(awk -v seconds="$duration" 'BEGIN { printf "%02d:%02d:%02d", seconds / 3600, (seconds % 3600) / 60, seconds % 60 }')
            printf '  %-7s %-8s %s\n' "$size" "$duration" "$file"
        else
            printf '  %-7s %-8s %s\n' "$size" "-" "$file"
        fi
    done < <(find media -type f \( -name '*.mp4' -o -name '*.mp3' -o -name '*.webm' \) -print0 | sort -z)
}

show_media_tree() {
    echo ""
    echo "Media tree:"
    if [ -d "../../../tests/fixtures/jellyfin/media" ]; then
        (cd ../../.. && find ./tests/fixtures/jellyfin/media)
    else
        find ./media
    fi
}

require_command curl
require_command ffmpeg

transcode_video \
    "Big Buck Bunny (2008)" \
    "https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4" \
    "media/movies/Big Buck Bunny (2008) [imdbid-tt1254207]/Big Buck Bunny (2008) [imdbid-tt1254207].mp4"

transcode_video \
    "Steamboat Willie (1928)" \
    "https://upload.wikimedia.org/wikipedia/commons/transcoded/5/5f/Steamboat_Willie_%281928%29_by_Walt_Disney.webm/Steamboat_Willie_%281928%29_by_Walt_Disney.webm.240p.vp9.webm" \
    "media/movies/Steamboat Willie (1928) [imdbid-tt0019422]/Steamboat Willie (1928) [imdbid-tt0019422].mp4"

transcode_video \
    "The Beverly Hillbillies S01E01 - The Clampetts Strike Oil" \
    "https://archive.org/download/Beverly_Hillbillies_Ep01_The_Clampetts_Strike_Oil/BH01_The_Clampetts_Strike_Oil_512kb.mp4" \
    "media/shows/The Beverly Hillbillies (1962) [tvdbid-71471]/Season 01/The Beverly Hillbillies (1962) - S01E01 - The Clampetts Strike Oil.mp4"

transcode_video \
    "The Lucy Show S05E16 - Lucy, the Baby Sitter" \
    "https://archive.org/download/TLS_Lucy_The_Babysitter/TLS_Lucy_The_Babysitter_512kb.mp4" \
    "media/shows/The Lucy Show (1962) [tvdbid-70695]/Season 05/The Lucy Show (1962) - S05E16 - Lucy, the Baby Sitter.mp4"

download_file \
    "Scott Joplin - Maple Leaf Rag" \
    "https://upload.wikimedia.org/wikipedia/commons/transcoded/0/09/Scott_Joplin_-_Maple_Leaf_Rag.ogg/Scott_Joplin_-_Maple_Leaf_Rag.ogg.mp3" \
    "media/music/Scott Joplin/Maple Leaf Rag (2014)/01 - Maple Leaf Rag.mp3"

echo "Fixture media is ready."
media_summary
show_media_tree
