#!/bin/sh
# js/loaders.min.js is GENERATED from js/loaders.js (the readable source of truth). Re-run after editing the source:
#   sh tools/minify_loaders.sh            (needs Node; uses npx terser@5)
set -e
cd "$(dirname "$0")/.."
T=${TERSER:-"npx --yes terser@5"}
$T js/loaders.js -c passes=2 -m --preamble '/*! 101 loaders, shape loops after Scenario Motion Loops (generated from js/loaders.js by tools/minify_loaders.sh; edit the source) */' -o js/loaders.min.js
printf 'js/loaders.min.js: %s bytes, %s gzipped\ncss/loaders.css: %s bytes, %s gzipped\n' "$(wc -c < js/loaders.min.js)" "$(gzip -9c js/loaders.min.js | wc -c)" "$(wc -c < css/loaders.css)" "$(gzip -9c css/loaders.css | wc -c)"
