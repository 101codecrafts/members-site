#!/usr/bin/env bash
# r13: the one gate every agent (and human) runs before handing work back. Exit 0 = ready for review.
#   bash tools/agent-check.sh            full run, verbose
#   bash tools/agent-check.sh --quiet    used by .claude/hooks/stop.sh
# BASE (env) = commit the round branched from; guard-file checks compare against it (default: merge-base with origin/main).
set -u
cd "$(dirname "$0")/.." || exit 1
Q=0; [ "${1:-}" = "--quiet" ] && Q=1
fail=0
say() { [ $Q = 1 ] || echo "$@"; }
step() { say "== $1"; }
bad() { echo "FAIL: $1"; fail=1; }

BASE="${BASE:-$(git merge-base HEAD origin/main 2>/dev/null || git rev-list --max-parents=0 HEAD | tail -1)}"

step "1. JS parses (js/*.js, sw.js, tools/*.mjs, tests/*.mjs)"
for f in js/*.js sw.js tools/*.mjs tests/*.mjs; do [ -f "$f" ] || continue; node --check "$f" 2>/dev/null || bad "syntax: $f"; done

step "2. JSON parses (src/data, i18n, vercel.json, manifest, .claude/settings.json)"
for f in src/data/*.json i18n/*.json vercel.json manifest.webmanifest .claude/settings.json; do
  [ -f "$f" ] || continue; node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$f" 2>/dev/null || bad "json: $f"; done

step "3. build is idempotent (generated pages match src/)"
snap() { { git diff -- '*.html' css js; git ls-files -o --exclude-standard -- '*.html' css js; } | sha1sum; }
before=$(snap)
python3 tools/build.py > /tmp/agent-check-build.out 2>&1 || bad "tools/build.py failed (see /tmp/agent-check-build.out)"
after=$(snap)
[ "$before" = "$after" ] || bad "build changed files: run python3 tools/build.py and include the output in the commit"

step "4. strict CSP up to date"
node tools/csp.mjs --check > /tmp/agent-check-csp.out 2>&1 || bad "CSP stale: run node tools/csp.mjs"

step "5. guard files unchanged vs base ($BASE)"
git diff --quiet "$BASE" -- js/ai-mascot.js 2>/dev/null || bad "js/ai-mascot.js differs from base (must not be edited)"
if ! git diff --quiet "$BASE" -- sw.js 2>/dev/null; then
  a=$(git show "$BASE:sw.js" 2>/dev/null | grep -oE 'VERSION *= *"[^"]+"' | head -1); b=$(grep -oE 'VERSION *= *"[^"]+"' sw.js | head -1)
  [ "$a" = "$b" ] || bad "sw.js VERSION changed ($a -> $b): only the integrator bumps it"
fi
git ls-files | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$' && bad ".env file tracked"

step "6. no secrets in the diff vs base"
if git diff "$BASE" --unified=0 -- . ':!*.lock' ':!package-lock.json' 2>/dev/null | grep -E '^\+' | grep -qE '(sk_live_|sk_test_[A-Za-z0-9]{20,}|FLWSECK-|FLWSECK_TEST-[A-Za-z0-9]{10,}|re_[A-Za-z0-9]{24,}|sk-or-v1-[a-f0-9]{20,}|eyJhbGciOiJIUzI1Ni[A-Za-z0-9._-]{60,}|AKIA[0-9A-Z]{16})'; then
  bad "a key-shaped string was added (check the diff; never commit secrets)"; fi

step "7. unit tests"
if [ $Q = 1 ]; then node --test tests/*.test.mjs > /tmp/agent-check-tests.out 2>&1 || bad "node --test failed (see /tmp/agent-check-tests.out)"
else node --test tests/*.test.mjs 2>&1 | grep -E '^# (tests|pass|fail|todo|skipped)'; [ "${PIPESTATUS[0]}" = 0 ] || bad "node --test failed"; fi

[ $fail = 0 ] && say "agent-check: OK" || echo "agent-check: FAILED"
exit $fail
