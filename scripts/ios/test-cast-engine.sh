#!/usr/bin/env bash
# The Cast engine imports no SDK: it compiles with swiftc alone, on fake ports and the hub's fake
# channel, and replays the shared position vectors, like the other standalone checks.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-cast-engine.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/PlayerEngineProtocols.swift \
  modules/mpv-player/ios/Cast/CastMapping.swift \
  modules/mpv-player/ios/Cast/ReceiverProtocol.swift \
  modules/mpv-player/ios/Cast/CastEngineConstants.swift \
  modules/mpv-player/ios/Cast/ReceiverChannelHub.swift \
  modules/mpv-player/ios/Cast/CastPorts.swift \
  modules/mpv-player/ios/Cast/CastEngine.swift \
  tests/native/FakeChannelPort.swift \
  tests/native/CastEngineTests.swift \
  -o "$test_dir/test"
"$test_dir/test" e2e/fixtures/receiver-protocol
