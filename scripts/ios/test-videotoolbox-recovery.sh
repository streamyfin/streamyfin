#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-videotoolbox-recovery.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/VideoDeinterlace.swift \
  modules/mpv-player/ios/VideoToolboxRecovery.swift \
  tests/native/VideoToolboxRecoveryTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
