#!/usr/bin/env bash
# The receiver protocol imports nothing but Foundation, and its phase is the engine protocols' RemotePhase
# (AVFoundation types only), so it compiles and runs with swiftc alone, like the Cast mapping check,
# against the shared vectors the other readers replay.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-receiver-protocol.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/PlayerEngineProtocols.swift modules/mpv-player/ios/Cast/ReceiverProtocol.swift tests/native/ReceiverProtocolTests.swift \
  -o "$test_dir/test"
"$test_dir/test" e2e/fixtures/receiver-protocol
