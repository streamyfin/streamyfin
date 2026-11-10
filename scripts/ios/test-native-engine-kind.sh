#!/usr/bin/env bash
# NativeEngineKind is Foundation only, so it compiles and runs with swiftc alone, like the other
# standalone checks: no Xcode test target, no simulator.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-native-engine-kind.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/NativePlayer/NativeEngineKind.swift modules/mpv-player/ios/NativePlayer/PresentRefusal.swift \
  tests/native/NativeEngineKindTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
