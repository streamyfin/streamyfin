#!/usr/bin/env bash
# The remote target state, its hub and the SDK port's logic import nothing but Foundation (the port's
# GoogleCast wiring is iOS only), so they compile and run with swiftc alone, against fakes, like the
# other standalone checks.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-remote-target.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/Cast/RemoteTarget.swift modules/mpv-player/ios/Cast/RemoteTargetHub.swift \
  modules/mpv-player/ios/Cast/GoogleCastTargetPort.swift modules/mpv-player/ios/Cast/CastTargetProbe.swift \
  tests/native/FakeTargetPort.swift tests/native/RemoteTargetTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
