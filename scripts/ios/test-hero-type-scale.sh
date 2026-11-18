#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-hero-type-scale.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/hero-carousel/ios/HeroTypeScale.swift tests/native/HeroTypeScaleTests.swift \
  -o "$test_dir/test"
"$test_dir/test"
