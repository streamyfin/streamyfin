#!/bin/sh
set -eu

usage() {
  cat >&2 <<EOF
Usage: sh tests/maestro/run-ios-simulator-flow.sh all|build|simple|cf|record|cf-record

Environment:
  IOS_SIMULATOR_NAME     Preferred simulator name. Defaults to iPhone 16.
  IOS_BUILD_CONFIGURATION
                         Xcode configuration for CI install. Defaults to Debug.
  IOS_SCHEME             Xcode scheme for CI install. Defaults to Streamyfin.
  IOS_APP_NAME           Built app name. Defaults to Streamyfin.app.
  IOS_METRO_PORT         Metro port for Debug installs. Defaults to 8081.
  IOS_METRO_HOST         Metro host for Debug installs. Defaults to the first
                         available macOS LAN address, then localhost.
  IOS_EXPO_DEV_CLIENT_URL
                         Expo dev-client URL for Debug installs.
  IOS_APP_CACHE_PATH     Optional path to a restored/built .app directory.
  IOS_DERIVED_DATA_PATH  Optional Xcode DerivedData path. Defaults to a temp dir.
  IOS_SIMCTL_INSTALL_TIMEOUT
                         Seconds to allow simctl install. Defaults to 240.
  IOS_SKIP_INSTALL=1     Skip the Expo iOS build/install step.
  IOS_SKIP_RECORDING=1   Skip simulator video recording when running "all".
EOF
}

if [ "$#" -ne 1 ]; then
  usage
  exit 2
fi

flow_scope=$1
case "$flow_scope" in
  all|build|simple|cf|record|cf-record) ;;
  *) usage; exit 2 ;;
esac

artifact_root=tests/maestro/artifacts
maestro_env_file=${ENV_FILE:-tests/maestro/.env.local}
ios_debug_log="${artifact_root}/ios-simulator-debug.log"
ios_metro_log="${artifact_root}/ios-metro.log"
ios_xcodebuild_log="${artifact_root}/ios-xcodebuild.log"
preferred_simulator=${IOS_SIMULATOR_NAME:-iPhone 16}
ios_build_configuration=${IOS_BUILD_CONFIGURATION:-Debug}
ios_scheme=${IOS_SCHEME:-Streamyfin}
ios_app_name=${IOS_APP_NAME:-Streamyfin.app}
ios_metro_port=${IOS_METRO_PORT:-8081}
ios_metro_host=${IOS_METRO_HOST:-}
ios_app_cache_path=${IOS_APP_CACHE_PATH:-}
ios_simctl_install_timeout=${IOS_SIMCTL_INSTALL_TIMEOUT:-240}
ios_dev_client_url=''
ios_derived_data=${IOS_DERIVED_DATA_PATH:-${TMPDIR:-/tmp}/streamyfin-ios-derived-data}
ios_app_path=''
metro_pid=''
export EXPO_PUBLIC_MAESTRO_DEBUG="${EXPO_PUBLIC_MAESTRO_DEBUG:-1}"

check_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'error: %s is not installed or is not on PATH.\n' "$1" >&2
    exit 1
  }
}

load_ios_server_urls_from_env_file() {
  [ -f "$maestro_env_file" ] || return 0

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
      MAESTRO_SERVER_URL|MAESTRO_IOS_SERVER_URL|MAESTRO_IOS_DIRECT_SERVER_URL|MAESTRO_IOS_CF_SERVER_URL) ;;
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
  done < "$maestro_env_file"
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

find_simulator_udid() {
  simulator_name=$1

  xcrun simctl list devices available \
    | awk -v name="$simulator_name" -F '[()]' '$0 ~ name && $0 ~ /(Shutdown|Booted)/ { print $2; exit }'
}

find_any_iphone_udid() {
  xcrun simctl list devices available \
    | awk -F '[()]' '/iPhone/ && /(Shutdown|Booted)/ { print $2; exit }'
}

detect_metro_host() {
  for interface in en0 en1; do
    host=$(ipconfig getifaddr "$interface" 2>/dev/null || true)
    if [ -n "$host" ]; then
      printf '%s\n' "$host"
      return 0
    fi
  done

  printf 'localhost\n'
}

configure_metro_url() {
  if [ -z "$ios_metro_host" ]; then
    ios_metro_host=$(detect_metro_host)
  fi

  ios_dev_client_url=${IOS_EXPO_DEV_CLIENT_URL:-exp+streamyfin://expo-development-client/?url=http%3A%2F%2F${ios_metro_host}%3A${ios_metro_port}}
}

boot_simulator() {
  sim_udid=$1

  if ! xcrun simctl boot "$sim_udid" >/dev/null 2>&1; then
    if ! xcrun simctl list devices | grep "$sim_udid" | grep -q "(Booted)"; then
      printf 'error: failed to boot iOS simulator %s\n' "$sim_udid" >&2
      return 1
    fi
  fi

  xcrun simctl bootstatus "$sim_udid" -b
}

stop_metro() {
  if [ -n "$metro_pid" ]; then
    kill "$metro_pid" >/dev/null 2>&1 || true
  fi
}

wait_for_metro() {
  for _ in $(seq 1 60); do
    if curl -sf "http://localhost:${ios_metro_port}/status" | grep -q "packager-status:running"; then
      return 0
    fi
    if [ "$ios_metro_host" != "localhost" ] && curl -sf "http://${ios_metro_host}:${ios_metro_port}/status" | grep -q "packager-status:running"; then
      return 0
    fi
    sleep 1
  done

  printf 'error: Metro did not become ready on port %s.\n' "$ios_metro_port" >&2
  tail -100 "$ios_metro_log" >&2 || true
  return 1
}

start_metro() {
  expo_host=lan
  if [ "$ios_metro_host" = "localhost" ] || [ "$ios_metro_host" = "127.0.0.1" ]; then
    expo_host=localhost
  fi

  printf 'Starting Metro on %s:%s for iOS Debug build.\n' "$ios_metro_host" "$ios_metro_port" | tee -a "$ios_debug_log"
  EXPO_TV=0 REACT_NATIVE_PACKAGER_HOSTNAME="$ios_metro_host" \
    bunx expo start --dev-client --host "$expo_host" --port "$ios_metro_port" >"$ios_metro_log" 2>&1 &
  metro_pid=$!
  printf '%s\n' "$metro_pid" >"${artifact_root}/ios-metro.pid"
  wait_for_metro
}

configure_ios_packager_host() {
  if [ "$ios_build_configuration" = "Release" ]; then
    return 0
  fi

  printf 'Configuring iOS packager host: %s:%s\n' "$ios_metro_host" "$ios_metro_port" | tee -a "$ios_debug_log"
  xcrun simctl spawn "$MAESTRO_DEVICE" defaults write "$MAESTRO_APP_ID" RCT_jsLocation "${ios_metro_host}:${ios_metro_port}"
}

configure_ios_permissions() {
  printf 'Preconfiguring iOS simulator notification permission.\n' | tee -a "$ios_debug_log"
  if xcrun simctl privacy "$MAESTRO_DEVICE" revoke notifications "$MAESTRO_APP_ID" >>"$ios_debug_log" 2>&1; then
    return 0
  fi

  printf 'warning: unable to preconfigure iOS notification permission; Maestro will dismiss the prompt if it appears.\n' | tee -a "$ios_debug_log"
}

collect_ios_failure_diagnostics() {
  label=$1
  diag_dir="${artifact_root}/ios-failure-${label}"
  mkdir -p "$diag_dir"

  printf 'Collecting iOS failure diagnostics for %s in %s\n' "$label" "$diag_dir" | tee -a "$ios_debug_log"

  xcrun simctl io "$MAESTRO_DEVICE" screenshot "$diag_dir/final-screen.png" >>"$ios_debug_log" 2>&1 || true

  xcrun simctl spawn "$MAESTRO_DEVICE" log show \
    --style syslog \
    --last 5m \
    --predicate 'process == "Streamyfin" || eventMessage CONTAINS[c] "Streamyfin" || eventMessage CONTAINS[c] "MpvPlayer" || eventMessage CONTAINS[c] "MPV" || eventMessage CONTAINS[c] "mpv" || eventMessage CONTAINS[c] "crash" || eventMessage CONTAINS[c] "Exception" || eventMessage CONTAINS[c] "SIG"' \
    >"$diag_dir/ios-device-streamyfin.log" 2>&1 || true

  xcrun simctl spawn "$MAESTRO_DEVICE" log show \
    --style compact \
    --last 2m \
    >"$diag_dir/ios-device-recent.log" 2>&1 || true

  app_data_dir=$(xcrun simctl get_app_container "$MAESTRO_DEVICE" "$MAESTRO_APP_ID" data 2>/dev/null || true)
  if [ -n "$app_data_dir" ]; then
    printf 'Streamyfin app data container: %s\n' "$app_data_dir" >"$diag_dir/app-container.txt"
    find "$app_data_dir/tmp" "$app_data_dir/Library/Caches" -type f -name 'logs.txt' -print 2>/dev/null \
      | while IFS= read -r log_file; do
        cp "$log_file" "$diag_dir/mpv-$(basename "$log_file")" 2>/dev/null || true
      done
  fi

  crash_dir="$HOME/Library/Logs/DiagnosticReports"
  if [ -d "$crash_dir" ]; then
    mkdir -p "$diag_dir/crash-reports"
    find "$crash_dir" -type f \( -name '*.ips' -o -name '*.crash' \) -print 2>/dev/null \
      | while IFS= read -r crash_file; do
        case "$(basename "$crash_file")" in
          *Streamyfin*|*streamyfin*|*MpvPlayer*|*mpv*|*MPV*)
            cp "$crash_file" "$diag_dir/crash-reports/" 2>/dev/null || true
            ;;
        esac
      done
  fi
}

find_built_ios_app() {
  find "$ios_derived_data/Build/Products" -type d -name "$ios_app_name" -print -quit 2>/dev/null
}

install_launch_ios_app() {
  printf 'Installing built app: %s\n' "$ios_app_path" | tee -a "$ios_debug_log"
  if ! run_with_timeout "$ios_simctl_install_timeout" "simctl install iOS app" xcrun simctl install "$MAESTRO_DEVICE" "$ios_app_path"; then
    collect_ios_failure_diagnostics install
    return 1
  fi
  configure_ios_packager_host
  configure_ios_permissions

  printf 'Launching app id: %s\n' "$MAESTRO_APP_ID" | tee -a "$ios_debug_log"
  xcrun simctl launch "$MAESTRO_DEVICE" "$MAESTRO_APP_ID"
  sleep 5
}

use_cached_ios_app() {
  if [ -z "$ios_app_cache_path" ] || [ ! -d "$ios_app_cache_path" ]; then
    return 1
  fi

  ios_app_path=$ios_app_cache_path
  printf 'Using cached iOS app: %s\n' "$ios_app_path" | tee -a "$ios_debug_log"
  install_launch_ios_app
}

save_ios_app_cache_candidate() {
  if [ -z "$ios_app_cache_path" ]; then
    return 0
  fi

  rm -rf "$ios_app_cache_path"
  mkdir -p "$(dirname "$ios_app_cache_path")"
  cp -R "$ios_app_path" "$ios_app_cache_path"
  printf 'Saved iOS app cache candidate: %s\n' "$ios_app_cache_path" | tee -a "$ios_debug_log"
}

build_install_launch_ios_app() {
  if [ -z "${IOS_DERIVED_DATA_PATH:-}" ]; then
    rm -rf "$ios_derived_data"
  fi

  host_arch=$(uname -m 2>/dev/null || printf '%s' unknown)
  case "$host_arch" in
    arm64|x86_64)
      xcodebuild_arch_settings="ONLY_ACTIVE_ARCH=YES ARCHS=$host_arch"
      ;;
    *)
      xcodebuild_arch_settings="ONLY_ACTIVE_ARCH=YES"
      ;;
  esac

  {
    printf 'Building iOS app with xcodebuild.\n'
    printf 'Workspace: ios/Streamyfin.xcworkspace\n'
    printf 'Scheme: %s\n' "$ios_scheme"
    printf 'Configuration: %s\n' "$ios_build_configuration"
    printf 'Destination: id=%s\n' "$MAESTRO_DEVICE"
    printf 'DerivedData: %s\n' "$ios_derived_data"
    printf 'Arch settings: %s\n' "$xcodebuild_arch_settings"
  } | tee -a "$ios_debug_log"

  if [ "$host_arch" = "arm64" ] || [ "$host_arch" = "x86_64" ]; then
    if ! EXPO_TV=0 xcodebuild \
      -workspace ios/Streamyfin.xcworkspace \
      -scheme "$ios_scheme" \
      -configuration "$ios_build_configuration" \
      -destination "id=$MAESTRO_DEVICE" \
      -derivedDataPath "$ios_derived_data" \
      CODE_SIGNING_ALLOWED=NO \
      COMPILER_INDEX_STORE_ENABLE=NO \
      ONLY_ACTIVE_ARCH=YES \
      ARCHS="$host_arch" \
      >"$ios_xcodebuild_log" 2>&1; then
      printf 'error: xcodebuild failed. Last 200 log lines:\n' >&2
      tail -200 "$ios_xcodebuild_log" >&2 || true
      return 1
    fi
  elif ! EXPO_TV=0 xcodebuild \
    -workspace ios/Streamyfin.xcworkspace \
    -scheme "$ios_scheme" \
    -configuration "$ios_build_configuration" \
    -destination "id=$MAESTRO_DEVICE" \
    -derivedDataPath "$ios_derived_data" \
    CODE_SIGNING_ALLOWED=NO \
    COMPILER_INDEX_STORE_ENABLE=NO \
    ONLY_ACTIVE_ARCH=YES \
    >"$ios_xcodebuild_log" 2>&1; then
    printf 'error: xcodebuild failed. Last 200 log lines:\n' >&2
    tail -200 "$ios_xcodebuild_log" >&2 || true
    return 1
  fi

  ios_app_path=$(find_built_ios_app)
  if [ -z "$ios_app_path" ]; then
    printf 'error: %s was not found under %s.\n' "$ios_app_name" "$ios_derived_data/Build/Products" >&2
    find "$ios_derived_data/Build/Products" -maxdepth 3 -type d -name '*.app' -print >&2 || true
    return 1
  fi

  save_ios_app_cache_candidate
  install_launch_ios_app
}

install_ios_app() {
  [ "${IOS_SKIP_INSTALL:-0}" != "1" ] || return 0

  if use_cached_ios_app; then
    return 0
  fi

  bun run prebuild
  if [ "$ios_build_configuration" != "Release" ]; then
    start_metro
    export MAESTRO_EXPO_DEV_CLIENT_URL="$ios_dev_client_url"
  fi
  build_install_launch_ios_app
}

prepare_ios_app_for_flow() {
  if [ -n "$ios_app_path" ]; then
    printf 'Resetting installed iOS app before Maestro flow.\n' | tee -a "$ios_debug_log"
    xcrun simctl terminate "$MAESTRO_DEVICE" "$MAESTRO_APP_ID" >/dev/null 2>&1 || true
    xcrun simctl uninstall "$MAESTRO_DEVICE" "$MAESTRO_APP_ID" >/dev/null 2>&1 || true
    if ! run_with_timeout "$ios_simctl_install_timeout" "simctl reinstall iOS app" xcrun simctl install "$MAESTRO_DEVICE" "$ios_app_path"; then
      collect_ios_failure_diagnostics reinstall
      return 1
    fi
    configure_ios_packager_host
    configure_ios_permissions
  fi

  if [ "$ios_build_configuration" != "Release" ]; then
    printf 'Launching app id before Expo dev-client URL: %s\n' "$MAESTRO_APP_ID" | tee -a "$ios_debug_log"
    xcrun simctl launch "$MAESTRO_DEVICE" "$MAESTRO_APP_ID"
    sleep 5
    printf 'Opening Expo dev-client URL: %s\n' "$MAESTRO_EXPO_DEV_CLIENT_URL" | tee -a "$ios_debug_log"
    xcrun simctl openurl "$MAESTRO_DEVICE" "$MAESTRO_EXPO_DEV_CLIENT_URL"
    sleep 5
  else
    xcrun simctl launch "$MAESTRO_DEVICE" "$MAESTRO_APP_ID"
    sleep 5
  fi
}

use_direct_ios_server_url() {
  if [ -n "${MAESTRO_IOS_DIRECT_SERVER_URL:-}" ]; then
    MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_DIRECT_SERVER_URL
  elif [ -n "${MAESTRO_SERVER_URL:-}" ]; then
    MAESTRO_IOS_SERVER_URL=$MAESTRO_SERVER_URL
  fi

  if [ -z "${MAESTRO_IOS_SERVER_URL:-}" ]; then
    printf 'error: MAESTRO_IOS_SERVER_URL or MAESTRO_IOS_DIRECT_SERVER_URL is required for iOS direct flow.\n' >&2
    return 1
  fi

  MAESTRO_SERVER_URL=$MAESTRO_IOS_SERVER_URL
  export MAESTRO_SERVER_URL
  export MAESTRO_IOS_SERVER_URL
  printf 'Using iOS direct server URL: %s\n' "$MAESTRO_IOS_SERVER_URL" | tee -a "$ios_debug_log"
}

use_cf_ios_server_url() {
  if [ -n "${MAESTRO_IOS_CF_SERVER_URL:-}" ]; then
    MAESTRO_IOS_SERVER_URL=$MAESTRO_IOS_CF_SERVER_URL
  elif [ -n "${MAESTRO_SERVER_URL:-}" ]; then
    MAESTRO_IOS_SERVER_URL=$MAESTRO_SERVER_URL
  fi

  if [ -z "${MAESTRO_IOS_SERVER_URL:-}" ]; then
    printf 'error: MAESTRO_IOS_SERVER_URL or MAESTRO_IOS_CF_SERVER_URL is required for iOS CF flow.\n' >&2
    return 1
  fi

  MAESTRO_SERVER_URL=$MAESTRO_IOS_SERVER_URL
  export MAESTRO_SERVER_URL
  export MAESTRO_IOS_SERVER_URL
  printf 'Using iOS CF server URL: %s\n' "$MAESTRO_IOS_SERVER_URL" | tee -a "$ios_debug_log"
}

run_ios_playback_flow_with_retry() {
  label=$1
  shift

  attempts=${IOS_PLAYBACK_FLOW_ATTEMPTS:-2}
  attempt=1
  while [ "$attempt" -le "$attempts" ]; do
    if [ "$attempt" -gt 1 ]; then
      printf 'Retrying %s after failed iOS playback attempt %s with a clean app reinstall.\n' "$label" "$((attempt - 1))" | tee -a "$ios_debug_log"
    fi

    prepare_ios_app_for_flow
    if run_ios_flow_with_diagnostics "${label}-attempt-${attempt}" "$@"; then
      return 0
    else
      status=$?
    fi

    if [ "$attempt" -ge "$attempts" ]; then
      return "$status"
    fi

    attempt=$((attempt + 1))
  done

  return 1
}

run_simple_flow() {
  use_direct_ios_server_url
  run_ios_playback_flow_with_retry direct-playback sh tests/maestro/run-flow.sh ios-play-steamboat-willie
}

run_cf_flow() {
  use_cf_ios_server_url
  run_ios_playback_flow_with_retry cf-playback sh tests/maestro/run-flow.sh ios-cf
}

record_cf_flow() {
  prepare_ios_app_for_flow
  use_cf_ios_server_url
  record_ios_flow_with_diagnostics cf-playback sh tests/maestro/run-flow.sh ios-cf
}

record_simple_flow() {
  prepare_ios_app_for_flow
  use_direct_ios_server_url
  record_ios_flow_with_diagnostics direct-playback sh tests/maestro/run-flow.sh ios-play-steamboat-willie
}

run_ios_flow_with_diagnostics() {
  label=$1
  shift

  set +e
  "$@"
  status=$?
  set -e

  if [ "$status" -ne 0 ]; then
    collect_ios_failure_diagnostics "$label"
  fi

  return "$status"
}

record_ios_flow_with_diagnostics() {
  label=$1
  shift

  timestamp=$(date +"%Y-%m-%d_%H%M%S")
  record_dir="${artifact_root}/${timestamp}-record-${label}-simulator-ios"
  video_path="${record_dir}/${label}-simulator-ios.mov"
  simctl_log="${record_dir}/simctl-record.log"
  mkdir -p "$record_dir"

  printf 'Starting iOS simulator playback recording: %s\n' "$video_path" | tee -a "$ios_debug_log"
  xcrun simctl io booted recordVideo --codec=h264 --force "$video_path" >"$simctl_log" 2>&1 &
  simctl_pid=$!
  sleep 3

  if ! kill -0 "$simctl_pid" >/dev/null 2>&1; then
    cat "$simctl_log" >&2 || true
    printf 'error: iOS simulator recording failed to start.\n' >&2
    return 1
  fi

  set +e
  "$@"
  status=$?
  set -e

  printf 'Stopping iOS simulator playback recording.\n' | tee -a "$ios_debug_log"
  kill -INT "$simctl_pid" >/dev/null 2>&1 || true
  wait "$simctl_pid" >/dev/null 2>&1 || true
  sleep 3

  if [ "$status" -ne 0 ]; then
    collect_ios_failure_diagnostics "$label"
  fi

  if [ ! -s "$video_path" ]; then
    cat "$simctl_log" >&2 || true
    printf 'error: recording file was not created: %s\n' "$video_path" >&2
    return 1
  fi

  bytes=$(wc -c <"$video_path" | tr -d ' ')
  printf 'iOS simulator playback recording saved: %s (%s bytes)\n' "$video_path" "$bytes" | tee -a "$ios_debug_log"
  return "$status"
}

mkdir -p "$artifact_root"
: >"$ios_debug_log"
: >"$ios_metro_log"
trap stop_metro EXIT

check_command xcrun
check_command xcodebuild
check_command bun
check_command maestro
check_command curl

configure_metro_url

sim_udid=$(find_simulator_udid "$preferred_simulator")
if [ -z "$sim_udid" ]; then
  printf 'Preferred simulator "%s" was not found; falling back to the first available iPhone simulator.\n' "$preferred_simulator" | tee -a "$ios_debug_log"
  sim_udid=$(find_any_iphone_udid)
fi

if [ -z "$sim_udid" ]; then
  printf 'error: no available iPhone simulator was found.\n' >&2
  xcrun simctl list devices available >&2 || true
  exit 1
fi

{
  printf 'Selected iOS simulator: %s\n' "$sim_udid"
  printf 'iOS build configuration: %s\n' "$ios_build_configuration"
  printf 'iOS scheme: %s\n' "$ios_scheme"
  printf 'iOS app name: %s\n' "$ios_app_name"
  printf 'iOS app cache path: %s\n' "$ios_app_cache_path"
  printf 'iOS DerivedData path: %s\n' "$ios_derived_data"
  printf 'iOS Metro host: %s\n' "$ios_metro_host"
  printf 'iOS Expo dev-client URL: %s\n' "$ios_dev_client_url"
  xcodebuild -version || true
  xcrun simctl list devices available || true
} >>"$ios_debug_log" 2>&1

boot_simulator "$sim_udid"

export MAESTRO_PLATFORM=ios
export MAESTRO_TARGET=ios
export MAESTRO_DEVICE="$sim_udid"
export MAESTRO_EXPO_DEV_CLIENT_URL="$ios_dev_client_url"
load_ios_server_urls_from_env_file

install_ios_app

case "$flow_scope" in
  build)
    ;;
  simple)
    run_simple_flow
    ;;
  cf)
    run_cf_flow
    ;;
  record)
    record_simple_flow
    ;;
  cf-record)
    record_cf_flow
    ;;
  all)
    run_simple_flow
    run_cf_flow
    if [ "${IOS_SKIP_RECORDING:-0}" != "1" ]; then
      record_simple_flow
      record_cf_flow
    fi
    ;;
esac
