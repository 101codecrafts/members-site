# CLAUDE.md

@AGENTS.md

## Claude Code specifics
- Hooks in `.claude/settings.json` enforce the hard rules mechanically:
  - `SessionStart` → `.claude/hooks/session-start.sh`: prints branch, base, dirty files and the rules digest.
  - `PreToolUse` (Edit|Write|MultiEdit) → `.claude/hooks/pre-tool-use.sh`: blocks edits to `js/ai-mascot.js`,
    generated root `*.html` (edit `src/`), `.env*` files and the `sw.js` VERSION line (exit 2 = blocked, reason on stderr).
  - `PostToolUse` (Edit|Write|MultiEdit) → `.claude/hooks/post-tool-use.sh`: `node --check` on edited JS, JSON parse
    on edited JSON, reminder to run the build when `src/` or `css/` changed.
  - `Stop` → `.claude/hooks/stop.sh`: runs `tools/agent-check.sh`; a failure (exit 2) sends Claude back to fix it.
- Subagents: `.claude/agents/planner.md`, `researcher.md`, `builder.md`, `reviewer.md`. Planner, researcher and
  reviewer are read-only.
- Learnings worth keeping go in `.claude/MEMORY.md` (short, dated, no secrets, no member data).
