#!/usr/bin/env bash
# bump-version.sh — Update versions in eas.json, app.json, and JellyfinProvider.tsx
# Usage: ./bump-version.sh 1.2.3

set -euo pipefail

# ---------- UI ----------
BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
BLUE=$'\033[34m'; GREEN=$'\033[32m'; RED=$'\033[31m'; MAG=$'\033[35m'

title() { printf "\n${BOLD}${MAG}▌ %s${RESET}\n" "$1"; }
info()  { printf "${DIM}› %s${RESET}\n" "$1"; }
ok()    { printf "${GREEN}✔ %s${RESET}\n" "$1"; }
err()   { printf "${RED}✖ %s${RESET}\n" "$1"; }

need() { command -v "$1" >/dev/null 2>&1 || { err "Missing '$1'"; exit 1; }; }

# ---------- Args & checks ----------
NEW="${1-}"
[[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { err "Provide semver like 1.2.3"; exit 1; }

need jq
need sd
need git

EAS="eas.json"
APP="app.json"
TS="providers/JellyfinProvider.tsx"
for f in "$EAS" "$APP" "$TS"; do [[ -f "$f" ]] || { err "File not found: $f"; exit 1; }; done

OLD=$(jq -r '.expo.version' "$APP")
OLDCODE=$(jq -r '.expo.android.versionCode // 0' "$APP")
NEWCODE=$((OLDCODE + 1))

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

title "Preparing changes → ${BLUE}$NEW${RESET} (${DIM}android versionCode $OLDCODE → $NEWCODE${RESET})"

# ---------- Build proposed files ----------
# app.json: bump version + android.versionCode
jq --arg v "$NEW" --argjson nc "$NEWCODE" \
  '.expo.version=$v | .expo.android.versionCode=$nc' \
  "$APP" > "$TMPDIR/app.json"

# eas.json: set all build.*.channel if present
jq --arg v "$NEW" '
  .build |= (with_entries(.value |= (if has("channel") then (.channel=$v) else . end)))
' "$EAS" > "$TMPDIR/eas.json"

# JellyfinProvider.tsx: replace embedded version strings
cp "$TS" "$TMPDIR/JellyfinProvider.tsx"
sd 'version:\s*"[0-9]+\.[0-9]+\.[0-9]+"' "version: \"$NEW\"" "$TMPDIR/JellyfinProvider.tsx" >/dev/null
sd 'Version="[0-9]+\.[0-9]+\.[0-9]+"' "Version=\"$NEW\"" "$TMPDIR/JellyfinProvider.tsx" >/dev/null

# ---------- Preview diffs ----------
title "Preview (no files changed yet)"
show_diff () {
  local a="$1" b="$2" name="$3"
  printf "\n${BOLD}%s${RESET}\n" "$name"
  git --no-pager diff --no-index --color --minimal "$a" "$b" || true
}
show_diff "$APP" "$TMPDIR/app.json" "$APP"
show_diff "$EAS" "$TMPDIR/eas.json" "$EAS"
show_diff "$TS"  "$TMPDIR/JellyfinProvider.tsx" "$TS"

printf "\n${BOLD}Apply these changes?${RESET} [y/N] "
read -r REPLY
if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
  info "Aborted. No files modified."
  exit 0
fi

# ---------- Apply ----------
mv "$TMPDIR/app.json" "$APP"
mv "$TMPDIR/eas.json" "$EAS"
mv "$TMPDIR/JellyfinProvider.tsx" "$TS"

ok "Updated to version ${BOLD}$NEW${RESET}"
ok "Android versionCode ${BOLD}$NEWCODE${RESET}"
info "Files changed: $APP, $EAS, $TS"