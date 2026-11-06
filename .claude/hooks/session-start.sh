#!/usr/bin/env bash
# SessionStart: load context + goals. Whatever this prints is added to the session context.
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0
echo "repo: 101 Codecrafts members site (static front end). Read AGENTS.md first."
echo "branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null)  head: $(git log --oneline -1 2>/dev/null)"
dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
echo "uncommitted files: $dirty"
echo "rules: edit src/ not root *.html | no js/ai-mascot.js | no sw.js VERSION bump | no fake data | ?static=1 stays 0 px | previews only"
[ -f .claude/MEMORY.md ] && { echo "--- .claude/MEMORY.md (last 20 lines) ---"; tail -n 20 .claude/MEMORY.md; }
exit 0
