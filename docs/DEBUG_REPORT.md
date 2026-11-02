# Debug report: 101 Codecrafts members site

Run on 2026-11-02 (≈14:00–14:30 UTC) by the debugging agent on branch `debug-ci`.

**What was tested**
- **Front end:** a snapshot of the `main` working tree, HEAD `180e45e` plus uncommitted edits as of 13:54 UTC. The front-end team was still editing it. 23 pages, 3 widths.
- **Backend:** a snapshot of the `backend` branch, HEAD `c86e869` plus the uncommitted `backend/` folder as of ≈14:20 UTC.
- **Not tested:** `ai-features` and `security` (see the end of this report).

**Tools**
- `tests/smoke/smoke.mjs`: Playwright on system Chromium. Reduced motion is on and service workers are blocked.
- `scripts/check-rls.mjs`
- Embedded PostgreSQL 18.6, used with the repo's `supabase/tests/local/00_supabase_shim.sql` (this is not the real Supabase stack).

**Severity scale:** **High** means it breaks a feature or leaks data. **Med** means a visible defect or a likely production problem. **Low** means polish or noise.

---

## 1. Front end (`main`)

### Summary per page (after removing sandbox artefacts)

| page | console errors* | local failed requests | broken links | overflow |
|---|---|---|---|---|
| index.html | api 404 | api/social, api/news/today | 7× `href="#"` | **360: +46px, 768: +16px** |
| dashboard.html | api 404 | api/social, api/news/today, api/resources | 22× `href="#"`, 5 GitHub API 404 | **1440: +96px** |
| admin.html | api 404 | 13× api/admin/* | 4× `#` | **360: +117px, 768: +138px** |
| course.html | api 404 | api/courses/web-basics | 3 `/go/*` (Vercel-only) | **360: +42px, 768: +148px** |
| tutor.html | api 404 | api/tutor/overview | 6× `#` | **768: +124px** |
| groups, product, competitions, launchpad, profile, testing, news, projects, resources | api 404 | 1–3 api/* each | 4–5× `#`, resources: 9 `/go/*` | **768: +148px** |
| go.html | api 404 | api/news/today | – | – |
| privacy, terms, signin | api/social 404 | api/social | 1× `#` | – |
| signup, onboarding, verify, offline, 404 | 0 | 0 | 0 | – |

\*Every console error left is the browser logging a 404 from `/api/*`. No backend is deployed, and `js/api.js` falls back to mock data correctly. **No uncaught JS exceptions on any page.**

### Findings

**F1 (Med): the app topbar overflows at tablet widths (761–1100px).** This hits all 12 shell pages (groups, product, competitions, launchpad, profile, testing, course, news, projects, resources, tutor, admin) by 124–148px.
- **Cause:** `css/app.css:20` `.topbar{display:flex;…}` has no wrap. The `.search` (`flex:1; max-width:540px`), the icon buttons `.ib` and `.chip-me` (`css/app.css:28`) don't fit next to the 244px sidebar. The topbar only starts wrapping at `max-width:760px` (`css/app.css:149`). The offending elements are `a.ib` at right=769 and `div.chip-me` at right=916.
- **Fix:**
  ```css
  /* css/app.css, after line 27 */
  .topbar .search{min-width:0}
  @media (max-width:1100px){
    .topbar{flex-wrap:wrap}
    .topbar .search{order:3;flex-basis:100%;max-width:none}
    .chip-me div{display:none}
  }
  ```

**F2 (Med): landing page overflows on mobile (360: +46px, 768: +16px).**
- **Cause:** `css/landing.css:88` `html:not(.static) .page>*{…max-width:100%;margin-inline:16px}`. Full-width children (hero `img`, `p`, `div`) get 100% width plus 16px margin on each side.
- **Fix:** `max-width:calc(100% - 32px)` on that rule, or add `box-sizing:border-box;width:auto` for the img/div children.

**F3 (Med): dashboard overflows by 96px at 1440px.**
- **Cause:** `css/dashboard.css:139` `.below{width:1536px;…}` is a fixed mockup width. It is only overridden at ≤1099px (`css/dashboard.css:182`), so any screen between 1100 and 1535px scrolls horizontally.
- **Fix:** `.below{width:min(1536px,100%);box-sizing:border-box}`, or `max-width:100%`.

**F4 (Med): course header overflows at 360px (+42px).**
- **Cause:** `section.course-top` (`css/app.css:208`) and its children are 390px wide inside a 360px viewport. The flex child `div` holding `#c-path`, `#c-title` and `#c-meta` (course.html:109) has no `min-width:0`, so long titles and meta rows set its width.
- **Fix:** `.course-top>div{min-width:0;flex:1 1 100%}` plus `.course-top h1{overflow-wrap:anywhere}`.

**F5 (Med): admin overflows at 360px (+117px), cause not pinpointed.**
- The offender scan found no single element outside the viewport, so it is probably a table or canvas inside a grid track with `min-width:auto`. At 768 the TRANSACTIONS header buttons (`#flw-test`, admin.html:167) also stick out.
- **Fix:** wrap tables in `.tbl-wrap` (already defined, `css/app.css:65`), give grid children `min-width:0`, and add `flex-wrap:wrap` to `.sec-title .row`.

**F6 (Med): dashboard tool cards call the GitHub API for repos that return 404.**
- `dashboard.html:175-179` `data-repo="codecraft-ide|securescan|datainsight-pro|clouddeploy|taskflow"` triggers 5 unauthenticated `api.github.com/repos/101codecrafts/<repo>` calls on every load. They 404 because the repos don't exist or are private. Unauthenticated calls are also capped at 60/hour per visitor IP.
- **Fix:** point these at real public repos, or drop the live fetch and serve the stars from `/api/tools`, cached server-side.

**F7 (Med): `/go/<id>` links only work on Vercel.**
- course.html (3) and resources.html (9) link to `/go/bk-html`, `/go/cs50x` and similar. These rely on the `vercel.json` rewrite `/go/:id → /go.html?id=:id`. The repo also has a GitHub Pages workflow, and on Pages (or any plain static server) those links 404.
- **Fix:** either emit `go.html?id=<id>` in `js/pages.js` and the course/resources templates, or don't deploy to Pages.

**F8 (Low): lots of placeholder `href="#"` (≈90 across 16 pages).**
- Examples: index.html:106-107 (RESOURCES / ABOUT nav), :144 VIEW ALL FEATURES, :176 VIEW ALL PATHS, the :208 footer, signin.html:102 "Continue with Google", and the social icons (`js/api.js:184` falls back to `#` when `/api/social` is down).
- **Fix:** link to real pages (`resources.html`, `#features`, `#paths`). Render social icons only when a URL exists. Disable or hide the Google button until Clerk OAuth is wired up.

**F9 (Low): noise from `/api/*` 404s on a static deploy.** Each page makes 1–13 failing calls (admin makes 13), and each one logs a red console error.
- **Fix:** in `js/api.js`, probe `/api/health` once per session and skip API calls while it fails (or set `window.CC_API_BASE`). This cuts wasted requests on slow connections.

**F10 (Info): service worker.** `js/ui.js:121` registers `sw.js`. That works, but the smoke test blocks service workers so cached responses can't hide failures. Remember to bump the cache version in `sw.js` on each deploy.

**Sandbox artefacts, not product bugs:**
- `ERR_CERT_AUTHORITY_INVALID` on api.github.com came from the sandbox HTTPS proxy.
- The SW "bad HTTP response code (404)" error happened because the SW fetch went through the proxy.
- Two browser crashes on terms and verify were caused by parallel load. Re-runs of both were clean.

---

## 2. Backend (`backend` branch)

| check | result |
|---|---|
| `npm ci` | ✅ 195 packages |
| migrations from scratch (shim + 14 migrations + seed) on PostgreSQL 18.6 | ✅ all applied, no errors |
| `supabase/tests/run.mjs` (RLS / business rules) | ✅ **36 passed, 0 failed** |
| `scripts/check-rls.mjs` | ⚠️ 0 tables without RLS; 1 E3; 31 W2 (below) |
| `npm run typecheck` (snapshot 14:20 UTC) | ❌ 4 errors |
| `npm run lint` | ❌ 1 error |
| `npm run build` | ❌ no `app/` or `pages/` directory yet |

**B1 (Med): typecheck error in `backend/lib/monitoring.ts:19` (TS2322).**
- `context: { request_id: context.request_id ?? null }`: `context` is `Record<string, unknown>`, so the value isn't assignable to `Json`.
- **Fix:** `context: { request_id: typeof context.request_id === 'string' ? context.request_id : null }`.

**B2 (Med): typecheck errors in `backend/repositories/catalog.ts:20-22` (TS2339 / TS2698).**
- `course` comes out as `never` after `db.from('courses').select('*').eq('slug', slug).maybeSingle()`, so `course.id` and `{...course}` fail.
- **Likely cause:** the hand-generated `types/database.ts` (from `scripts/gen-types.mjs`) doesn't fully match the `GenericSchema` shape supabase-js 2.118 expects, so row inference collapses.
- **Fix:** generate the types with the official generator against the migrated DB: `npx supabase gen types typescript --db-url $DATABASE_URL --schema public > types/database.ts`. As a stop-gap, annotate `maybeSingle<Tables<'courses'>>()`.

**B3 (Med): lint error in `backend/lib/ratelimit.ts:3` (no-restricted-imports).**
- It imports `@/lib/supabase/admin` (the service-role client) from `lib/`. The repo's own rule only allows that from `services/`.
- **Fix:** move the limiter to `services/ratelimit.ts`, or call `public.rate_limit_hit` through a narrow server-only RPC wrapper that lives in `services/`. Don't loosen the lint rule.

**B4 (Info): build can't run until the first route exists.** `next build` fails with "Couldn't find any `pages` or `app` directory". Expected while the backend is being built. CI skips the build with a warning until `app/` exists.
- Also set `outputFileTracingRoot: __dirname` in `backend/next.config.mjs`. Next infers the wrong workspace root when another lockfile sits higher up.

**B5 (Med, review): anon can execute `public.verify_certificate(p_code text)` (SECURITY DEFINER).**
- This is presumably intended (the public verify page), so CI allow-lists it via `RLS_ALLOW_ANON_FN=verify_certificate`.
- Make sure it returns only name/course/date and is rate-limited, so the code space can't be enumerated.

**B6 (Med): anon has table-level SELECT on `public.profiles`** (`20261102000990_rls_policies_grants.sql:556`).
- The RLS row filter is good: minors are never shown to anon.
- But anon can read **every column** of public adult profiles, including `account_status`, `status_reason` (moderation notes) and `email_opt_in`.
- **Fix:** grant column-level SELECT (`grant select (id, username, display_name, avatar_url, headline, bio, location, skills, github_username, linkedin_url, website_url, …) on public.profiles to anon`), or expose a `public_profiles` view.
- Also review anon SELECT on `feature_flags` and `site_settings`: unreleased flags become publicly visible.

**B7 (Info):** the remaining 29 W2 warnings are catalogue/community tables that are readable by anon on purpose (courses, events, news_items, launch_*, competitions…). The RLS policies there filter the rows. No action needed beyond B6.

---

## 3. Not covered in this pass
- **`ai-features` branch:** not run (time box). The CI `ai-features` job runs `tsc` plus vitest on `lib/ai`, excluding the live gateway test.
- **`security` branch (work/sec-review):** not run. It has its own `security.yml`, and `ci.yml` doesn't overlap with it.
- **Real Supabase:** migrations were tested on vanilla Postgres plus the repo shim. Auth/storage behaviour should still be checked once against `supabase start`.
- **AI triage:** `scripts/debug-agent.mjs` was only exercised in `--dry-run` (log condensing and secret redaction verified). There was no `AI_GATEWAY_API_KEY` available here, so no live model call was made.

## 4. Debugging agents added (branch `debug-ci`)

| file | purpose |
|---|---|
| `.github/workflows/ci.yml` | Detects which parts exist on the branch, then runs: backend `npm ci`/typecheck/lint/unit tests/build (build skipped until `app/` exists); ai-features `tsc` + vitest; Postgres 17 service with migrations applied from scratch, RLS tests and `check-rls`; Playwright smoke with `--strict` at 360/768/1440. |
| `.github/workflows/ai-triage.yml` | On a failed CI run (same-repo only, not `ai-triage/*` branches), an issue labelled `bug`, or manual dispatch: gathers failed-job logs, calls the Vercel AI Gateway (`inclusionai/ling-3.1-flash-1019`, falling back to `nvidia/nemotron-3.5-lightning-free` and `reflection/beam-free`), and posts or updates one comment. If the patch passes `git apply --check`, it opens a **draft** PR from `ai-triage/*`. Never merges. Needs the repo secret `AI_GATEWAY_API_KEY`. |
| `scripts/debug-agent.mjs` | The same agent, runnable locally. Examples: `node scripts/debug-agent.mjs --log ci.log`, `--run "npm run typecheck" --cwd backend`, `--dry-run`. Redacts tokens, JWTs and DB passwords before anything is sent. |
| `scripts/check-rls.mjs` | **E1** = table without RLS. **E2** = SECURITY DEFINER without `search_path`. **E3** = anon can execute a SECURITY DEFINER function. **W1** = RLS but no policies. **W2** = anon SELECT grants. |
| `tests/smoke/smoke.mjs` | Headless crawl of every top-level page. Records console errors, failed requests, broken links and anchors (honouring `vercel.json` rewrites), and horizontal overflow with the offending selectors. |

**Note:** the smoke job will fail on `main` until F1–F5 are fixed. That's intended.
