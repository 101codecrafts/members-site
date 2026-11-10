---
version: alpha
name: 101 Codecrafts — Brutalist Learning OS
description: >-
  Design system of the 101 Codecrafts members site (learn, build, sell, compete). Brutalist and honest: navy ink,
  hard 2px borders, hard offset shadows with no blur, zero radius, bold display type; flexible ("liberal") in layout.
  Tokens below are the normative values; tokens/tokens.json is the machine source, css/tokens.css + css/theme.css +
  css/ds.css apply them. Light values listed; dark values are in the Colors section.
colors:
  primary: "#0B1236"          # brand navy: text, borders, inverse fills, shadows
  secondary: "#fc8c0c"        # brand orange: CTA fills, accent bars (never text on light)
  tertiary: "#05e6f2"         # brand cyan: secondary accent fills, chips on navy
  neutral: "#F3F5F8"          # page background
  text: "#0B1236"
  text-muted: "#4A5578"
  bg: "#F3F5F8"
  surface-1: "#FFFFFF"
  surface-2: "#F3F5F8"
  surface-3: "#E8ECF2"
  border-subtle: "#D5DBE5"
  border-strong: "#0B1236"
  border-control: "#0B1236"
  fill-inverse: "#0B1236"
  on-inverse: "#FFFFFF"
  accent: "#fc8c0c"
  on-accent: "#0B1236"
  accent-text: "#B45309"
  accent-2: "#05e6f2"
  on-accent-2: "#0B1236"
  accent-2-text: "#00758A"
  link: "#146c9f"
  focus: "#00758A"
  shadow-ink: "#0B1236"
  danger-text: "#B42318"
  danger-solid: "#B42318"
  danger-subtle: "#FDECEA"
  success-text: "#0F7A45"
  success-solid: "#0F7A45"
  success-subtle: "#E9F7EE"
typography:
  display:
    fontFamily: Archivo Black
    fontSize: 2.6875rem       # step-6, fluid to 4.1875rem (43 -> 67px)
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Archivo Black
    fontSize: 2.25rem         # step-5 (36 -> 54px), h1
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Archivo Black
    fontSize: 1.875rem        # step-4 (30 -> 43px), h2 / page titles
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: -0.01em
  title-lg:
    fontFamily: IBM Plex Sans
    fontSize: 1.3125rem       # step-2 (21 -> 27px), h3
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: -0.005em
  title-md:
    fontFamily: IBM Plex Sans
    fontSize: 1.125rem        # step-1 (18 -> 22px), h4, card titles, lead text
    fontWeight: 700
    lineHeight: 1.45
  body-md:
    fontFamily: IBM Plex Sans
    fontSize: 1rem            # step-0 (16 -> 18px), body and ALL form controls
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: IBM Plex Sans
    fontSize: 0.875rem        # step--1 (14 -> 15px)
    fontWeight: 400
    lineHeight: 1.45
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem        # step--1, nav, buttons in mono contexts
    fontWeight: 600
    lineHeight: 1.45
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem         # step--2 (12 -> 13px): eyebrows, chips, badges, table heads — the floor
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.08em
  stat:
    fontFamily: JetBrains Mono
    fontSize: 1.5625rem       # step-3+ ; tabular-nums slashed-zero
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.02em
  code:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.6
rounded:
  none: 0px
  full: 9999px                # avatars and status dots only
spacing:
  base: 4px
  "0": 0px
  "1": 4px
  "2": 8px
  "3": 12px
  "4": 16px
  "5": 20px
  "6": 24px
  "8": 32px
  "10": 40px
  "12": 48px
  "16": 64px
  "20": 80px
  "24": 96px
  margin-compact: 16px
  margin-medium: 24px
  margin-expanded: 32px
  gutter-compact: 16px
  gutter-medium: 24px
  gutter-expanded: 24px
  columns-compact: 4
  columns-medium: 8
  columns-expanded: 12
  container-app: 1480px
  container-content: 1200px
  container-prose: 45rem
  card-min-sm: 192px
  card-min-md: 256px
  card-min-lg: 320px
  touch-target: 44px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    height: 44px
    padding: 16px
  button-primary-hover:
    backgroundColor: "{colors.accent}"
  button-secondary:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    height: 44px
    padding: 16px
  button-inverse:
    backgroundColor: "{colors.fill-inverse}"
    textColor: "{colors.on-inverse}"
    rounded: "{rounded.none}"
    height: 44px
    padding: 16px
  button-lg:
    height: 48px
    padding: 24px
  input-field:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    height: 44px
    padding: 12px
  chip:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
    height: 44px
    padding: 12px
  chip-selected:
    backgroundColor: "{colors.fill-inverse}"
    textColor: "{colors.on-inverse}"
  card:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: 16px
  card-expanded:
    padding: 24px
  card-inverse:
    backgroundColor: "{colors.fill-inverse}"
    textColor: "{colors.on-inverse}"
  card-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  badge:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.none}"
    padding: 4px
  empty-state:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-muted}"
    padding: 24px
---

# 101 Codecrafts design system

> **For AI agents and developers — read this before you write UI.** Use only the tokens in this file (CSS custom
> properties in `css/tokens.css`, `css/theme.css`, `css/ds.css`). Do not introduce a colour, size, spacing, radius,
> shadow or duration that is not here. If you need a new one, add it to `tokens/tokens.json` (+ `python3 tools/tokens.py`)
> and to this file in the same commit. After any CSS/HTML edit run `python3 tools/build.py`, `node tools/csp.mjs`,
> `node tools/ds/lint.mjs` (ratchet: raw hex and off-grid px may only go down) and `node --test tests/`.
> `?static=1` is the pixel-matched mockup: every new rule is scoped `html:not(.static)` and must leave it at 0 px.

## Overview

101 is a learning-and-building home for young African developers (Uganda first): courses, practice, projects, events, a
marketplace. The visual language is **brutalist but liberal**: the anchor is honest, raw structure — navy ink, 2 px
borders, hard offset shadows, square corners, heavy display type, mono labels — and inside that frame layouts, grids,
rhythm and components may change whenever it clearly helps reading or conversion. It should feel like a well-made
workbench: bold, direct, nothing decorative that does not carry meaning (Rams: honest, understandable, "less, but
better"). Never fake: fresh accounts show zeros, no invented stats, testimonials, logos or bios; content is real or hidden.

Principles (from the round-13 study, see work/round13/design-system/STUDY.md):
1. **One base unit.** Every spacing, size and offset is a multiple of 4 px; layout rhythm moves in 8 px steps.
2. **Proximity = relationship.** Related things sit closer (4–8 px), groups further (12–16 px), sections furthest (24–40 px).
3. **Everything sits on the grid.** 4 / 8 / 12 columns with fixed gutters and margins per breakpoint.
4. **Roles, not colours.** Components paint with role tokens so light and dark both work.
5. **Depth is structure, not blur.** Elevation = a harder, longer offset shadow and a border, never a soft shadow.
6. **Scan first.** Headings, list rows and card titles start with information-carrying words on the left edge.

## Colors

Brand primitives: **navy** `#0B1236` (ink), **orange** `#fc8c0c` (fill), **cyan** `#05e6f2` (fill). Orange and cyan are
FILLS: as text on light surfaces use `--accent-text` / `--accent-2-text`. (Open founder decision: the brand note says
orange `#F5A21B`; the code uses `#fc8c0c`, and loaders/loop art still carry `#FFA615` / `#2BE0DA` — not changed here.)

| Role (CSS var) | Light | Dark | Use |
|---|---|---|---|
| `--text` | #0B1236 | #EEF1F8 | primary text (17.6:1 on white) |
| `--text-muted` | #4A5578 | #AEB8CE | secondary text, meta (7.3:1 on white) |
| `--bg` | #F3F5F8 | #0A0D17 | page background |
| `--surface-1` | #FFFFFF | #121828 | cards, panels, inputs |
| `--surface-2` | #F3F5F8 | #192034 | wells, hovers, empty states |
| `--surface-3` | #E8ECF2 | #222B42 | chips, inactive tabs, date blocks |
| `--border-subtle` | #D5DBE5 | #283149 | hairline dividers inside a card (decorative) |
| `--border-strong` | #0B1236 | #4A557A | the brutal 2 px outline |
| `--border-control` | #0B1236 | #6B77A0 | input/select/textarea boundary (≥3:1) |
| `--fill-inverse` / `--on-inverse` | #0B1236 / #FFF | #151E4C / #FFF | navy blocks, banners, inverse buttons |
| `--accent` / `--on-accent` | #fc8c0c / #0B1236 | same | primary CTA fill, accent bars |
| `--accent-text` | #B45309 | #FFAD5C | orange as text (5.0:1) |
| `--accent-2` / `--on-accent-2` | #05e6f2 / #0B1236 | same | secondary accent fill |
| `--accent-2-text` | #00758A | #5FE3F0 | cyan as text (5.4:1) |
| `--link` | #146c9f | #7CC4FF | inline links (underlined) |
| `--focus` | #00758A | #5FE3F0 | 3 px focus ring, 2 px offset |
| `--shadow-ink` | #0B1236 | #02040A | colour of every hard shadow |
| `--danger-text/-solid/-subtle` | #B42318 / #B42318 / #FDECEA | #FF9C94 / #B42318 / #3A1D24 | errors |
| `--success-text/-solid/-subtle` | #0F7A45 / #0F7A45 / #E9F7EE | #6EE7A8 / #0F7A45 / #12301F | success |

Rules: text pairs ≥ 4.5:1, large text and UI boundaries ≥ 3:1 (WCAG 2.2 AA). One accent fill per view for the primary
action. Status is never colour alone (icon or word too). **Legacy names** (`--ink --mut --line --bg --surface --hairline
--color-muted --color-line --color-page* --color-surface* --color-orange-text* --color-cyan-text --accent-ink
--accent-2-ink --navy`) are aliases of these roles on the live site (`css/ds.css`); do not use them in new CSS.
Component-local tokens (`--ck-*` cards, `--sh-*`/`--sb-*` app shell, `--ccl-*` loaders, `--lp-*` loop art, `--ab-*` about)
must be defined from roles, never from raw hex.

## Typography

Three faces, self-hosted woff2 (OFL, latin + latin-ext so Luganda ŋ works), `font-display:swap`, metric-matched fallbacks:
**Archivo Black** (`--font-display`/`--disp`: hero, h1, h2, uppercase section heads) · **IBM Plex Sans** (`--font-sans`/
`--body`: body, UI, forms, h3/h4, card titles) · **JetBrains Mono** (`--font-mono`/`--cond`: labels, eyebrows, chips,
badges, nav, table heads, stats, prices, code). Russo One is the logo wordmark only.

Fluid scale (Utopia, 360 → 1536 px, base 16 → 18): `--step--2` 12→13 (floor; meta, badges) · `--step--1` 14→15 (small UI,
nav, buttons) · `--step-0` 16→18 (body and **every form control**) · `--step-1` 18→22 (card titles, lead) · `--step-2`
21→27 (h3) · `--step-3` 25→34 (section heads) · `--step-4` 30→43 (page titles) · `--step-5`/`--step-6` 36→54 / 43→67
(hero only). Line height unitless (`--leading-N`: display 1–1.1, body 1.55, small 1.4–1.45, code 1.6). Letter-spacing in em
(`--tracking-display` −0.01em, `--tracking-label` +0.08em uppercase mono, `--tracking-chip` +0.06em, `--tracking-stat`
−0.02em). Numbers that count or align: mono + `tabular-nums slashed-zero`. Running text ≤ `--measure-body` (50ch ≈ 67
characters; open founder question vs the older 68ch). Never `font-size: Npx` in new CSS; nothing under 12 px; role classes
`.t-display .t-h1 .t-h2 .t-h3 .t-h4 .t-body-lg .t-body .t-small .t-label .t-code .t-stat .t-price .t-measure`.
Type spacing: heading → its text `--s-2`/`--s-3`; paragraph → paragraph `--s-3`; section head → content `--s-3`.

## Layout

### Spacing scale (4-pt base, 8-pt rhythm)
`--s-N` = N × 4 px, exactly (live site): `--s-1` 4 · `--s-2` 8 · `--s-3` 12 · `--s-4` 16 · `--s-5` 20 · `--s-6` 24 ·
`--s-8` 32 · `--s-10` 40 · `--s-12` 48 · `--s-16` 64 · `--s-20` 80 · `--s-24` 96. (`--space-N` in tokens.css are the same
numbers; `--space-fluid-*` are reserved for type-coupled gaps.) Use the **semantic** tokens in components:

| Token | compact <761 | medium 761–1099 | expanded ≥1100 | Use |
|---|---|---|---|---|
| `--page-pad` | 16 | 24 | 32 | outer page margin |
| `--gutter` (= `--gap-card`) | 16 | 24 | 24 | between columns and cards |
| `--gap-sec` (= `--gap-section`) | 24 | 32 | 40 | between page sections |
| `--pad-card` | 16 | 16 | 24 | inside cards and panels |
| `--gap-stack` | 8 | 8 | 8 | between lines inside a card |
| `--gap-ctl` | 8 | 8 | 8 | between buttons/chips in a row |
| `--tap` | 44 | 44 | 44 | minimum target size |

Rhythm inside a component: 4 inside a label group · 8 between lines · 12 between a heading and its body · 16 between
blocks. Between sections always more than inside them.

### Grid
| Breakpoint (token) | Width | Columns `--cols` | Margin | Gutter | Container |
|---|---|---|---|---|---|
| compact (`--bp-compact`) | 0–760 | 4 | 16 | 16 | fluid |
| medium (`--bp-medium`) | 761–1099 | 8 | 24 | 24 | fluid |
| expanded (`--bp-expanded`) | ≥1100 | 12 | 32 | 24 | app 1480 · content 1200 · prose 45rem |
| wide (`--bp-wide`) | ≥1440 | 12 | 32 | 24 | same caps, centred |

Component breakpoints that stay: app-shell rail/drawer at 1024, landing canvas at 1024. Media queries cannot read custom
properties: write the px value and name the token in a comment (`@media (min-width:1100px){ /* expanded */ }`).
Primitives (`css/ds.css`): `.ds-container` (+`--app`, `--prose`) · `.ds-grid` with `.ds-span-3…12` (expanded) and
`.ds-span-m-4/8` (medium); children are full width on compact · `.ds-auto` card grid (min `--grid-card-min-md` 256; `--sm`
192, `--lg` 320) · `.ds-stack` (+`--section`) · `.ds-cluster` · `.ds-split` (two halves ≥761) · `.ds-sidebar` (main + 300–380
rail ≥1100; `--start` puts a 16rem side first).

### Layout type per page (choose by the job of the page)
| Page(s) | Layout type | Why |
|---|---|---|
| Landing `index` | Z-shape hero → zig-zag feature rows → card block → CTA band (structure owned by r13-landing) | marketing scan is image↔text (NN/g zigzag/lawn-mower); one CTA per row |
| About | Z-shape story rows + card block for real facts | narrative, alternating media/text; no invented team/stats |
| Pricing | Card/block (plan cards, equal height, 1/2/4 columns) + comparison table | side-by-side comparison; table rows scanned F-wise, so row labels lead |
| Auth / sign-up / onboarding | Split screen (form + context panel), form single column | one task; the side panel explains, never competes |
| Dashboard | Asymmetric two-column (main 2/3 + rail 1/3) on the 12-col grid, KPI row first | modular grid for data; most important number top-left (F) |
| Courses, Learn, Resources, Projects, Marketplace, Launchpad | Card/block grid (`.ds-auto`, filters row above) | lawn-mower scan of equal cells; consistent card anatomy |
| News, Opportunities, Events, Announcements | Magazine / list with left-aligned headlines (layer-cake) | text-first scanning; badge above headline so every title starts on one edge |
| Course detail, Product item, Problem, Event detail | Featured media + sidebar (`.ds-sidebar`: content + buy/action rail) | media and the decision box visible together |
| Practice / IDE / Interview | Split screen (statement · editor), interactive | two panes used together |
| Settings, Profile, Seller, Tutor tools | Sidebar layout (section nav + single-column forms) | long forms in one column; nav fixed |
| Legal, Article, Docs | Single column prose (`.ds-container--prose`) with layer-cake headings | reading |
| App shell (all signed-in pages) | Fixed navigation (sidebar ≥1024) / hidden navigation (drawer <1024) | constant wayfinding without stealing mobile width |

## Elevation & Depth

Brutalist depth: **no blur, no soft shadows, no radius**. Elevation = border + hard offset shadow in `--shadow-ink`
(flips per theme). `--elev-0` none (flat rows, list items, inputs) · `--elev-1` 2 px (pressed state, small chips) ·
`--elev-2` 4 px (resting cards, panels, buttons on hover; `--shadow-brutal-sm`, `--ck-sh`) · `--elev-3` 8 px (hover-lifted
cards, menus, popovers, dialogs) · `--elev-accent` 4 px in orange (one featured item per view). A lift moves the element
up-left by the same amount its shadow grows (−3 px / +3 px on cards). Dark mode: same offsets, darker ink; surfaces step up
`--surface-1 → -3` instead of getting lighter shadows. Z-index scale: `--z-raised` 2 · `--z-sticky` 100 · `--z-header`
200 · `--z-drawer` 900 · `--z-overlay` 1000 · `--z-toast` 1100 · `--z-skip` 9999.

## Shapes

Square: `--radius` 0 on every card, button, input, chip, badge, modal and image. `9999px` only for avatars and status
dots. Borders: `--bw-base` 2 px (everything structural, in `--border-strong`), `--bw-hair` 1 px (dividers inside a card, in
`--border-subtle`), `--bw-focus` 3 px (focus ring, `--focus`, 2 px offset). Dashed 2 px = empty/placeholder state only.

## Components

Every interactive element is ≥ 44 × 44 px, has a visible 3 px `--focus` ring, a hover state only on hover-capable pointers,
and a pressed state (pushes into its shadow).
- **Buttons** `.btn` — 44 px high, 16 px side padding, 8 px icon gap, label `--step--1` 700. Variants: default (surface +
  navy border) · `.or` primary (accent fill, one per view) · `.ink` inverse · `.cy` secondary accent · `.ok` / `.no`
  status · `.lg` 48 px, 24 px padding · `.sm` keeps 44 px tall, 12 px padding. Hover: −2 px lift + `--elev-2`.
- **Fields** `.field` — label above (`--step--2` 700), 8 px to the control; control 44 px, 12 px side padding, 2 px
  `--border-control`, `--step-0` text; error text `--danger-text` under the control with an icon; never placeholder-as-label.
- **Chips / filters** `.chip` — 44 px, 12 px padding, mono label; selected = `--fill-inverse` + `aria-pressed`. A filter row is
  one line: wraps on 8 px on desktop, scrolls with snap on phones; section switches are a segmented bar.
- **Cards** `.ck` (card kit, `css/cards.css`; `.card` legacy) — surface-1, 2 px border, `--pad-card`, `--elev-2`; anatomy
  media → eyebrow → title (one stretched link) → meta → body (3 lines) → footer pinned to bottom; variants `--inv`,
  `--accent`, `--stat`, `--compact`, `--media`; states hover-lift, pressed, selected, disabled, skeleton, empty, error.
- **Section head** `.sec-title` — accent bar + display h2, 12 px to content, "View all" link right (44 px target).
- **Page head** `.page-h` — eyebrow, h1 (`--step-4`), one-line lead, actions right; actions wrap below on compact.
- **Empty state** — dashed 2 px panel, `--surface-2`, 24 px padding, what it is + one next action. Fresh accounts show zeros.
- **Badges / tags** — mono `--step--2`, 4–8 px padding, accent or surface-3 fill, 2 px border.
- **Tables** — mono uppercase heads, 12/16 px cells, row hairlines `--border-subtle`, numbers right-aligned tabular.
- **Loaders** — hold the final height from first paint (CLS ≈ 0), show after 300 ms.
- **Sections catalogue (public pages)** — build pages from named sections, each with a positive (light) and negative
  (navy) variant: hero, feature rows, card block, stats (real only), pricing, FAQ, CTA band, footer / super-footer.

## Motion

Durations `--dur-instant` 100 · `--dur-fast` 150 (hover, press) · `--dur-base` 200 (menus, drawers) · `--dur-slow` 300
(page-level reveals) · `--dur-loop` 600 (loaders). Easing `--ease-standard` cubic-bezier(.2,0,0,1) for UI,
`--ease-emphasized` (.2,.8,.2,1) for lifts, `--ease-exit` (.4,0,1,1) for leaving. Motion is mechanical (translate, not
fade/scale/blur) and always respects `prefers-reduced-motion` (no entrance animation, no smooth scroll on app pages).
Moving strips have Pause/Play.

## Do's and Don'ts

- Do take every value from a token; do add the token first if it is truly new.
- Do keep related items closer than unrelated ones; sections always get the largest gap.
- Do align to the grid and the page margin; card grids use `--gutter`.
- Do use one primary (orange) action per view and put the most important information top-left.
- Do scope every live rule `html:not(.static)` and re-check `?static=1` = 0 px.
- Don't write raw hex, `font-size: Npx`, or off-grid px (6, 10, 14, 18…) in new CSS — `tools/ds/lint.mjs` fails the build.
- Don't round corners, blur shadows or use gradients for depth.
- Don't put orange or cyan text on light surfaces (use `--accent-text`, `--accent-2-text`).
- Don't copy another site's colours, copy or assets; don't invent stats, testimonials, logos or bios.
- Don't edit generated files (`css/bundle-*.css`, `css/tokens.css`, `css/theme-dark.css`, built `*.html`) by hand.
