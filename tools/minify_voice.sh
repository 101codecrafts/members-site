#!/bin/sh
# js/ai-voice.min.js and js/ai-voice-ui.min.js are GENERATED from js/ai-voice.js and js/ai-voice-ui.js (the readable sources of truth).
# Re-run after editing a source:   sh tools/minify_voice.sh      (needs Node; uses npx terser@5)
set -e
cd "$(dirname "$0")/.."
T=${TERSER:-"npx --yes terser@5"}
for f in ai-voice ai-voice-ui; do
  $T js/$f.js -c passes=2 -m --preamble "/*! 101 AI voice (generated from js/$f.js by tools/minify_voice.sh; edit the source, not this file) */" -o js/$f.min.js
  printf 'js/%s.min.js: %s bytes, %s gzipped\n' "$f" "$(wc -c < js/$f.min.js)" "$(gzip -9c js/$f.min.js | wc -c)"
done
