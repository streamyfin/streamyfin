#!/usr/bin/env bash
# The output sheet's model and controller import nothing but Foundation, like the remote target they
# read, so they compile and run with swiftc alone, on the real hub and a fake port.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-output-sheet.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
sources=(
  modules/mpv-player/ios/Cast/RemoteTarget.swift modules/mpv-player/ios/Cast/RemoteTargetHub.swift
  modules/mpv-player/ios/Cast/GoogleCastTargetPort.swift modules/mpv-player/ios/Cast/CastTargetProbe.swift
  modules/mpv-player/ios/Cast/FakeCastDevices.swift modules/mpv-player/ios/Cast/RemoteTargetConstants.swift
  modules/mpv-player/ios/Cast/OutputSheetModel.swift modules/mpv-player/ios/Cast/OutputSheetController.swift
  tests/native/FakeTargetPort.swift tests/native/OutputSheetTests.swift
)
swiftc -module-cache-path "$test_dir/modules" "${sources[@]}" -o "$test_dir/test"
"$test_dir/test"
