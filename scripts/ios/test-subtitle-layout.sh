#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-subtitle-layout.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/SubtitleLayout.swift tests/native/SubtitleLayoutTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
