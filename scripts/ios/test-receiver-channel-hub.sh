#!/usr/bin/env bash
# The receiver channel hub imports nothing but Foundation, so it compiles and runs with swiftc alone,
# against a fake channel port, like the other standalone checks.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-receiver-channel-hub.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/Cast/ReceiverProtocol.swift modules/mpv-player/ios/Cast/ReceiverChannelHub.swift \
  tests/native/FakeChannelPort.swift tests/native/ReceiverChannelHubTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
