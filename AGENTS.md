# AGENTS.md — how coding agents work on the 101 Codecrafts members site

One file every coding agent reads first (Claude Code reads it through `CLAUDE.md`; Codex, Cursor, Aider and others
read `AGENTS.md` directly — https://agents.md). Short on purpose: rules, commands, definition of done.

## What this repo is
- Static front end: `src/*.html` + `css/` + `js/` → `python3 tools/build.py` writes the root `*.html` pages
  (shared topbar/sidebar, per-role nav, bundles). **Edit `src/`, never the generated root pages.**
- Backend lives on the `integrate/round*-api` / `r*/…-api` branches of the same GitHub repo (`backend/` Next.js
  route handlers, `supabase/migrations`). Architecture: `ARCHITECTURE.md`.
- Roles: visitor, guest, learner, tutor, admin, root_admin. Policy: `src/data/access-policy.json` → `js/access.js`.

## Product rules (founder, non-negotiable)
1. Guests browse, take free external courses and buy — nothing that is for learners, tutors or admins.
2. Admin approves all user content before it is public.
3. A fresh account shows zeros and empty states. **No demo data, no invented stats, testimonials, logos,
   socials or bios** — real data or hidden. Seeded `js/data.js` only in `?static=1` or an admin's `?demo=1`.
4. Brand: brutalist 101 — navy `#0B1236`, Archivo Black / IBM Plex Sans / JetBrains Mono, hard borders,
   offset shadows. Flexible layouts are fine; never copy another site's colours, copy or assets.
5. Accessibility stays: axe 0 violations, skip link first, focus ring `#00758A`, CLS ≈ 0.
6. `?static=1` (design mockup mode) must stay pixel-identical (0 px diff) unless the task is a static redesign.

## Hard "do not"
- Do not edit `js/ai-mascot.js`.
- Do not bump the service worker `VERSION` in `sw.js` (the integrator does).
- Do not merge to `main`, alias/promote a deployment, change env vars, domains, protection or billing.
- Do not apply migrations to staging/production; write them only (`supabase/migrations/<ts>_<name>.sql`, idempotent).
- Never print or commit secrets (`.env*`, tokens, bypass secrets). Never put real member data in fixtures.

## Commands
| What | Command |
|---|---|
| Build pages after any `src/`, `css/` or nav change | `python3 tools/build.py` |
| Strict CSP hashes (after any inline script change) | `node tools/csp.mjs` (check only: `--check`) |
| Unit tests | `node --test tests/*.test.mjs` |
| Everything an agent must pass before handing back | `bash tools/agent-check.sh` |
| Static mockup diff vs base | `tools/staticcmp` from the round's integrate tools (Chromium lock) |

## Workflow (the agent team, see `.claude/agents/`)
1. **planner** turns the request into a numbered plan with files, risks and tests. No edits.
2. **researcher** (optional) gathers evidence: repo search, official docs, live pages; cites URLs.
3. **builder** implements one plan step at a time, smallest diff, tests with the change.
4. **reviewer** reads the diff against these rules and the plan; blocks on rule breaks, fake data, a11y loss,
   missing tests. Read-only.
5. The main session is the **router**: picks the next agent, merges findings, writes the report.

## Definition of done
- `bash tools/agent-check.sh` exits 0 (build idempotent, CSP up to date, JS parses, tests pass, guard files untouched).
- New behaviour has a test in `tests/` (node:test, no network).
- Findings go to the round's BUS board as `R<round>-<area>-N`; the REPORT lists commits, files, tests, open questions.
- Commit as `bd197412-maker`; branch `r<round>/<area>`; previews only.

## Design (r13/design-system)
Before generating or modifying any UI, read `DESIGN.md` (repo root). Use its colour roles, type scale, spacing scale,
grid (4/8/12 columns, margins 16/24/32, gutters 16/24/24) and component definitions exactly; do not introduce values that
are not in DESIGN.md / `tokens/tokens.json`. New live rules are scoped `html:not(.static)` (`?static=1` is the pixel
mockup and must not change). After editing CSS/HTML run:

    python3 tools/build.py && node tools/csp.mjs && node tools/ds/lint.mjs && node --test tests/

`tools/ds/lint.mjs` is a ratchet: raw hex colours and off-grid px spacing per stylesheet may only go down
(`node tools/ds/lint.mjs --update` after a deliberate clean-up). Optional spec check: `npx @google/design.md lint DESIGN.md`.
