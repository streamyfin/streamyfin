#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Metal Toolchain install is only relevant on macOS."
  exit 0
fi

if xcrun --find metal >/dev/null 2>&1; then
  echo "Metal tool found: $(xcrun --find metal)"
  exit 0
fi

echo "Metal toolchain missing."
echo "Installing via: xcodebuild -downloadComponent MetalToolchain"
echo "If this fails, ensure Xcode is selected (xcode-select) and you accepted the license."
echo

xcodebuild -downloadComponent MetalToolchain

echo
echo "Done. Verify with: xcrun --find metal && xcrun metal -v"

