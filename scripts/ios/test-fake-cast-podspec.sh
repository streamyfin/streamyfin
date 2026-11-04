#!/usr/bin/env bash
# The fake Cast receivers never ship (e2e/README.md, "Fake Cast receivers"). The podspec refuses
# them for a store profile, and a tier 1 install adds a build phase that refuses any archive: the
# define stays in the Pods configuration until `pod install` runs again. CocoaPods prints the
# podspec as JSON with `pod ipc spec`, so each case is read from what CocoaPods evaluates.
set -euo pipefail
cd "$(dirname "$0")/../.."
podspec=modules/mpv-player/ios/MpvPlayer.podspec
phase_name='Refuse fake Cast receivers in an archive'
failures=0

# Each case sets the variables it reads and inherits neither from the shell.
spec() {
  env -u STREAMYFIN_FAKE_CAST_DEVICES -u EAS_BUILD_PROFILE "$@" pod ipc spec "$podspec"
}

fail() {
  echo "FAIL: $1"
  failures=$((failures + 1))
}

# Prints one value of the spec read on stdin: the Swift conditions, or the archive phase's name
# or script (empty when the spec has no such phase).
read_spec() {
  ruby -rjson -e '
    spec = JSON.parse(STDIN.read)
    phases = spec["script_phases"] || []
    phases = [phases] if phases.is_a?(Hash)
    phase = phases.find { |p| p["name"] == ARGV[1] } || {}
    case ARGV[0]
    when "conditions" then puts spec.dig("pod_target_xcconfig", "SWIFT_ACTIVE_COMPILATION_CONDITIONS")
    when "phase" then puts phase["name"].to_s
    when "script" then puts phase["script"].to_s
    end
  ' "$1" "$phase_name"
}

plain=$(spec)
[ "$(read_spec conditions <<<"$plain")" = '$(inherited)' ] || fail "a plain install compiles FAKE_CAST_DEVICES"
[ -z "$(read_spec phase <<<"$plain")" ] || fail "a plain install carries the archive refusal"

fake=$(spec STREAMYFIN_FAKE_CAST_DEVICES=1)
[ "$(read_spec conditions <<<"$fake")" = '$(inherited) FAKE_CAST_DEVICES' ] || fail "a tier 1 install does not compile FAKE_CAST_DEVICES"
script=$(read_spec script <<<"$fake")
if [ -z "$script" ]; then
  fail "a tier 1 install has no archive refusal"
else
  # Xcode runs a CocoaPods script phase with /bin/sh, and archives with ACTION=install.
  if output=$(ACTION=install /bin/sh -c "$script" 2>&1); then
    fail "the archive refusal lets an archive through"
  elif [[ "$output" != *"error: fake Cast receivers never ship"* ]]; then
    fail "the archive refusal does not say why: $output"
  fi
  ACTION=build /bin/sh -c "$script" >/dev/null 2>&1 || fail "the archive refusal stops a plain build"
fi

# Every store profile eas.json defines (their names start with production) has to fail, and on the
# podspec's own refusal: the archive phase's script carries the same closing words, so a spec that
# succeeds can contain them too.
store_profiles=$(ruby -rjson -e 'puts JSON.parse(File.read("eas.json"))["build"].keys.select { |k| k.start_with?("production") }')
[ -n "$store_profiles" ] || fail "eas.json names no store profile"
for profile in $store_profiles; do
  if store=$(spec EAS_BUILD_PROFILE="$profile" STREAMYFIN_FAKE_CAST_DEVICES=1 2>&1); then
    fail "the $profile profile takes the fake receivers"
  elif [[ "$store" != *"is set for the store profile '$profile'"* ]]; then
    fail "the $profile profile failed for another reason: $store"
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "$failures fake Cast podspec check(s) failed"
  exit 1
fi
echo "fake Cast podspec: all checks passed"
