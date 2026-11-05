#!/usr/bin/env bash
# The player's audio session wrapper builds on macOS for its queues alone (AVAudioSession is iOS and
# tvOS only), so swiftc runs its queue rules without a simulator.
set -euo pipefail
cd "$(dirname "$0")/../.."
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/streamyfin-player-audio-session.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
swiftc -module-cache-path "$test_dir/modules" \
  modules/mpv-player/ios/PlayerAudioSession.swift tests/native/PlayerAudioSessionTests.swift -o "$test_dir/test"
"$test_dir/test"
