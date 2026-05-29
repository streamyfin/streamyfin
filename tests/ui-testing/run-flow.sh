#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH=; cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH=; cd -- "$SCRIPT_DIR/../.." && pwd)
UI_TEST_DIR="tests/ui-testing"
ENV_FILE="${ENV_FILE:-$REPO_ROOT/$UI_TEST_DIR/.env.local}"
DEFAULT_APP_ID="com.fredrikburmester.streamyfin"

if [ -n "${HOME:-}" ] && [ -d "$HOME/.maestro/bin" ]; then
  PATH="$HOME/.maestro/bin:$PATH"
  export PATH
fi

usage() {
  cat >&2 <<EOF
Usage: sh tests/ui-testing/run-flow.sh simple|cf|ios-simple|ios-cf|tv-simple|tv-cf

Set required values in your shell environment or in:
  tests/ui-testing/.env.local (default)

Override the env file with:
  ENV_FILE=tests/ui-testing/.env.jeef sh tests/ui-testing/run-flow.sh ios-cf

Shell environment values take precedence over env file values.
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
      MAESTRO_APP_ID|MAESTRO_SERVER_URL|MAESTRO_USERNAME|MAESTRO_PASSWORD|MAESTRO_CF_ACCESS_CLIENT_ID|MAESTRO_CF_ACCESS_CLIENT_SECRET) ;;
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

run_flow() {
  flow_name=$1
  flow_file=$2
  artifact_dir=$3

  mkdir -p "$REPO_ROOT/$artifact_dir"
  export MAESTRO_ARTIFACT_DIR="$artifact_dir"

  printf 'Running %s flow\n' "$flow_name"
  printf 'Screenshots: %s\n' "$artifact_dir"

  (cd "$REPO_ROOT" && maestro test "$flow_file")
}

case "${1-}" in
  simple|cf|ios-simple|ios-cf|tv-simple|tv-cf) selected_flow=$1 ;;
  *) usage; exit 2 ;;
esac

load_env_file
: "${MAESTRO_APP_ID:=$DEFAULT_APP_ID}"
export MAESTRO_APP_ID
: "${MAESTRO_PASSWORD=}"
export MAESTRO_PASSWORD

# Print current configuration
printf '\n📱 Maestro Test Configuration:\n'
printf '  App ID:     %s\n' "$MAESTRO_APP_ID"
printf '  Server URL: %s\n' "${MAESTRO_SERVER_URL:-(not set)}"
printf '  Username:   %s\n\n' "${MAESTRO_USERNAME:-(not set)}"

# Auto-detect if running on Android emulator and URL is localhost
if [ "${MAESTRO_SERVER_URL:-}" = "http://localhost:8096" ]; then
  # Check if Android emulator is connected
  if command -v adb >/dev/null 2>&1 && adb devices | grep -q "emulator"; then
    printf '⚠️  WARNING: Using localhost with Android emulator detected.\n'
    printf '   Consider setting MAESTRO_SERVER_URL=http://10.0.2.2:8096\n'
    printf '   Or run: make jellyfin-set-external-url\n\n'
  fi
fi

case "$selected_flow" in
  simple|ios-simple|tv-simple)
    require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_SERVER_URL MAESTRO_USERNAME
    ;;
  cf|ios-cf|tv-cf)
    require_vars "$selected_flow" MAESTRO_APP_ID MAESTRO_SERVER_URL MAESTRO_USERNAME MAESTRO_CF_ACCESS_CLIENT_ID MAESTRO_CF_ACCESS_CLIENT_SECRET
    ;;
esac

check_maestro

timestamp=$(date +"%Y-%m-%d_%H%M%S")

case "$selected_flow" in
  simple)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-simple"
    run_flow simple "$UI_TEST_DIR/flows/simple-flow.yaml" "$final_artifact_dir"
    ;;
  cf)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-cf"
    run_flow cf "$UI_TEST_DIR/flows/cf-flow.yaml" "$final_artifact_dir"
    ;;
  ios-simple)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-ios-simple"
    run_flow ios-simple "$UI_TEST_DIR/flows/ios-simple-flow.yaml" "$final_artifact_dir"
    ;;
  ios-cf)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-ios-cf"
    run_flow ios-cf "$UI_TEST_DIR/flows/ios-cf-flow.yaml" "$final_artifact_dir"
    ;;
  tv-simple)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-tv-simple"
    run_flow tv-simple "$UI_TEST_DIR/flows/tv-simple-flow.yaml" "$final_artifact_dir"
    ;;
  tv-cf)
    final_artifact_dir="$UI_TEST_DIR/artifacts/$timestamp-tv-cf"
    run_flow tv-cf "$UI_TEST_DIR/flows/tv-cf-flow.yaml" "$final_artifact_dir"
    ;;
esac

printf 'Artifact directory: %s\n' "$final_artifact_dir"
