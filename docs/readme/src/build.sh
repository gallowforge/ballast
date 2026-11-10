#!/usr/bin/env bash
# Rebuilds every README image from fresh captures of the real app, in the dark theme and the light one.
#
#   npm run readme:visuals                 # capture the live app with its demo data, then render
#   npm run readme:visuals -- --render     # render again from the last captures
#   ORIGIN=http://localhost:4173 npm run readme:visuals   # capture a local build instead
#   ONLY="hero runway" npm run readme:visuals -- --render  # just these images
#
# The hero is a loop: 8 seconds at 12 frames a second in which the real salary slider is dragged on
# the phone in front (capture.mjs, the hero frames). Its glass holds still, so only the phone's
# screen is paid for in bytes and the text stays as sharp as in a still.
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

# ONLY names the images to build (hero, numbers, runway, home, import, insights, privacy, social).
want() { [[ -z ${ONLY:-} || " $ONLY " == *" ${1%-phone} "* ]]; }
# A still: <layout> <theme> <file> <quality>
still() {
  want "$1" || return 0
  node "$SRC/render.cjs" "$1" "$2" still 0 "$TMP/$3.png"
  magick "$TMP/$3.png" -quality "$4" -define webp:method=6 "$OUT/$3.webp"
}
# A loop: <layout> <theme> <file> <frames> <fps> <quality>
loop() {
  want "$1" || return 0
  rm -rf "$TMP/$3" && node "$SRC/render.cjs" "$1" "$2" anim "$4" "$TMP/$3"
  ffmpeg -y -loglevel error -framerate "$5" -i "$TMP/$3/f%04d.png" -c:v libwebp_anim -lossless 0 \
    -quality "$6" -compression_level 6 -loop 0 "$OUT/$3.webp"
}
# The hero loop: <layout> <theme> <file> <frames> <fps> <quality>. Most of each frame is the frame
# before it, so encode.cjs sends the first frame whole and then only what changes.
held() {
  want "$1" || return 0
  rm -rf "$TMP/$3" && node "$SRC/render.cjs" "$1" "$2" anim "$4" "$TMP/$3"
  node "$SRC/encode.cjs" "$TMP/$3" "$5" "$6" "$OUT/$3.webp"
}

for t in dark light; do
  # The hero: 96 frames, an 8 s loop. layouts.js (HERO_FRAMES) plays the slider frames across it.
  held hero "$t" "hero-$t" 96 12 88
  held hero-phone "$t" "hero-$t-phone" 96 12 84
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
if want social; then
  node "$SRC/render.cjs" social dark still 0 "$OUT/social.png"
  magick "$OUT/social.png" -strip -define png:compression-level=9 "$OUT/social.png"
fi
du -sh "$OUT"/*.webp | sort -h | tail -5
echo "docs/readme: $(du -ch "$OUT"/*.webp | tail -1 | cut -f1)"
