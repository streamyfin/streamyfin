#!/usr/bin/env bash
# The remote player requests import nothing but Foundation, so they compile and run with swiftc alone, like the
# other standalone checks: no Xcode test target, no simulator.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-remote-player-requests.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/Cast/RemotePlayerRequests.swift tests/native/RemotePlayerRequestsTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
