#!/usr/bin/env bash
# PreToolUse (Edit|Write|MultiEdit): check scope before action. Exit 2 blocks the tool call; stderr goes to Claude.
input=$(cat)
path=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String((j.tool_input||{}).file_path||""))}catch(e){}})')
[ -z "$path" ] && exit 0
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"
rel="${path#"$root"/}"
block() { echo "BLOCKED by .claude/hooks/pre-tool-use.sh: $1" >&2; exit 2; }
case "$rel" in
  js/ai-mascot.js) block "js/ai-mascot.js must not be edited (founder rule).";;
  .env|.env.*|*/.env|*/.env.*) block "never write env files; secrets live in Vercel/vault, not the repo.";;
esac
# generated pages: root-level *.html is written by tools/build.py from src/<page>.html
if [[ "$rel" =~ ^[^/]+\.html$ ]] && [ -f "$root/src/$rel" ]; then block "$rel is generated. Edit src/$rel, then run python3 tools/build.py."; fi
# sw.js: the VERSION constant is bumped only by the integrator
if [ "$rel" = "sw.js" ]; then
  new=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const t=JSON.parse(s).tool_input||{};process.stdout.write(String(t.new_string??t.content??""))}catch(e){}})')
  cur=$(grep -oE 'VERSION *= *"[^"]+"' "$root/sw.js" | head -1)
  nxt=$(printf '%s' "$new" | grep -oE 'VERSION *= *"[^"]+"' | head -1)
  if [ -n "$nxt" ] && [ "$nxt" != "$cur" ]; then block "do not bump the sw.js VERSION ($cur); the integrator does it."; fi
fi
exit 0
