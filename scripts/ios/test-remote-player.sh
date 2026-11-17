#!/usr/bin/env bash
# The remote player's pure parts import no SDK and no UIKit: each test compiles with swiftc alone, against the
# engine protocols and the constants, like the other standalone checks.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-remote-player.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
shared=(
  modules/mpv-player/ios/PlayerEngineProtocols.swift
  modules/mpv-player/ios/Cast/CastEngineConstants.swift
  modules/mpv-player/ios/NativePlayer/PlayerConstants.swift
)

swiftc -module-cache-path "$test_dir/modules" "${shared[@]}" \
  modules/mpv-player/ios/NativePlayer/Remote/FakeRemoteEngine.swift \
  tests/native/FakeRemoteEngineTests.swift \
  -o "$test_dir/fake-remote-engine"
"$test_dir/fake-remote-engine"

swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/NativePlayer/NativeEngineKind.swift \
  modules/mpv-player/ios/NativePlayer/PresentRefusal.swift \
  modules/mpv-player/ios/NativePlayer/Remote/RemoteEvents.swift \
  tests/native/RemoteEventsTests.swift \
  -o "$test_dir/remote-events"
"$test_dir/remote-events"

swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/NativePlayer/PlayerConstants.swift \
  modules/mpv-player/ios/NativePlayer/Remote/RemoteLayout.swift \
  tests/native/RemoteLayoutTests.swift \
  -o "$test_dir/remote-layout"
"$test_dir/remote-layout"
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/NativePlayer/PlayerConstants.swift \
  modules/mpv-player/ios/NativePlayer/Remote/RemoteLayout.swift \
  tests/native/RemoteArrangementTests.swift \
  -o "$test_dir/remote-arrangement"
"$test_dir/remote-arrangement"

swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/NativePlayer/PlayerConstants.swift \
  modules/mpv-player/ios/NativePlayer/Remote/RemoteGestures.swift \
  tests/native/RemoteGesturesTests.swift \
  -o "$test_dir/remote-gestures"
"$test_dir/remote-gestures"
