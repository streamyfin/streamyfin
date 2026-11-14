#!/usr/bin/env bash
# The remote target state, its hub, the SDK port's logic and the fake receivers import nothing but
# Foundation (the port's GoogleCast wiring is iOS only), so they compile and run with swiftc alone,
# against fakes, like the other standalone checks. A second build plays a tier 1 build, compiled with
# FAKE_CAST_DEVICES as `STREAMYFIN_FAKE_CAST_DEVICES=1 pod install` sets it.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-remote-target.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
sources=(
  modules/mpv-player/ios/Cast/RemoteTarget.swift modules/mpv-player/ios/Cast/RemoteTargetHub.swift
  modules/mpv-player/ios/Cast/GoogleCastTargetPort.swift modules/mpv-player/ios/Cast/CastTargetProbe.swift
  modules/mpv-player/ios/Cast/FakeCastDevices.swift modules/mpv-player/ios/Cast/RemoteTargetConstants.swift
  tests/native/FakeTargetPort.swift tests/native/RemoteTargetTests.swift
)
swiftc -module-cache-path "$test_dir/modules" "${sources[@]}" -o "$test_dir/test"
"$test_dir/test"
swiftc -module-cache-path "$test_dir/modules" -D FAKE_CAST_DEVICES "${sources[@]}" -o "$test_dir/test-fake"
"$test_dir/test-fake" --expect-fake
