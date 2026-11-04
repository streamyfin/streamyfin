#!/usr/bin/env bash
# The remote target state and its hub import nothing but Foundation, so they compile and run with
# swiftc alone, against a fake port, like the other standalone checks.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-remote-target.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/Cast/RemoteTarget.swift modules/mpv-player/ios/Cast/RemoteTargetHub.swift \
  tests/native/FakeTargetPort.swift tests/native/RemoteTargetTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
