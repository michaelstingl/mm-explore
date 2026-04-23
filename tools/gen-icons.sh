#!/usr/bin/env bash
# Generates PNG icons from icons/icon-source.svg (SSoT).
# CI uses rsvg-convert (librsvg); locally we fall back to qlmanage+sips on macOS.
# Output files are gitignored — regenerate on demand or let the GH Action do it.
set -euo pipefail

SRC="icons/icon-source.svg"
[ -f "$SRC" ] || { echo "missing $SRC" >&2; exit 1; }

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 512 -h 512 "$SRC" -o icons/icon-512.png
  rsvg-convert -w 192 -h 192 "$SRC" -o icons/icon-192.png
  rsvg-convert -w 180 -h 180 "$SRC" -o icons/apple-touch-icon.png
  rsvg-convert -w 32  -h 32  "$SRC" -o icons/favicon-32.png
  rsvg-convert -w 16  -h 16  "$SRC" -o icons/favicon-16.png
elif command -v qlmanage >/dev/null 2>&1 && command -v sips >/dev/null 2>&1; then
  TMP=$(mktemp -d)
  qlmanage -t -s 1024 -o "$TMP" "$SRC" >/dev/null 2>&1
  BIG="$TMP/$(basename "$SRC").png"
  sips -z 512 512 "$BIG" --out icons/icon-512.png >/dev/null
  sips -z 192 192 "$BIG" --out icons/icon-192.png >/dev/null
  sips -z 180 180 "$BIG" --out icons/apple-touch-icon.png >/dev/null
  sips -z 32  32  "$BIG" --out icons/favicon-32.png >/dev/null
  sips -z 16  16  "$BIG" --out icons/favicon-16.png >/dev/null
  rm -rf "$TMP"
else
  echo "need rsvg-convert (brew install librsvg) or macOS qlmanage+sips" >&2
  exit 1
fi

ls -la icons/
