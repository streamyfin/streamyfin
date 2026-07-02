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
Usage: sh tests/maestro/run-flow.sh simple|cf|ios-simple|ios-cf|tv-simple|tv-cf|play-steamboat-willie|ios-play-steamboat-willie|tv-play-steamboat-willie

Set required values in your shell environment or in:
  tests/maestro/.env.local (default)

Override the env file with:
  ENV_FILE=tests/maestro/.env.jeef sh tests/maestro/run-flow.sh ios-cf

Shell environment values take precedence over env file values.

Optional:
  MAESTRO_PLATFORM=ios|android
  MAESTRO_TARGET=android|ios|device
  MAESTRO_DEVICE=<simulator-or-emulator-udid>
  MAESTRO_IOS_SERVER_URL=<server URL typed by iOS flows>
  MAESTRO_IOS_DIRECT_SERVER_URL=<direct Jellyfin URL for iOS flows>
  MAESTRO_IOS_CF_SERVER_URL=<Cloudflare proxy URL for iOS flows>
  MAESTRO_ANDROID_SERVER_URL=<server URL typed by Android flows>
  MAESTRO_LOGIN_SERVER_URL=<platform-selected URL typed by phone login flows>
  MAESTRO_EXPO_DEV_CLIENT_URL=<Expo development client URL for iOS Debug builds>
  MAESTRO_CLEAR_CLIPBOARD=0  # Disable best-effort clipboard clearing
EOF
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

run_with_timeout() {
  timeout_seconds=$1
  label=$2
  shift 2

  "$@" &
  command_pid=$!
  elapsed_seconds=0

  while kill -0 "$command_pid" >/dev/null 2>&1; do
    if [ "$elapsed_seconds" -ge "$timeout_seconds" ]; then
      printf 'error: %s timed out after %s seconds.\n' "$label" "$timeout_seconds" >&2
      kill "$command_pid" >/dev/null 2>&1 || true
      sleep 2
      kill -9 "$command_pid" >/dev/null 2>&1 || true
      wait "$command_pid" 2>/dev/null || true
      return 124
    fi

    sleep 1
    elapsed_seconds=$((elapsed_seconds + 1))
  done

  wait "$command_pid"
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
      MAESTRO_APP_ID|MAESTRO_SERVER_URL|MAESTRO_IOS_SERVER_URL|MAESTRO_IOS_DIRECT_SERVER_URL|MAESTRO_IOS_CF_SERVER_URL|MAESTRO_ANDROID_SERVER_URL|MAESTRO_LOGIN_SERVER_URL|MAESTRO_USERNAME|MAESTRO_PASSWORD|MAESTRO_CF_ACCESS_CLIENT_ID|MAESTRO_CF_ACCESS_CLIENT_SECRET|MAESTRO_PLATFORM|MAESTRO_TARGET|MAESTRO_DEVICE|MAESTRO_EXPO_DEV_CLIENT_URL|MAESTRO_CLEAR_CLIPBOARD|MAESTRO_MOVIES_LIBRARY_ID|MAESTRO_SHOWS_LIBRARY_ID|MAESTRO_MUSIC_LIBRARY_ID|MAESTRO_STEAMBOAT_WILLIE_ID|MAESTRO_BIG_BUCK_BUNNY_ID) ;;
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
    printf 'error: missing required environment variables for %s flow:%s\n' "$flow_name" "$missing" >&2
    printf 'Set them in your shell or in %s.\n' "$ENV_FILE" >&2
    exit 1
  fi
}

check_maestro() {
  if ! command -v maestro >/dev/null 2>&1; then
    die "maestro is not installed or is not on PATH. Install it with: curl -fsSL https://get.maestro.mobile.dev | bash. The runner also checks \$HOME/.maestro/bin automatically."
  fi
}

adb_shell() {
  if [ -n "${MAESTRO_DEVICE:-}" ]; then
    adb -s "$MAESTRO_DEVICE" shell "$@"
  else
    adb shell "$@"
  fi
}

clear_android_clipboard() {
  command -v adb >/dev/null 2>&1 || return 1

  adb_shell cmd clipboard set text "" >/dev/null 2>&1 && return 0
  adb_shell cmd clipboard set-primary-clip "" >/dev/null 2>&1 && return 0

  return 1
}

clear_ios_clipboard() {
  command -v xcrun >/dev/null 2>&1 || return 1

  sim_device=${MAESTRO_DEVICE:-booted}
  printf '' | xcrun simctl pbcopy "$sim_device" >/dev/null 2>&1
}

clear_device_clipboard() {
  [ "${MAESTRO_CLEAR_CLIPBOARD:-1}" != "0" ] || return 0

  case "$MAESTRO_PLATFORM" in
    android)
      if clear_android_clipboard; then
        printf 'Cleared Android clipboard.\n\n'
      else
        printf '⚠️  WARNING: Unable to clear Android clipboard; continuing.\n\n'
      fi
      ;;
    ios)
      if clear_ios_clipboard; then
        printf 'Cleared iOS simulator clipboard.\n\n'
      else
        printf '⚠️  WARNING: Unable to clear iOS simulator clipboard; continuing.\n\n'
      fi
      ;;
  esac
}

prelaunch_android_tv_app() {
  [ "$MAESTRO_PLATFORM" = "android" ] || return 0
  [ "$MAESTRO_TARGET" = "android-tv" ] || return 0

  if ! command -v adb >/dev/null 2>&1; then
    printf '⚠️  WARNING: Unable to prelaunch Android TV app; adb is not on PATH.\n\n'
    return 0
  fi

  printf 'Prelaunching Android TV app with adb.\n'
  adb_shell pm clear "$MAESTRO_APP_ID" >/dev/null 2>&1 || true
  launcher_activity=$(
    adb_shell cmd package resolve-activity --brief "$MAESTRO_APP_ID" 2>/dev/null \
      | tr -d '\r' \
      | tail -n 1
  )
  if [ -n "$launcher_activity" ]; then
    adb_shell am start -n "$launcher_activity" >/dev/null
  else
    adb_shell monkey -p "$MAESTRO_APP_ID" -c android.intent.category.LAUNCHER 1 >/dev/null
  fi
  sleep 5
  printf '\n'
}

adb_input_text() {
  text=$1

  if ! command -v adb >/dev/null 2>&1; then
    die "adb is required for Android text entry"
  fi

  adb_shell input text "$text"
}

adb_press_enter() {
  if ! command -v adb >/dev/null 2>&1; then
    die "adb is required for Android text entry"
  fi

  adb_shell input keyevent KEYCODE_ENTER
}

adb_press_back() {
  if ! command -v adb >/dev/null 2>&1; then
    die "adb is required for Android navigation"
  fi

  adb_shell input keyevent KEYCODE_BACK
}

wait_for_android_device() {
  [ "${MAESTRO_PLATFORM:-}" = "android" ] || return 0
  command -v adb >/dev/null 2>&1 || return 0

  if [ -n "${MAESTRO_DEVICE:-}" ]; then
    adb -s "$MAESTRO_DEVICE" wait-for-device
  else
    adb wait-for-device
  fi
}

copy_maestro_debug_artifacts() {
  artifact_dir=$1
  [ -n "${HOME:-}" ] || return 0
  [ -d "$HOME/.maestro/tests" ] || return 0

  target_dir="$REPO_ROOT/$artifact_dir/maestro-debug"
  mkdir -p "$target_dir"
  find "$HOME/.maestro/tests" -mindepth 1 -maxdepth 1 -type d -exec cp -R {} "$target_dir/" \;
}

default_platform() {
  case "$1" in
    ios-*) printf '%s\n' 'ios' ;;
    tv-*) printf '%s\n' 'android' ;;
    *) printf '%s\n' 'android' ;;
  esac
}

default_target() {
  case "$1" in
    ios-*) printf '%s\n' 'ios' ;;
    tv-*) printf '%s\n' 'android-tv' ;;
    *) printf '%s\n' 'android' ;;
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
  case "${selected_flow:-}" in
    ios-cf)
      if [ -n "${MAESTRO_IOS_CF_SERVER_URL:-}" ]; then
        MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_CF_SERVER_URL
      fi
      ;;
    ios-simple|ios-play-steamboat-willie)
      if [ -n "${MAESTRO_IOS_DIRECT_SERVER_URL:-}" ]; then
        MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_DIRECT_SERVER_URL
      fi
      ;;
  esac

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

maestro_android_driver_unavailable() {
  platform=$1

  [ "$platform" = "android" ] || return 1
  [ -n "${HOME:-}" ] || return 1
  [ -d "$HOME/.maestro/tests" ] || return 1

  find "$HOME/.maestro/tests" -name maestro.log \
    -exec grep -Eq 'StatusRuntimeException: UNAVAILABLE|Not able to reach the gRPC server|Command failed \(tcp:' {} \; \
    -print -quit | grep -q .
}

run_maestro_test() {
  platform=$1
  flow_file=$2

  if [ -n "${MAESTRO_DEVICE:-}" ]; then
    (cd "$REPO_ROOT" && maestro test --platform "$platform" --device "$MAESTRO_DEVICE" "$flow_file")
  else
    (cd "$REPO_ROOT" && maestro test --platform "$platform" "$flow_file")
  fi
}

run_flow() {
  flow_name=$1
  flow_file=$2
  artifact_dir=$3
  platform=${MAESTRO_PLATFORM:-$(default_platform "$flow_name")}

  mkdir -p "$REPO_ROOT/$artifact_dir"
  export MAESTRO_ARTIFACT_DIR="$artifact_dir"

  printf 'Running %s flow\n' "$flow_name"
  printf 'Platform: %s\n' "$platform"
  if [ -n "${MAESTRO_DEVICE:-}" ]; then
    printf 'Device: %s\n' "$MAESTRO_DEVICE"
  fi
  printf 'Screenshots: %s\n' "$artifact_dir"

  wait_for_android_device

  set +e
  run_maestro_test "$platform" "$flow_file"
  status=$?
  set -e

  if [ "$status" -eq 0 ]; then
    return 0
  fi

  copy_maestro_debug_artifacts "$artifact_dir"

  if maestro_android_driver_unavailable "$platform"; then
    printf '⚠️  Android Maestro driver became unavailable; retrying %s once.\n' "$flow_name" >&2
    sleep 5
    wait_for_android_device
    set +e
    run_maestro_test "$platform" "$flow_file"
    status=$?
    set -e
    if [ "$status" -eq 0 ]; then
      return 0
    fi
    copy_maestro_debug_artifacts "$artifact_dir"
  fi

  return "$status"
}

run_tv_simple_flow() {
  artifact_dir=$1
  server_url_for_tv=${MAESTRO_SERVER_URL#http://}
  server_url_for_tv=${server_url_for_tv#https://}

  run_flow tv-login-open "$UI_TEST_DIR/flows/tv-login-open-flow.yaml" "$artifact_dir"
  adb_input_text "$server_url_for_tv"
  adb_press_enter

  run_flow tv-login-connect "$UI_TEST_DIR/flows/tv-login-connect-flow.yaml" "$artifact_dir"
  adb_input_text "$MAESTRO_USERNAME"

  if [ "${MAESTRO_PASSWORD:-}" != "" ]; then
    adb_press_back
    sleep 1
    run_flow tv-login-password-focus "$UI_TEST_DIR/flows/tv-login-password-focus-flow.yaml" "$artifact_dir"
    adb_input_text "$MAESTRO_PASSWORD"
    adb_press_back
    sleep 1
  fi

  run_flow tv-login-complete "$UI_TEST_DIR/flows/tv-login-complete-flow.yaml" "$artifact_dir"
}

run_tv_play_steamboat_willie_flow() {
  artifact_dir=$1

  run_tv_simple_flow "$artifact_dir"
  run_flow tv-play-steamboat-willie-open-detail "$UI_TEST_DIR/flows/tv-play-steamboat-willie-open-detail.yaml" "$artifact_dir"
  run_flow tv-play-steamboat-willie-play "$UI_TEST_DIR/flows/tv-play-steamboat-willie-play.yaml" "$artifact_dir"
}

run_tv_cf_flow() {
  artifact_dir=$1
  server_url_for_tv=${MAESTRO_SERVER_URL#http://}
  server_url_for_tv=${server_url_for_tv#https://}

  run_flow tv-login-open "$UI_TEST_DIR/flows/tv-login-open-flow.yaml" "$artifact_dir"
  adb_input_text "$server_url_for_tv"
  adb_press_enter

  run_flow tv-cf-open-headers "$UI_TEST_DIR/flows/tv-cf-open-headers-flow.yaml" "$artifact_dir"
  adb_input_text "$MAESTRO_CF_ACCESS_CLIENT_ID"
  adb_press_back
  sleep 1

  run_flow tv-cf-secret-focus "$UI_TEST_DIR/flows/tv-cf-secret-focus-flow.yaml" "$artifact_dir"
  adb_input_text "$MAESTRO_CF_ACCESS_CLIENT_SECRET"
  adb_press_back
  sleep 1

  run_flow tv-cf-connect "$UI_TEST_DIR/flows/tv-cf-connect-flow.yaml" "$artifact_dir"
  adb_input_text "$MAESTRO_USERNAME"

  if [ "${MAESTRO_PASSWORD:-}" != "" ]; then
    adb_press_back
    sleep 1
    run_flow tv-login-password-focus "$UI_TEST_DIR/flows/tv-login-password-focus-flow.yaml" "$artifact_dir"
    adb_input_text "$MAESTRO_PASSWORD"
    adb_press_back
    sleep 1
  fi

  run_flow tv-login-complete "$UI_TEST_DIR/flows/tv-login-complete-flow.yaml" "$artifact_dir"
  run_flow tv-play-steamboat-willie-open-detail "$UI_TEST_DIR/flows/tv-play-steamboat-willie-open-detail.yaml" "$artifact_dir"
  run_flow tv-play-steamboat-willie-play "$UI_TEST_DIR/flows/tv-play-steamboat-willie-play.yaml" "$artifact_dir"
}

run_android_simple_flow() {
  artifact_dir=$1
  server_url_for_android=${MAESTRO_LOGIN_SERVER_URL#http://}
  server_url_for_android=${server_url_for_android#https://}

  run_flow android-login-open "$UI_TEST_DIR/flows/android-login-open-flow.yaml" "$artifact_dir"
  adb_input_text "$server_url_for_android"

  run_flow android-login-connect "$UI_TEST_DIR/flows/android-login-connect-flow.yaml" "$artifact_dir"
  adb_input_text "$MAESTRO_USERNAME"

  if [ "${MAESTRO_PASSWORD:-}" != "" ]; then
    run_flow android-login-password-focus "$UI_TEST_DIR/flows/android-login-password-focus-flow.yaml" "$artifact_dir"
    adb_input_text "$MAESTRO_PASSWORD"
  fi

  run_flow android-login-complete "$UI_TEST_DIR/flows/android-login-complete-flow.yaml" "$artifact_dir"
}

run_android_play_steamboat_willie_flow() {
  artifact_dir=$1

  run_android_simple_flow "$artifact_dir"
  run_flow play-steamboat-willie-authenticated "$UI_TEST_DIR/flows/play-steamboat-willie-authenticated.yaml" "$artifact_dir"
}

run_android_cf_flow() {
  artifact_dir=$1
  server_url_for_android=${MAESTRO_LOGIN_SERVER_URL#http://}
  server_url_for_android=${server_url_for_android#https://}

  run_flow android-login-open "$UI_TEST_DIR/flows/android-login-open-flow.yaml" "$artifact_dir"
  adb_input_text "$server_url_for_android"
  adb_press_back
  sleep 1

  run_flow android-cf-open-headers "$UI_TEST_DIR/flows/android-cf-open-headers-flow.yaml" "$artifact_dir"
  adb_input_text "$MAESTRO_CF_ACCESS_CLIENT_ID"
  adb_press_back
  sleep 1

  run_flow android-cf-secret-focus "$UI_TEST_DIR/flows/android-cf-secret-focus-flow.yaml" "$artifact_dir"
  adb_input_text "$MAESTRO_CF_ACCESS_CLIENT_SECRET"
  adb_press_back
  sleep 1

  run_flow android-cf-connect "$UI_TEST_DIR/flows/android-cf-connect-flow.yaml" "$artifact_dir"
  adb_input_text "$MAESTRO_USERNAME"

  if [ "${MAESTRO_PASSWORD:-}" != "" ]; then
    run_flow android-login-password-focus "$UI_TEST_DIR/flows/android-login-password-focus-flow.yaml" "$artifact_dir"
    adb_input_text "$MAESTRO_PASSWORD"
  fi

  run_flow android-login-complete "$UI_TEST_DIR/flows/android-login-complete-flow.yaml" "$artifact_dir"
}

wait_for_ios_rendered_playback() {
  artifact_dir=$1
  sim_device=$2
  verifier_log="$artifact_dir/ios-playback-verifier.log"
  last_screenshot=''

  : >"$verifier_log"

  for attempt in $(seq 1 18); do
    sleep 5
    screenshot="$artifact_dir/ios-render-check-$attempt.png"
    last_screenshot=$screenshot

    if ! (
      cd "$REPO_ROOT" &&
        run_with_timeout "${IOS_SIMCTL_SCREENSHOT_TIMEOUT:-15}" \
          "iOS playback screenshot attempt $attempt" \
          xcrun simctl io "$sim_device" screenshot "$screenshot"
    ); then
      printf '%s: simctl screenshot failed or timed out.\n' "$screenshot" >>"$verifier_log"
      continue
    fi

    if [ "$attempt" -eq 1 ]; then
      cp "$screenshot" "$artifact_dir/12-playing-5s.png"
    fi

    if (cd "$REPO_ROOT" && node tests/maestro/verify-ios-playback-artifacts.mjs "$screenshot") >>"$verifier_log" 2>&1; then
      cp "$screenshot" "$artifact_dir/13-playing-10s.png"
      printf 'iOS playback rendered video content after %s screenshot attempt(s).\n' "$attempt"
      return 0
    fi
  done

  if [ -n "$last_screenshot" ] && [ -f "$last_screenshot" ]; then
    cp "$last_screenshot" "$artifact_dir/13-playing-10s.png"
  fi

  printf 'error: iOS playback did not render video content within 90 seconds.\n' >&2
  tail -80 "$verifier_log" >&2 || true
  return 1
}

open_ios_player_from_detail() {
  artifact_dir=$1

  [ "$MAESTRO_PLATFORM" = "ios" ] || die "iOS direct player open only supports iOS targets."
  command -v xcrun >/dev/null 2>&1 || die "xcrun is required for iOS simulator playback."
  command -v node >/dev/null 2>&1 || die "node is required for iOS playback screenshot verification."

  sim_device=${MAESTRO_DEVICE:-booted}

  run_maestro_test ios "$UI_TEST_DIR/flows/ios-tap-play-button.yaml"

  sleep 8
  opened_screenshot="$artifact_dir/11-player-opened.png"
  (
    cd "$REPO_ROOT" &&
      run_with_timeout "${IOS_SIMCTL_SCREENSHOT_TIMEOUT:-15}" \
        "iOS player-opened screenshot" \
        xcrun simctl io "$sim_device" screenshot "$opened_screenshot"
  ) || true

  wait_for_ios_rendered_playback "$artifact_dir" "$sim_device"
}

case "${1-}" in
  simple|cf|ios-simple|ios-cf|tv-simple|tv-cf|play-steamboat-willie|ios-play-steamboat-willie|tv-play-steamboat-willie) selected_flow=$1 ;;
  *) usage; exit 2 ;;
esac

MAESTRO_SERVER_URL_WAS_SET=${MAESTRO_SERVER_URL+x}
load_env_file
MAESTRO_SERVER_URL_WAS_SET=${MAESTRO_SERVER_URL+x}
: "${MAESTRO_PLATFORM:=$(default_platform "$selected_flow")}"
export MAESTRO_PLATFORM
: "${MAESTRO_TARGET:=$(default_target "$selected_flow")}"
export MAESTRO_TARGET
: "${MAESTRO_APP_ID:=$DEFAULT_APP_ID}"
export MAESTRO_APP_ID
: "${MAESTRO_PASSWORD=}"
export MAESTRO_PASSWORD
: "${MAESTRO_EXPO_DEV_CLIENT_URL=}"
export MAESTRO_EXPO_DEV_CLIENT_URL
resolve_server_url
resolve_platform_server_urls

# Print current configuration
printf '\n📱 Maestro Test Configuration:\n'
printf '  App ID:     %s\n' "$MAESTRO_APP_ID"
printf '  Platform:   %s\n' "$MAESTRO_PLATFORM"
printf '  Target:     %s\n' "$MAESTRO_TARGET"
printf '  Server URL: %s\n' "${MAESTRO_SERVER_URL:-(not set)}"
printf '  iOS URL:    %s\n' "${MAESTRO_IOS_SERVER_URL:-(not set)}"
printf '  Android URL: %s\n' "${MAESTRO_ANDROID_SERVER_URL:-(not set)}"
printf '  Login URL:  %s\n' "${MAESTRO_LOGIN_SERVER_URL:-(not set)}"
printf '  Username:   %s\n\n' "${MAESTRO_USERNAME:-(not set)}"

# Auto-detect if running on Android emulator and URL is localhost
if [ "$MAESTRO_PLATFORM" = "android" ] && [ "${MAESTRO_ANDROID_SERVER_URL:-}" = "http://localhost:8096" ]; then
  # Check if Android emulator is connected
  if command -v adb >/dev/null 2>&1 && adb devices | grep -q "emulator"; then
    printf '⚠️  WARNING: Using localhost with Android emulator detected.\n'
    printf '   Consider setting MAESTRO_SERVER_URL=http://10.0.2.2:8096\n'
    printf '   Or run: make -C tests/fixtures/jellyfin up\n\n'
  fi
fi

case "$MAESTRO_PLATFORM:${MAESTRO_IOS_SERVER_URL:-}" in
  ios:http://10.0.2.2:*)
    die "iOS selected with Android emulator host URL. Set MAESTRO_IOS_SERVER_URL or MAESTRO_SERVER_URL to http://localhost:8096."
    ;;
esac

case "$selected_flow" in
  simple|ios-simple|tv-simple)
    if [ "$selected_flow" = "ios-simple" ]; then
      require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME MAESTRO_EXPO_DEV_CLIENT_URL
    elif [ "$selected_flow" = "simple" ]; then
      require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME
    else
      require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_SERVER_URL MAESTRO_USERNAME
    fi
    ;;
  cf|ios-cf|tv-cf)
    if [ "$selected_flow" = "ios-cf" ]; then
      require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME MAESTRO_EXPO_DEV_CLIENT_URL MAESTRO_CF_ACCESS_CLIENT_ID MAESTRO_CF_ACCESS_CLIENT_SECRET MAESTRO_MOVIES_LIBRARY_ID MAESTRO_STEAMBOAT_WILLIE_ID
    elif [ "$selected_flow" = "cf" ]; then
      require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME MAESTRO_CF_ACCESS_CLIENT_ID MAESTRO_CF_ACCESS_CLIENT_SECRET MAESTRO_STEAMBOAT_WILLIE_ID
    else
      require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_SERVER_URL MAESTRO_USERNAME MAESTRO_CF_ACCESS_CLIENT_ID MAESTRO_CF_ACCESS_CLIENT_SECRET MAESTRO_STEAMBOAT_WILLIE_ID
    fi
    ;;
  play-steamboat-willie|ios-play-steamboat-willie|tv-play-steamboat-willie)
    if [ "$selected_flow" = "ios-play-steamboat-willie" ]; then
      require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME MAESTRO_EXPO_DEV_CLIENT_URL MAESTRO_MOVIES_LIBRARY_ID MAESTRO_STEAMBOAT_WILLIE_ID
    elif [ "$selected_flow" = "play-steamboat-willie" ]; then
      require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_LOGIN_SERVER_URL MAESTRO_USERNAME MAESTRO_STEAMBOAT_WILLIE_ID
    else
      require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_SERVER_URL MAESTRO_USERNAME MAESTRO_STEAMBOAT_WILLIE_ID
    fi
    ;;
esac

check_maestro
clear_device_clipboard
prelaunch_android_tv_app

timestamp=$(date +"%Y-%m-%d_%H%M%S")

case "$selected_flow" in
  simple)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-simple"
    run_flow simple "$UI_TEST_DIR/flows/simple-flow.yaml" "$final_artifact_dir"
    ;;
  cf)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-cf"
    if [ "$MAESTRO_PLATFORM" = "android" ] && [ "$MAESTRO_TARGET" = "android" ]; then
      run_android_cf_flow "$final_artifact_dir"
    else
      run_flow cf "$UI_TEST_DIR/flows/cf-flow.yaml" "$final_artifact_dir"
    fi
    run_flow play-steamboat-willie-authenticated "$UI_TEST_DIR/flows/play-steamboat-willie-authenticated.yaml" "$final_artifact_dir"
    ;;
  ios-simple)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-ios-simple"
    run_flow ios-simple "$UI_TEST_DIR/flows/ios-simple-flow.yaml" "$final_artifact_dir"
    ;;
  tv-simple)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-tv-simple"
    run_tv_simple_flow "$final_artifact_dir"
    ;;
  tv-cf)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-tv-cf"
    run_tv_cf_flow "$final_artifact_dir"
    ;;
  ios-cf)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-ios-cf"
    run_flow ios-cf "$UI_TEST_DIR/flows/ios-cf-flow.yaml" "$final_artifact_dir"
    run_flow ios-play-steamboat-willie-authenticated "$UI_TEST_DIR/flows/ios-play-steamboat-willie-authenticated.yaml" "$final_artifact_dir"
    open_ios_player_from_detail "$final_artifact_dir"
    ;;
  play-steamboat-willie)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-play-steamboat-willie"
    if [ "$MAESTRO_PLATFORM" = "android" ] && [ "$MAESTRO_TARGET" = "android" ]; then
      run_android_play_steamboat_willie_flow "$final_artifact_dir"
    else
      run_flow play-steamboat-willie "$UI_TEST_DIR/flows/play-steamboat-willie.yaml" "$final_artifact_dir"
    fi
    ;;
  ios-play-steamboat-willie)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-ios-play-steamboat-willie"
    run_flow ios-play-steamboat-willie "$UI_TEST_DIR/flows/ios-play-steamboat-willie.yaml" "$final_artifact_dir"
    open_ios_player_from_detail "$final_artifact_dir"
    ;;
  tv-play-steamboat-willie)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-tv-play-steamboat-willie"
    run_tv_play_steamboat_willie_flow "$final_artifact_dir"
    ;;
esac

printf 'Artifact directory: %s\n' "$final_artifact_dir"
