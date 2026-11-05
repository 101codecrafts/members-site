# Software-engineering and logic audit (round 11)

Scope: front end main **f33b32b** (`js/auth.js`, `js/api.js`, `js/shell.js`, `js/admin.js`, `js/tutor.js`, `js/pages.js`) and backend **3f36f1a** (`backend/lib/auth.ts`, `lib/rbac.ts`, `services/identity.ts`, `services/members.ts`, the routes under `app/api/v1`, and the `supabase/migrations/*.sql`), checked against the live deployments. Read-only.

## 1. RBAC: where enforcement actually lives

| Layer | What f33b32b / 3f36f1a does | Verdict |
|---|---|---|
| Page (front end) | **Nothing.** No page checks session or role before rendering. `auth.js` paints the name chip and toggles `html.signed-in/out`. The only role-aware code is the account-menu "Switch role" tabs (`roles()`), and they only *hide links*. | **Hole (UI):** admin and tutor tooling and fake data are exposed to everyone (P0-1, P0-2). |
| Action (front end) | Nothing. "Add to cart", "Sell on 101", "Create", "Post comment", "Request payout" and "Change role" are all clickable for any visitor. | **Hole (UI):** no join flow; actions fail silently or fake success. |
| API (server) | `requireUser / requireMember / requireTutor / requireAdmin({superAdmin})` on every route, plus the `MATRIX` in `lib/rbac.ts` via `authorize()`. Probed live: all 19 static `/v1/admin/*` routes give **401** to anon and **403** to a pending learner; all 5 `/v1/tutor/*` give 401 or 403 (`qa/probe.out`). | **Holds.** No real data reached an unauthorised caller in the probe. |
| DB (RLS) | RLS on every private table (staging report SR-01: payments, payouts, profile_private, guardian_consents, user_roles, audit_log → 42501 for anon). Role changes go through `admin_set_role()` (super_admin) and the `cannot remove the last super_admin` trigger. | **Holds** for anon. Not re-probed with a second real user (only one test user exists). |

So there is **no client-only *security* check to bypass**, because the client checks nothing. The holes are UX and trust holes: role-gated surfaces render for every role, populated with invented data, and actions report success the server never gave. Each item below needs a server or contract fix, not only a UI one:

1.1 **Role model mismatch with the founder's contract.** The server enum is `learner | tutor | admin | super_admin`. There is no `guest`, `root_admin` or `visitor`. A signed-in but not-yet-approved account has `roles: []` and gets `effectiveRole = 'anon'` (QA Learner: `role: anon, account_status: pending`). The UI calls it "Learner". **Fix (auth):** add `guest` and `root_admin` (or map super_admin → root_admin), and expose `{role, plan, home}` from one endpoint used by the redirect and by `CCAccess`.

1.2 **Root is not bound to the verified email.** Nothing assigns super_admin from `101codecrafts@gmail.com`. A super_admin can demote another super_admin (only the *last* one is protected). The founder's rule "Admins can never remove or demote root; only that email is root" needs a DB check (for example `root_admin` derivable only from `auth email = '101codecrafts@gmail.com' AND email_verified`, and a trigger that forbids any grant or revoke of root via `admin_set_role`).

1.3 **Client decides the role at onboarding.** `onboarding.html` routes to `tutor.html` on a button press. The server never sees it (POST against a PUT route → 405; wrong field names). The server must assign learner after a completed learner onboarding and tutor only after an admin verifies the tutor application (`/v1/applications/tutor` already exists).

1.4 **The post-sign-in redirect is client-constant** (`dashboard.html` for everyone). It must come from the server role.

1.5 **Fallback-to-demo on 401/403** (`api.js tryChain`) turns every authorisation failure into convincing fake data. That's the root cause of the founder's "tutor dashboard full of demo data under his own account". Rule: *authz failures must render an error or empty state, never seed data*. Demo only behind an admin-only `?demo=1`.

1.6 **MFA for staff vs Clerk config.** `REQUIRE_MFA_FOR_STAFF` defaults to `'true'` (`lib/env.ts`), and `assertMfa()` then needs `twoFactorEnabled` from Clerk. The Clerk instance has `authenticator_app` disabled (`qa/clerk_env.json`). Unless Vercel sets the flag to `false` (I couldn't read the env), **no tutor or admin can pass `requireTutor/requireAdmin`**, which by 1.5 means they always see demo data. *Founder or env owner to confirm the flag value*, and enable TOTP in Clerk before requiring it.

1.7 **Guardian consent by GET** (P1-11): state change on a GET link. Mail scanners can approve it. Use GET → confirm page → POST.

1.8 **Ratings, sell and buy rules aren't in the server matrix the founder's way.** `review.create = 'own'` for learner and tutor with no "enrolled or used" condition in `lib/rbac.ts` (it may sit in RLS or the RPC, which I haven't verified). `listing.create = 'own'` for learner and tutor (matches "learners and tutors can sell"). There is no guest row at all, so "guest can buy, can't sell" can't be expressed. **Fix (plans):** add guest to the matrix and an enrolment predicate for reviews.

## 2. State consistency

| # | Issue | Where | Effect |
|---|---|---|---|
| 2.1 | Optimistic success toasts without server confirmation ("Role changed to admin", "Flag on", "Commission set", "Announcement queued", "Payout requested … saved", "Saved as draft") | `admin.js` change and submit handlers, `tutor.js` | The UI state differs from server state; an admin believes a change happened |
| 2.2 | Lesson progress and notes are written to `localStorage` first and the POST failure is swallowed (`markLessonComplete`, `saveNotes`); notes and discussion have no backend route | `api.js` | Progress differs per device; a learner loses notes on another phone with no warning |
| 2.3 | `cc_api_absent` is cached for **6 h** in localStorage after one health probe returns a non-JSON 404 | `api.js apiGuard` | One bad deploy or edge 404 puts a combined deploy into 6 h of silent demo mode for that browser |
| 2.4 | `/v1/me` is fetched once per user per page (`getMe` memo) and never refreshed after a role or plan change | `auth.js` | After an admin promotes a user, the menu and role tabs stay stale until a full reload |
| 2.5 | The role label "Learner" is assumed (`has.learner = true`) | `auth.js roles()` | A pending account (no roles) is labelled Learner |
| 2.6 | The custom sign-up form keeps `cc_signup` in sessionStorage and onboarding reads `minor` from it, even though no account exists | `pages.js signup/onboarding` | The minor flag is derived from an unsaved client form |
| 2.7 | External course drafts are kept in `localStorage.cc_ext_drafts` and resolved by `/go/<id>` | `api.js addExternalCourse/lookupGo` | Local drafts look published on that device; a URL from local data is followed without a scheme allow-list |
| 2.8 | The cart works without a session (the visitor adds items) | `market.js` | Breaks "visitors can't buy"; the cart has to be reconciled on sign-in |

## 3. Front-end ↔ backend contract (`qa/contract.txt`)

Every path `js/api.js` can request, mapped through `V1_MAP` and checked against the 158 backend route files: **23 reach a real route, 44 don't**. `NONE` = no v1 mapping, so it's never requested and always resolves to demo data or null. `404` = mapped to a route that doesn't exist.

| Area | Broken paths |
|---|---|
| Admin (19 of 26) | approvals/members (+approve/reject), signups/recent, approvals/courses, transactions (+refund), events, flags (+set), tutors/:id/verify, courses/:id/approve, courses/:id/reject, announcements (POST) — **NONE**; users/:id/suspend (real: `/users/:id/status`), users/:id/role (real: `/users/:id/roles`), payouts/:id/approve and /hold (real: `/payouts/:id`), settings/commission (real: `/settings`) — **404** |
| Tutor | tutor/courses/:id/lessons, tutor/courses/:id/books — NONE (the real routes are `/v1/tutor/courses`, `/v1/tutor/course-media`) |
| Learning | course notes, course discussion — NONE; `me/onboarding` uses **POST against a PUT route (405)** with mismatched field names |
| Auth | auth/sign-in, auth/sign-up, auth/guardian-consent — NONE (the real flow is Clerk plus `PUT /v1/me/guardian`) |
| Community | launchpad item, upvote and comments; testing (5 paths); competitions (4); groups list and item; projects (3) — NONE |
| Other | courses/external/unfurl — NONE |

## 4. Auth paths walked (live)

| Path | Result |
|---|---|
| Visitor → `/signin.html` (public and alias, 412 and 1440) | Clerk SignIn mounts: Email, Password, Continue with Google, "Create a free account" → signup.html. **No grid** (0/7). |
| Visitor → `/signup.html` | Clerk SignUp: First name, Last name, Email, Password, Google. **No role, no DOB, no guardian, no terms.** No grid. |
| Sign-up attempt (`audit.r11.probe+clerk_test@gmail.com`) | Stops at `#/protect-check` (Clerk Protect device check in headless Chromium), so the rest of the sign-up steps couldn't be walked in the sandbox. No user was created. |
| Sign-in, QA Learner, email code (Clerk test code) | `#/factor-one` email code → lands on **`/dashboard.html`** with name "QA Learner", label "LEARNER", fake community activity. |
| Signed in → `/signin.html` | Redirects to `/dashboard.html` (good, but should be the role home) |
| Signed in → `/signup.html` | Redirects to `/onboarding.html` **every time** (onboarding never persists) |
| Signed in (pending, no roles) → `/tutor.html`, `/admin.html` | Both render with demo money and people |
| Visitor → `/onboarding.html` → Tutor → Next ×3 | Lands on `/tutor.html` (demo). The Learner path lands on `/dashboard.html` |
| Legacy custom forms (Clerk unavailable) | Simulated success, no account (code path `pages.js signin/signup`; founder screenshot 1005819906) |
| Google sign-in | Button present. Not completed: no Google test account may be used in this sandbox |
| Guest (email + OTP only) | **Doesn't exist:** password is required at Clerk sign-up, and there is no guest role |

## 5. What couldn't be tested, and why

- **Tutor, admin and root as real accounts:** only the founder's account and the QA Learner exist. Making the QA Learner a tutor or admin would mean writing to staging `user_roles`, which the brief rules out (read-only audit; the founder applies DB changes). Their "now" behaviour is derived from code (f33b32b has no role-based rendering or routing) and from the live pending-learner run, which already reaches `/tutor.html` and `/admin.html`.
- **Active learner:** the QA Learner is `pending`. Member-only APIs answer 403, so learner pages also fall back to demo.
- **Guest:** the role doesn't exist in f33b32b or 3f36f1a.
- **Demo modes:** f33b32b has no `?demo=1`. `?static=1` is the screenshot mockup mode (no auth, no fetch) and was not treated as a role.
- **Under-18 sign-up and guardian email:** can't be reached through the live UI (no DOB in Clerk sign-up). Reviewed in code only.
- **Clerk sign-up beyond `protect-check`:** blocked by Clerk Protect in headless Chromium.
- **Payments:** not exercised. No live charges, as the brief requires; the Flutterwave stub alert was confirmed by code read.
- **Light theme:** crawled in dark (the founder's screenshots are dark). In light theme `bg.js` never animates by design (static grid only).

## 6. Methodology

1. **Code read** of the front-end auth, API, shell, admin, tutor and onboarding modules and the backend auth, RBAC, identity and members code plus migrations; recorded in this file with file and function references.
2. **API probe** (`qa/probe.py` → `qa/probe.out`, `qa/api_probe.json`): every static route in 3f36f1a (100 files) hit as anon and as the QA Learner on the protected alias (bypass header, never printed). The Clerk session JWT was minted from a Clerk sign-in token and refreshed every 40 s, because Clerk session tokens live 60 s; the first run went stale and was redone. Only GETs, plus bodiless `{}` POST/PUT/PATCH on admin and tutor routes to confirm the authz layer. No state change.
3. **Contract check** (`qa/v1check.js` → `qa/contract.txt`): every `CC_API` path is passed through the real `V1_MAP` and matched against the backend route files.
4. **Live crawl** (`qa/crawl.py`, driven by `qa/chain.sh`, each run wrapped in `flock round11/chromium.lock`, one Chromium at a time): 52 pages × {visitor on the public domain, QA Learner on the alias} × {412 px mobile + touch, 1440 px}, dark scheme. Per page it records: HTTP status, final URL, sidebar and drawer visibility, signed-in name and role label, money strings and seeded names, quick actions, horizontal overflow, background visibility (first opaque layer at 7 viewport points; grid canvas present), and every interactive element (a, button, role=button, menuitem, tab, summary, select, label.opt). Every non-navigating control was **clicked** (cap 30 per page; marketplace "Add" buttons past the cap are identical cards), with the effect recorded: navigation, new tab, browser dialog, reload, DOM mutations, or NO-OP. Anchors with real hrefs were recorded, not followed.
5. **Targeted rechecks** (`qa/recheck.py`): for each flagged control, the own and ancestor click listeners via CDP `DOMDebugger.getEventListeners`, the ambient mutation baseline vs post-click mutations, URL and dialog checks, before and after screenshots, plus the fake-certificate check on both hosts.
6. **Auth walk** (`qa/authwalk.py`): auth pages on both hosts at both widths; onboarding as a visitor for each role button; an abandoned sign-up attempt; a real QA Learner sign-in by email code; then every auth, tutor and admin page as that signed-in user, and the account menu.
7. **Analysis** (`qa/analyze.py` + `qa/policy.py`): merges the crawl into ROUTES.md (now vs should, per role) and `qa/findings.json`. "Should" encodes the founder rules from BRIEF.md as a page-access table and element rules.
