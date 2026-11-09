#!/usr/bin/env bash
# Rebuilds every README image from fresh captures of the real app, in the dark theme and the light one.
#
#   npm run readme:visuals                 # capture the live app with its demo data, then render
#   npm run readme:visuals -- --render     # render again from the last captures
#   ORIGIN=http://localhost:4173 npm run readme:visuals   # capture a local build instead
#
# Needs ffmpeg and ImageMagick. The scenes are WebGL, rendered on the GPU by Playwright's Chromium;
# three.js is installed for the build only, without touching package.json.
set -euo pipefail
SRC=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SRC/../../.." && pwd)
OUT="$REPO/docs/readme"
TMP="$OUT/.raw/render"
cd "$REPO"
[[ -f node_modules/three/build/three.module.js ]] || npm install --no-save --no-audit --no-fund three@0.170.0 >/dev/null
export NODE_PATH="$REPO/node_modules"
[[ ${1:-} == --render ]] || node "$SRC/capture.mjs"
node "$SRC/tex.cjs"
mkdir -p "$TMP"

# A still: <layout> <theme> <file> <quality>
still() {
  node "$SRC/render.cjs" "$1" "$2" still 0 "$TMP/$3.png"
  magick "$TMP/$3.png" -quality "$4" -define webp:method=6 "$OUT/$3.webp"
}
# A loop: <layout> <theme> <file> <frames> <fps> <quality>
loop() {
  rm -rf "$TMP/$3" && node "$SRC/render.cjs" "$1" "$2" anim "$4" "$TMP/$3"
  ffmpeg -y -loglevel error -framerate "$5" -i "$TMP/$3/f%04d.png" -c:v libwebp_anim -lossless 0 \
    -quality "$6" -compression_level 6 -loop 0 "$OUT/$3.webp"
}

for t in dark light; do
  still hero "$t" "hero-$t" 88
  still hero-phone "$t" "hero-$t-phone" 84
  still numbers "$t" "numbers-$t" 90
  still numbers-phone "$t" "numbers-$t-phone" 88
  # The runway is the real salary slider, dragged one step at a time: 48 frames, a 6 s loop.
  loop runway "$t" "runway-$t" 48 8 76
  loop runway-phone "$t" "runway-$t-phone" 48 8 74
  for p in home import insights privacy; do
    still "$p" "$t" "$p-$t" 88
    still "$p-phone" "$t" "$p-$t-phone" 86
  done
done
# The social preview (Settings, Social preview on GitHub), 1280 x 640, dark.
node "$SRC/render.cjs" social dark still 0 "$OUT/social.png"
magick "$OUT/social.png" -strip -define png:compression-level=9 "$OUT/social.png"
du -sh "$OUT"/*.webp | sort -h | tail -5
echo "docs/readme: $(du -ch "$OUT"/*.webp | tail -1 | cut -f1)"
