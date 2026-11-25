#!/usr/bin/env bash
# The Cast mapping has no SDK import, so it compiles and runs with swiftc alone, like the
# subtitle layout checks: no Xcode test target, no simulator.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-cast-mapping.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/Cast/CastMapping.swift tests/native/CastMappingTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
