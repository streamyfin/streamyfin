#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-video-deinterlace.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/VideoDeinterlace.swift tests/native/VideoDeinterlaceTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
