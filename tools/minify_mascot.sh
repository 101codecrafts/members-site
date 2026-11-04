#!/bin/sh
# js/ai-mascot.min.js is GENERATED from js/ai-mascot.js (the readable source of truth). Re-run after editing the source:
#   sh tools/minify_mascot.sh            (needs Node; uses npx terser@5)
set -e
cd "$(dirname "$0")/.."
T=${TERSER:-"npx --yes terser@5"}
$T js/ai-mascot.js -c passes=2 -m --preamble '/*! 101 AI mascot (generated from js/ai-mascot.js by tools/minify_mascot.sh; edit the source, not this file) */' -o js/ai-mascot.min.js
printf 'js/ai-mascot.min.js: %s bytes, %s gzipped\n' "$(wc -c < js/ai-mascot.min.js)" "$(gzip -9c js/ai-mascot.min.js | wc -c)"
