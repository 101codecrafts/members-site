#!/usr/bin/env bash
# PostToolUse (Edit|Write|MultiEdit): review output. Fast checks on the file just written; exit 2 feeds the error back.
input=$(cat)
path=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String((j.tool_input||{}).file_path||""))}catch(e){}})')
[ -z "$path" ] || [ ! -f "$path" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
rel="${path#"$root"/}"
case "$rel" in
  *.js|*.mjs) node --check "$path" 2>/tmp/cc-post.err || { echo "syntax error in $rel:" >&2; cat /tmp/cc-post.err >&2; exit 2; };;
  *.json) node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$path" 2>/tmp/cc-post.err || { echo "invalid JSON in $rel" >&2; cat /tmp/cc-post.err >&2; exit 2; };;
esac
case "$rel" in
  src/*|css/*|tools/build.py) echo "note: $rel changed — run python3 tools/build.py (and node tools/csp.mjs if inline scripts changed) before finishing.";;
esac
exit 0
