#!/bin/sh
# Post-process UI test screenshots to redact sensitive values.
# Usage: sh tests/ui-testing/redact.sh <artifact-dir>
#
# Outputs redacted copies to <artifact-dir>/redacted/ preserving originals.
# Coordinates target 1080x2400 screenshots from the Android emulator.

set -eu

FILL="#111827"
TEXT="white"
FONT_SIZE=44
FONT="/System/Library/Fonts/Supplemental/Verdana Bold.ttf"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v magick >/dev/null 2>&1 || die "ImageMagick not found. Install with: brew install imagemagick"

artifact_dir="${1-}"
[ -n "$artifact_dir" ] || die "Usage: $0 <artifact-dir>"
[ -d "$artifact_dir" ] || die "Directory not found: $artifact_dir"

out_dir="$artifact_dir/redacted"
mkdir -p "$out_dir"

# Apply a single labeled redaction box to an image file (in-place on $out_dir copy).
# apply_box <file-in-out-dir> x1 y1 x2 y2 "LABEL"
apply_box() {
  file=$1; x1=$2; y1=$3; x2=$4; y2=$5; label=$6
  cx=$(( (x1 + x2) / 2 ))
  cy=$(( (y1 + y2) / 2 + FONT_SIZE / 3 ))
  tmp="${file}.tmp.png"
  magick "$file" \
    -fill "$FILL" -draw "rectangle $x1,$y1 $x2,$y2" \
    -fill "$TEXT" -font "$FONT" -pointsize $FONT_SIZE \
    -gravity None -annotate "+${cx}+${cy}" "$label" \
    "$tmp"
  mv "$tmp" "$file"
}

# ── Region coordinates (1080x2400 reference resolution) ──────────────────────
# x1   y1    x2    y2
URL_X1=70;  URL_Y1=600;  URL_X2=1010; URL_Y2=710
CFI_X1=70;  CFI_Y1=1360; CFI_X2=1010; CFI_Y2=1480
CFS_X1=70;  CFS_Y1=1680; CFS_X2=1010; CFS_Y2=1800

dir_name=$(basename "$artifact_dir")

printf 'Redacting screenshots in: %s\n' "$artifact_dir"
printf 'Output dir:               %s\n' "$out_dir"

for src in "$artifact_dir"/*.png; do
  [ -f "$src" ] || continue
  fname=$(basename "$src")
  dest="$out_dir/$fname"
  cp "$src" "$dest"

  # Always redact the server URL
  apply_box "$dest" $URL_X1 $URL_Y1 $URL_X2 $URL_Y2 "[ JELLYFIN SERVER URL ]"

  # Redact CF tokens for CF flows
  case "$dir_name" in *-cf*|*cf-*)
    apply_box "$dest" $CFI_X1 $CFI_Y1 $CFI_X2 $CFI_Y2 "[ CLOUDFLARE CLIENT ID ]"
    apply_box "$dest" $CFS_X1 $CFS_Y1 $CFS_X2 $CFS_Y2 "[ CLOUDFLARE CLIENT SECRET ]"
  esac

  printf '  redacted: %s\n' "$fname"
done

printf 'Done. Redacted images: %s\n' "$out_dir"
