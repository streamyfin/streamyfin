#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH=; cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH=; cd -- "$SCRIPT_DIR/../.." && pwd)
UI_TEST_DIR="tests/maestro"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/$UI_TEST_DIR/.env.local}"
DEFAULT_APP_ID="com.fredrikburmester.streamyfin"

if [ -n "${HOME:-}" ] && [ -d "$HOME/.maestro/bin" ]; then
  PATH="$HOME/.maestro/bin:$PATH"
  export PATH
fi

usage() {
  cat >&2 <<EOF
Usage: sh tests/maestro/record-flow.sh simple|cf-simple maestro|adb|simulator android|ios

Android TV recording targets are not implemented by this script.

Examples:
  sh tests/maestro/record-flow.sh simple maestro android
  sh tests/maestro/record-flow.sh cf-simple maestro ios

Set test values in your shell environment or in:
  tests/maestro/.env.local
EOF
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

load_env_file() {
  [ -f "$ENV_FILE" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%"$(printf '\r')"}

    case "$line" in
      ''|\#*) continue ;;
      export\ *) line=${line#export } ;;
    esac

    case "$line" in
      *=*) ;;
      *) continue ;;
    esac

    key=${line%%=*}
    value=${line#*=}

    case "$key" in
      MAESTRO_APP_ID|MAESTRO_SERVER_URL|MAESTRO_IOS_SERVER_URL|MAESTRO_IOS_DIRECT_SERVER_URL|MAESTRO_IOS_CF_SERVER_URL|MAESTRO_ANDROID_SERVER_URL|MAESTRO_LOGIN_SERVER_URL|MAESTRO_USERNAME|MAESTRO_PASSWORD|MAESTRO_CF_ACCESS_CLIENT_ID|MAESTRO_CF_ACCESS_CLIENT_SECRET|MAESTRO_PLATFORM|MAESTRO_TARGET|MAESTRO_DEVICE) ;;
      *) continue ;;
    esac

    case "$value" in
      \"*\") value=${value#\"}; value=${value%\"} ;;
      \'*\') value=${value#\'}; value=${value%\'} ;;
    esac

    eval "is_set=\${$key+x}"
    if [ -z "$is_set" ]; then
      export "$key=$value"
    fi
  done < "$ENV_FILE"
}

require_vars() {
  flow_name=$1
  shift
  missing=''

  for var_name in "$@"; do
    eval "value=\${$var_name-}"
    if [ -z "$value" ]; then
      missing="${missing}
  $var_name"
    fi
  done

  if [ -n "$missing" ]; then
    printf 'error: missing required environment variables for %s recording:%s\n' "$flow_name" "$missing" >&2
    printf 'Set them in your shell or in %s.\n' "$ENV_FILE" >&2
    exit 1
  fi
}

check_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is not installed or is not on PATH."
}

target_for_platform() {
  case "$1" in
    android) printf '%s\n' 'android' ;;
    ios) printf '%s\n' 'ios' ;;
    *) die "platform must be android or ios" ;;
  esac
}

maestro_platform_for_target() {
  case "$1" in
    ios) printf '%s\n' 'ios' ;;
    android) printf '%s\n' 'android' ;;
    *) die "platform must be android or ios" ;;
  esac
}

flow_file_for() {
  flow_name=$1
  platform_name=$2

  case "$platform_name:$flow_name" in
    android:simple) printf '%s\n' "$UI_TEST_DIR/flows/simple-flow.yaml" ;;
    android:cf-simple|android:cf) printf '%s\n' "$UI_TEST_DIR/flows/cf-flow.yaml" ;;
    ios:simple) printf '%s\n' "$UI_TEST_DIR/flows/ios-simple-flow.yaml" ;;
    ios:cf-simple|ios:cf) printf '%s\n' "$UI_TEST_DIR/flows/ios-cf-flow.yaml" ;;
    *) die "unsupported flow/platform combination: $flow_name on $platform_name" ;;
  esac
}

resolve_server_url() {
  [ -z "${MAESTRO_SERVER_URL_WAS_SET:-}" ] || return 0
  [ -x "$REPO_ROOT/tests/fixtures/jellyfin/scripts/detect-access-urls.sh" ] || return 0

  resolved_url=$(
    MAESTRO_SERVER_URL='' \
    MAESTRO_TARGET="$MAESTRO_TARGET" \
    "$REPO_ROOT/tests/fixtures/jellyfin/scripts/detect-access-urls.sh" maestro
  )

  if [ -n "$resolved_url" ]; then
    MAESTRO_SERVER_URL=$resolved_url
    export MAESTRO_SERVER_URL
  fi
}

resolve_platform_server_urls() {
  if [ "${PLATFORM_NAME:-}" = "ios" ]; then
    case "${FLOW_NAME:-}" in
      cf|cf-simple)
        if [ -n "${MAESTRO_IOS_CF_SERVER_URL:-}" ]; then
          MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_CF_SERVER_URL
        fi
        ;;
      simple)
        if [ -n "${MAESTRO_IOS_DIRECT_SERVER_URL:-}" ]; then
          MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_DIRECT_SERVER_URL
        fi
        ;;
    esac
  fi

  : "${MAESTRO_IOS_SERVER_URL:=${MAESTRO_IOS_DIRECT_SERVER_URL:-${MAESTRO_SERVER_URL:-}}}"
  : "${MAESTRO_ANDROID_SERVER_URL:=${MAESTRO_SERVER_URL:-}}"
  case "$MAESTRO_PLATFORM:$MAESTRO_TARGET" in
    ios:ios)
      MAESTRO_LOGIN_SERVER_URL=$MAESTRO_IOS_SERVER_URL
      ;;
    android:android)
      MAESTRO_LOGIN_SERVER_URL=$MAESTRO_ANDROID_SERVER_URL
      ;;
  esac
  export MAESTRO_IOS_SERVER_URL
  export MAESTRO_ANDROID_SERVER_URL
  export MAESTRO_LOGIN_SERVER_URL
}

print_config() {
  printf '\nMaestro Recording Configuration:\n'
  printf '  Flow:       %s\n' "$FLOW_NAME"
  printf '  Recorder:   %s\n' "$RECORDER"
  printf '  Platform:   %s\n' "$MAESTRO_PLATFORM"
  printf '  Target:     %s\n' "$MAESTRO_TARGET"
  printf '  Server URL: %s\n' "${MAESTRO_SERVER_URL:-(not set)}"
  printf '  iOS URL:    %s\n' "${MAESTRO_IOS_SERVER_URL:-(not set)}"
  printf '  Android URL: %s\n' "${MAESTRO_ANDROID_SERVER_URL:-(not set)}"
  printf '  Login URL:  %s\n' "${MAESTRO_LOGIN_SERVER_URL:-(not set)}"
  printf '  Username:   %s\n' "${MAESTRO_USERNAME:-(not set)}"
  printf '  Output:     %s\n\n' "$VIDEO_PATH"
}

run_maestro_test() {
  if [ -n "${MAESTRO_DEVICE:-}" ]; then
    maestro test --platform "$MAESTRO_PLATFORM" --device "$MAESTRO_DEVICE" "$FLOW_FILE"
  else
    maestro test --platform "$MAESTRO_PLATFORM" "$FLOW_FILE"
  fi
}

record_with_maestro() {
  case "$PLATFORM_NAME" in
    ios)
      maestro record --local "$FLOW_FILE" "$VIDEO_PATH"
      ;;
    android)
      maestro record "$FLOW_FILE" "$VIDEO_PATH"
      ;;
  esac
}

record_with_adb() {
  [ "$MAESTRO_PLATFORM" = "android" ] || die "adb recording only supports Android targets."
  check_command adb

  if ! adb devices | grep -q "device$"; then
    die "no Android device is connected. Start one with: maestro start-device --platform android"
  fi

  remote_video="/sdcard/streamyfin-record-$$.mp4"
  rm -f "$VIDEO_PATH"

  printf 'Starting adb screenrecord...\n'
  adb shell screenrecord "$remote_video" &
  adb_pid=$!
  sleep 1

  set +e
  run_maestro_test
  test_status=$?
  set -e

  printf '\nStopping adb screenrecord...\n'
  kill "$adb_pid" 2>/dev/null || true
  wait "$adb_pid" 2>/dev/null || true
  sleep 1

  adb pull "$remote_video" "$VIDEO_PATH" >/dev/null 2>&1 || true
  adb shell rm "$remote_video" >/dev/null 2>&1 || true

  [ -s "$VIDEO_PATH" ] || die "recording file was not created: $VIDEO_PATH"
  bytes=$(wc -c < "$VIDEO_PATH" | tr -d ' ')
  printf 'Recording saved: %s (%s bytes)\n' "$VIDEO_PATH" "$bytes"
  exit "$test_status"
}

record_with_simulator() {
  [ "$MAESTRO_PLATFORM" = "ios" ] || die "simulator recording only supports iOS targets."
  check_command xcrun

  if ! xcrun simctl list devices | grep -q "(Booted)"; then
    die "no iOS simulator is booted. Start one with: maestro start-device --platform ios"
  fi

  if pgrep -f "simctl io booted recordVide[o]" >/dev/null 2>&1; then
    die "another simctl recording is already running."
  fi

  sim_log="/tmp/streamyfin-simctl-record-$$.log"
  rm -f "$VIDEO_PATH" "$sim_log"

  printf 'Starting simulator recording...\n'
  xcrun simctl io booted recordVideo --codec=h264 --force "$VIDEO_PATH" > "$sim_log" 2>&1 &
  simctl_pid=$!
  sleep 3

  if ! kill -0 "$simctl_pid" 2>/dev/null; then
    cat "$sim_log" >&2 || true
    die "simulator recording failed to start."
  fi

  set +e
  run_maestro_test
  test_status=$?
  set -e

  printf '\nStopping simulator recording...\n'
  kill -INT "$simctl_pid" 2>/dev/null || true
  wait "$simctl_pid" 2>/dev/null || true
  sleep 3

  if [ ! -s "$VIDEO_PATH" ]; then
    cat "$sim_log" >&2 || true
    die "recording file was not created: $VIDEO_PATH"
  fi

  rm -f "$sim_log"
  bytes=$(wc -c < "$VIDEO_PATH" | tr -d ' ')
  printf 'Recording saved: %s (%s bytes)\n' "$VIDEO_PATH" "$bytes"
  exit "$test_status"
}

case "${1-}" in
  simple|cf-simple|cf) FLOW_NAME=$1 ;;
  *) usage; exit 2 ;;
esac

case "${2-}" in
  maestro|adb|simulator) RECORDER=$2 ;;
  *) usage; exit 2 ;;
esac

case "${3-}" in
  android-tv|tv)
    printf '%s\n' "Android TV recording isn't supported by record-flow.sh yet."
    exit 0
    ;;
  android|ios) PLATFORM_NAME=$3 ;;
  *) usage; exit 2 ;;
esac

MAESTRO_SERVER_URL_WAS_SET=${MAESTRO_SERVER_URL+x}
load_env_file
MAESTRO_SERVER_URL_WAS_SET=${MAESTRO_SERVER_URL+x}

: "${MAESTRO_TARGET:=$(target_for_platform "$PLATFORM_NAME")}"
export MAESTRO_TARGET
: "${MAESTRO_PLATFORM:=$(maestro_platform_for_target "$PLATFORM_NAME")}"
export MAESTRO_PLATFORM
: "${MAESTRO_APP_ID:=$DEFAULT_APP_ID}"
export MAESTRO_APP_ID
: "${MAESTRO_PASSWORD=}"
export MAESTRO_PASSWORD
case "$MAESTRO_TARGET" in
  android-tv|tv)
    printf '%s\n' "Android TV recording isn't supported by record-flow.sh yet."
    exit 0
    ;;
esac

resolve_server_url
resolve_platform_server_urls

case "$MAESTRO_PLATFORM:${MAESTRO_IOS_SERVER_URL:-}" in
  ios:http://10.0.2.2:*)
    die "iOS selected with Android emulator host URL. Set MAESTRO_IOS_SERVER_URL or MAESTRO_SERVER_URL to http://localhost:8096."
    ;;
esac

case "$FLOW_NAME" in
  simple)
    if [ "$PLATFORM_NAME" = "ios" ]; then
      require_vars "$FLOW_NAME" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME
    else
      require_vars "$FLOW_NAME" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME
    fi
    ;;
  cf|cf-simple)
    if [ "$PLATFORM_NAME" = "ios" ]; then
      require_vars "$FLOW_NAME" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME MAESTRO_CF_ACCESS_CLIENT_ID MAESTRO_CF_ACCESS_CLIENT_SECRET
    else
      require_vars "$FLOW_NAME" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME MAESTRO_CF_ACCESS_CLIENT_ID MAESTRO_CF_ACCESS_CLIENT_SECRET
    fi
    ;;
esac

FLOW_FILE=$(flow_file_for "$FLOW_NAME" "$PLATFORM_NAME")
timestamp=$(date +"%Y-%m-%d_%H%M%S")
ARTIFACT_DIR="$UI_TEST_DIR/artifacts/$timestamp-record-$FLOW_NAME-$RECORDER-$PLATFORM_NAME"
VIDEO_EXT=mp4
[ "$RECORDER:$PLATFORM_NAME" = "simulator:ios" ] && VIDEO_EXT=mov
VIDEO_PATH="$ARTIFACT_DIR/$FLOW_NAME-$RECORDER-$PLATFORM_NAME.$VIDEO_EXT"

mkdir -p "$REPO_ROOT/$ARTIFACT_DIR"
export MAESTRO_ARTIFACT_DIR="$ARTIFACT_DIR"

check_command maestro
print_config

cd "$REPO_ROOT"
case "$RECORDER" in
  maestro) record_with_maestro ;;
  adb) record_with_adb ;;
  simulator) record_with_simulator ;;
esac

printf 'Recording saved: %s\n' "$VIDEO_PATH"
