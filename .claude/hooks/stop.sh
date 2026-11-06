#!/usr/bin/env bash
# Stop: clean exit. Claude may only finish when the repo passes the agent check; exit 2 sends it back to fix.
input=$(cat)
# avoid an endless loop: if this stop was already triggered by a stop hook, let it end
printf '%s' "$input" | grep -q '"stop_hook_active":\s*true' && exit 0
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0
if ! bash tools/agent-check.sh --quiet > /tmp/cc-agent-check.out 2>&1; then
  echo "tools/agent-check.sh failed — fix before finishing:" >&2
  tail -n 40 /tmp/cc-agent-check.out >&2
  exit 2
fi
exit 0
