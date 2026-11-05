#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-seek-glyph.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/NativePlayer/Views/TimeFormatting.swift tests/native/SeekGlyphTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
