#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-app-container-path.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/background-downloader/ios/AppContainerPath.swift tests/native/AppContainerPathTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
