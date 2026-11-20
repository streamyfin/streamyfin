#!/usr/bin/env bash
# The engine protocols import nothing but AVFoundation types, so they compile and run with
# swiftc alone, like the Cast mapping check: no Xcode test target, no simulator.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-engine-protocols.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/PlayerEngineProtocols.swift tests/native/EngineProtocolsTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
