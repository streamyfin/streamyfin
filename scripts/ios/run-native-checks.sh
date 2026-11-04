#!/usr/bin/env bash
# Runs every standalone Swift check (scripts/ios/test-*.sh), stopping at the first failure: the
# entry point CI uses on macOS, and the one to run locally after touching modules/*/ios.
set -euo pipefail
cd "$(dirname "$0")/../.."
for check in scripts/ios/test-*.sh; do
  echo "== $check"
  bash "$check"
done
