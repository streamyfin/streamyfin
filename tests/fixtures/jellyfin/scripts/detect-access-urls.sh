#!/bin/sh
set -eu

PORT="${JELLYFIN_PORT:-8096}"
TARGET="${MAESTRO_TARGET:-${JELLYFIN_TARGET:-android}}"
MODE="${1:-published}"

host_ip() {
  if [ -n "${JELLYFIN_HOST_IP:-}" ]; then
    printf '%s\n' "$JELLYFIN_HOST_IP"
    return 0
  fi

  for iface in en0 en1; do
    if command -v ipconfig >/dev/null 2>&1; then
      ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
      if [ -n "$ip" ]; then
        printf '%s\n' "$ip"
        return 0
      fi
    fi

    if command -v ifconfig >/dev/null 2>&1; then
      ip=$(ifconfig "$iface" 2>/dev/null | awk '/inet / && $2 != "127.0.0.1" {print $2; exit}' || true)
      if [ -n "$ip" ]; then
        printf '%s\n' "$ip"
        return 0
      fi
    fi
  done

  if command -v route >/dev/null 2>&1; then
    iface=$(route get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)
    if [ -n "$iface" ] && command -v ipconfig >/dev/null 2>&1; then
      ip=$(ipconfig getifaddr "$iface" 2>/dev/null || true)
      if [ -n "$ip" ]; then
        printf '%s\n' "$ip"
        return 0
      fi
    fi
  fi

  if command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
    if [ -n "$ip" ]; then
      printf '%s\n' "$ip"
      return 0
    fi
  fi

  return 1
}

append_url() {
  url=$1
  case "
$urls
" in
    *"
$url
"*) ;;
    *) urls="${urls}${url}
" ;;
  esac
}

host="$(host_ip || true)"
urls=''

append_url "http://localhost:$PORT"
append_url "http://127.0.0.1:$PORT"
append_url "http://10.0.2.2:$PORT"

if [ -n "$host" ]; then
  append_url "http://$host:$PORT"
fi

case "$MODE" in
  published)
    printf '%s' "$urls"
    ;;
  maestro)
    if [ -n "${MAESTRO_SERVER_URL:-}" ]; then
      printf '%s\n' "$MAESTRO_SERVER_URL"
      exit 0
    fi

    case "$TARGET" in
      ios|ios-simulator)
        if [ -n "$host" ]; then
          printf 'http://%s:%s\n' "$host" "$PORT"
        else
          printf 'http://localhost:%s\n' "$PORT"
        fi
        ;;
      device|physical)
        if [ -n "$host" ]; then
          printf 'http://%s:%s\n' "$host" "$PORT"
        else
          printf 'http://localhost:%s\n' "$PORT"
        fi
        ;;
      android|android-emulator|android-tv|tv|auto)
        printf 'http://10.0.2.2:%s\n' "$PORT"
        ;;
      *)
        printf 'error: unknown MAESTRO_TARGET/JELLYFIN_TARGET: %s\n' "$TARGET" >&2
        exit 2
        ;;
    esac
    ;;
  *)
    printf 'usage: %s published|maestro\n' "$0" >&2
    exit 2
    ;;
esac
