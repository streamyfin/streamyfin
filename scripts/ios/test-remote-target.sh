#!/usr/bin/env bash
# The remote target state imports nothing but Foundation, so it compiles and runs with swiftc alone,
# like the other standalone checks.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-remote-target.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/Cast/RemoteTarget.swift tests/native/RemoteTargetTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
