# Notes for AI agents and contributors

## Design
Before generating or modifying any UI, read `DESIGN.md` (repo root). Use its colour roles, type scale, spacing scale,
grid (4/8/12 columns, margins 16/24/32, gutters 16/24/24) and component definitions exactly; do not introduce values that
are not in DESIGN.md / `tokens/tokens.json`. New live rules are scoped `html:not(.static)` (`?static=1` is the pixel
mockup and must not change). After editing CSS/HTML run:

    python3 tools/build.py && node tools/csp.mjs && node tools/ds/lint.mjs && node --test tests/

`tools/ds/lint.mjs` is a ratchet: raw hex colours and off-grid px spacing per stylesheet may only go down
(`node tools/ds/lint.mjs --update` after a deliberate clean-up). Optional spec check: `npx @google/design.md lint DESIGN.md`.
