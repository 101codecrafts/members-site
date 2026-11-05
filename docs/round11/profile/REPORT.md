# Round 11 · profile, settings and background: REPORT

Agent: r11/profile. Started 5 Nov 2026 10:45 EAT. Nothing here is live: no production, alias, env, protection or domain change was made, and no migration was applied.

## Branch heads (github.com/101codecrafts/members-site, pushed as bd197412-maker with the noreply email)
| Branch | Base | Head | What |
|---|---|---|---|
| **r11/profile** | main f33b32b | see `git log -1 r11/profile` (deployed head **5c5aee5**; later commits are QA tooling and report only) | background fix, account menu, settings, profile, share |
| **r11/profile-api** | backend 3f36f1a | **a2ed8fc** | secure, working account erasure; `GET /me/badges` |

Worktrees: `work/round11/profile` (site) and `work/round11/profile-api` (backend).

## 1. Background on every page: root cause, fixed in one place
**Why the founder saw a flat dark page** (screenshots 1005819905 offline, 1005819842/1005819841 onboarding steps):
1. **Opaque page wrappers.** On offline, onboarding and verify, `main.center` paints `linear-gradient(90deg,#eeeff1,#f3f6f7)`, mirrored in dark to a flat `--bg` gradient by theme-dark.css. On signin/signup it is `.auth-main{background:#fff}` (dark: `--surface-1`). Each one sat above `body::before` (the grid) and `#ccbg` (the glyph canvas) and covered them edge to edge. The canvas was running, just hidden underneath.
2. **An opt-out list in js/bg.js.** `NONE = terms|privacy|cookies|article|go|ide|problem|admin|interview|contest|whiteboard` turned the canvas off entirely, so /go had no glyphs.
3. **Pages outside the template.** mascot.html and voice.html don't use `{{SCRIPTS}}`, so they never loaded bg.js.
4. **The offline page is served from the service-worker cache** (cc-v20) along with the old CSS bundle. Without a version bump, returning visitors would keep the broken copy.

**Fix (one place per layer):**
- `css/bg.css`: ONE wrapper list, `:is(main.center,.auth-main,.solo-main,[data-bg-through])`, lets the layer through (`background:transparent`). The body already carries the same colour, so nothing else changes. New layouts add their class here or mark the wrapper `[data-bg-through]`. The old one-off `.solo-main` rule folded into it.
- `js/bg.js`: `NONE` became `QUIET`. Those pages now get a "quiet" canvas type (fewer, slower, fainter glyphs, marks on majors only; `bg-paint.js` TYPES.quiet) instead of none. `auth`/`join`/`guest`/`settings` were added to the page-type map.
- `tools/build.py`: injects `js/bg.js` into any built page that lacks it. bg.css already reaches every page through the THEME_LINK bundle.
- `sw.js`: **cc-v21** (and access.js and account.js are precached).
- `?static=1` and print are untouched: every rule is under `html:not(.static)`.
- **Light theme** keeps the static grid (the round-6 design decision: the glyph canvas is dark-only). See the open questions.

**Checks:** `tools/qa/bgprobe.py` runs every built page (55 plus a 404 probe) at 412 and 1440, in light and dark. It checks that body::before paints the grid, that no opaque viewport-sized layer covers it at the page edges, that the grid lines are actually visible (stddev of a bare margin strip), and that in dark mode `CC_BG.info().live` is true. `tools/qa/band.py` (round 10) runs on 19 pages at 412 and 1440 in both themes. Results are below.

## 2. Account menu (real Clerk user, never a placeholder)
Built into every page's top bar by `tools/build.py`, so it causes no layout shift. js/shell.js still owns open/close and APG keyboard, js/auth.js still fills the name, email and avatar from Clerk, and the new **js/account.js** fills what only the session knows.
- **Head card:** avatar (Clerk image or initials), real name, email, role chip, plan chip.
- **Rows:** View profile (`/u/<username>` once known, else profile.html) · Edit profile (settings.html#profile) · **Plan + Upgrade** (pricing.html, hidden for admin and root; Pro shows no Upgrade tag) · Billing & payment methods · **Payouts (tutors only**, `account.payouts`) · Settings · Help & support · **Theme** (cycles System → Light → Dark, same storage as the View settings toggle) · **Language** (shows the current one) · Switch role (existing) · **Switch account** (Clerk multi-session lists the other signed-in accounts plus "Add another account"; single-session signs out, then signs in with `?switch=1&return=`) · Sign out.
- **Visitor:** "Sign in" and "Join" only (links carry `?return=<page>`).
- The old profile page defaulted to the demo person "sarah-n". It now never renders a placeholder person.

## 3. Profile page (profile.html, /u/<username>)
- **Own profile (signed in):** a Public view / Private view toggle. Private view adds the email, phone, plan and visibility card.
- **Public profile:** `/u/<username>` or `?u=`, via `GET /api/v1/portfolio/:username`. Only active, public, adult profiles are served (existing server rule). Anything else shows "Profile not found".
- **Visitor with no handle:** a sign-in prompt.
- **Sections:** hero (avatar, @handle, name, headline, role, education level, location, joined), About plus education, Skills, Links (GitHub, LinkedIn, website), Badges, Certificates (verify links).
- **Empty states** use faint example placeholders: dashed chips like "Python, Excel…", an italic "@choose-a-username" and "e.g. Python learner · …", each with an Edit/Add link into settings.
- **Avatar upload:** Clerk `user.setProfileImage` (PNG/JPG/WebP, ≤5 MB), plus Remove. The backend mirrors the Clerk image through the existing user.updated webhook.

## 4. Advanced settings (settings.html, new; the sidebar "Settings" now points here; Connected video apps stays at settings-apps.html)
Sticky section nav: a left rail at ≥1024px, a horizontal scroller on phones. Every section deep-links by anchor.

| Section | What it does |
|---|---|
| Profile | Display name, username, headline, bio, location, education level, institution, class/year, skills (chips, ≤30), GitHub, LinkedIn, website, avatar. Saves with `PATCH /api/v1/me` (existing strict zod schema) and syncs first and last name to Clerk |
| Account | Email, phone, role, member since. "Manage email and phone" opens Clerk's secure UserProfile |
| Plan | Current plan and renewal date, link to pricing.html (hidden for staff) |
| Billing | MoMo, Airtel and card note, payment history (`GET /me/payments`), with an empty state |
| Payouts | Tutors only → tutor.html#earnings |
| Security | Password and 2FA status from Clerk (`passwordEnabled`, `twoFactorEnabled`). Change, set up and passkeys open Clerk UserProfile. **Active sessions and devices** come from `user.getSessions()`, with per-device "Sign out" (`session.revoke()`); the current device is tagged |
| Notifications | A table of 7 events × 2 channels (in app, email), email digest (off/daily/weekly), WhatsApp opt-in and number. Uses `GET/PUT /me/notification-preferences` (existing) |
| Privacy | Public profile (`is_public`), 101 email (`email_opt_in`), show badges and certificates (device setting) |
| Accessibility & motion | Background On/Reduced/Off (drives `CC_BG.set` and the View settings select), theme, Lite mode, underline all links |
| Language & region | Language (drives the shared i18n select), time zone (default Africa/Kampala), currency shown, date format |
| Connected accounts | Clerk `externalAccounts` (Google/GitHub) plus connect, and a link to the video apps page |
| Your data | **Download my data**: `GET /me/export` (DPPA right of access, rate-limited server-side), plus a device-settings JSON |
| Guardian | DOB plus guardian name, email or phone, and relationship → `POST /me/guardian` (existing: emailed consent link valid 7 days, or manual admin check). 18+ is told they don't need one |
| Help | FAQ, contact, privacy email, WhatsApp community, privacy notice, terms, certificate verification |
| Delete account | Typed confirmation `DELETE MY ACCOUNT`, optional reason, a 24 h cool-off with **Cancel deletion**, the reverification prompt ("Sign in again") on a 403 `reverification_required`, and the root admin can't delete itself |

Visitors see a sign-in card. Only the device-local sections (Accessibility, Language, Help) work for them.

## 5. Share profile
- **Image:** a 1080×1350 canvas card in the card.html look, flat brutalist: navy, the site grid, hard offset blocks, Archivo Black, logo, MEMBER tag, avatar, name, @handle, role and education chips, headline, skills, real badge and certificate counts, and an orange footer with the public link. **Share image** uses the Web Share API Level 2 (`navigator.canShare({files})`) with a PNG download fallback. There is also a separate **Download PNG** button.
- **PDF:** generated client-side with no library. Each A4 page is drawn on a canvas at 150 dpi in brand type, encoded as JPEG, and wrapped in a hand-written PDF 1.4 (DCTDecode XObject per page, multi-page when long, Title metadata). You pick the sections: About, Skills, Education, Links, Badges, Certificates. Nothing is uploaded. The QA PDF for the tutor is ~49 KB, and pdfinfo reads it correctly.
- **Link:** the public `/u/<username>` URL with Copy, WhatsApp, LinkedIn and X. It warns when the profile is private or has no username yet.
- **Open Graph:** the static host can't render a per-user og:image, so /u/ links unfurl with the site OG image. A per-user OG endpoint is an open item for the backend.

## 6. Backend: r11/profile-api (a2ed8fc). The erase flow was broken; it is now fixed and secured
**Found:** `erase_user()` ended with `update data_requests set handled_by = p_actor`, but `handled_by REFERENCES profiles(id)`, and the actors are `'privacy-job'` and `'clerk:user.deleted'`. Every erase therefore hit an FK violation and **rolled back completely**. No account was ever erased, the daily job retried the same requests forever, and the Clerk `user.deleted` webhook erase failed too. This is proved on the main migrations (the test fails with `data_requests_handled_by_fkey`).

Migration `supabase/migrations/20261105003000_account_erase_hardening.sql` (**not applied: the founder applies it**):
- The actor is stored in a new `handled_actor` column. `handled_by` only takes a real profile id.
- `erase_user` refuses a **super_admin (root)** unless the actor is `clerk:user.deleted`.
- The `data_requests` guard trigger now also forces `created_at := now()` (the 24 h cool-off could be skipped by back-dating before) and allows exactly one user update: cancelling your own open delete request.
- Status `'cancelled'` is added. One open delete request per user (older duplicates are deduped to `rejected` first). The insert policy is tightened.

API:
- `POST /api/v1/me/delete`: typed confirm, **Clerk reverification** (a first-factor sign-in within 10 min, `auth().has({reverification})`, failing closed; new `lib/stepup.ts` and error code `reverification_required` → 403). It refuses the root admin (409), is rate-limited, and returns the existing request instead of a duplicate.
- `GET /api/v1/me/delete` returns the open request with `erase_after`. `DELETE /api/v1/me/delete` cancels it.
- The job (`processDeletionRequests`) isolates failures per request, never picks up cancelled requests, and deletes the Clerk user **only after** the DB erase commits.
- New: `GET /api/v1/me/badges` (own badges for the private profile).

Tests: `supabase/tests/account_erase.test.mjs` (ERASE-1…7) plus the existing suite: **71/71 passed** on a throwaway Postgres (`qa/pg.sh`, port 55917). `tsc --noEmit` is clean.

## QA (headless runs under `flock work/round11/chromium.lock`; outputs in `work/round11/profile/qa/`)
QA_RESULTS

## Deploy
- **Protected preview (static, members-site-staging, no production target):** **dpl_FCZHXeajRTEVwQUhZQAU93umy1g8**, READY. URL: `members-site-staging-lr1qgctnn-101codecrafts-8167.vercel.app`, built from r11/profile **5c5aee5** (`work/round11/profile-deploy/deploy.out`).
  - Without the bypass: 302 (protected).
  - With the fe bypass header: settings.html, profile.html, offline.html, js/account.js, js/access.js and css/account.css all return 200, and sw.js is cc-v21.
  - No alias was moved.
- That preview has no /api, so the settings and profile sections that need the server show their offline and empty states there. A combined (API) preview isn't made: the deploy pattern for members-site-api-staging targets production, which this brief doesn't allow.

## New access keys (for the auth owner to merge into src/data/access-policy.json)
`profile.view_own`, `profile.edit`, `profile.public`, `profile.share`, `account.billing`, `account.upgrade` (guest, learner, tutor; never staff), `account.payouts` (**tutor only**), `account.guardian` (guest, learner), `account.export`, `account.delete` (**not root_admin**), `settings.connected_apps`.
The stub `js/access.js` on this branch has the shared API (`role`, `plan`, `user`, `can`, `limit`, `gate`, `ready`, plus `onChange`/`on`). account.js and settings.js call `CCAccess.onChange || CCAccess.on`, so the owner's file drops in.

## Merge notes (expected conflicts)
- `tools/build.py` topbar: r11/auth changes the guest links to `auth.html`. Keep their hrefs and add `data-return`, and keep this branch's menu body. My extra build steps are additive: bg.js/account.js injection and the policy inlining. Keep the owner's inliner if both exist.
- `js/bg.js` line 10–13: r11/auth only added `auth` and `guest` to the type map. This branch has both plus `settings` and QUIET.
- `js/access.js` and `src/data/access-policy.json`: take the owner's and add the keys above.
- `sw.js`: cc-v21 here. If several branches bump it, the merged release needs one version above all of them.

## Open questions for the founder
1. **Light theme glyphs:** the brief says "animated grid and glyph background on every page". Today light mode shows the static grid and dark mode adds the moving glyphs (round-6 decision, for contrast and battery). Do you want the glyphs in light mode too?
2. **Account deletion of the root admin** is blocked in the UI, the API and the DB. Should root ever be deletable (for example after transferring root to another email)?
3. **Per-user share image for links (og:image):** do you want a server-rendered OG card per profile, so WhatsApp and LinkedIn previews show the member card?
4. **Payway** (from the brief) still isn't defined. Billing lists MoMo, Airtel and cards only.

## Files
- **Site:** css/bg.css, js/bg.js, js/bg-paint.js, tools/build.py, sw.js, src/icons.svg, css/shell.css (+ generated theme-dark, bundles), js/shell.js (fills every `.acct-av`), **js/account.js**, **js/access.js** (stub), **src/data/access-policy.json** (stub), **src/settings.html + js/settings.js**, **src/profile.html + js/profile.js**, **css/account.css**, RESEARCH.md, PROGRESS.md, REPORT.md, tools/qa/{bgprobe,acct_qa,staticcmp,band}.py
- **API:** backend/lib/stepup.ts, backend/lib/errors.ts, backend/app/api/v1/me/delete/route.ts, backend/app/api/v1/me/badges/route.ts, backend/services/jobs.ts, supabase/migrations/20261105003000_account_erase_hardening.sql, supabase/tests/account_erase.test.mjs
