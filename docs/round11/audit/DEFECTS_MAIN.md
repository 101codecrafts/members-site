# DEFECTS.md: round 11 audit of the live members site

Audited 5 Nov 2026 (EAT) on main **f33b32b** (static site `members-site-staging.vercel.app`) and backend **3f36f1a** (protected alias `members-site-101cc-staging.vercel.app`, reached with the bypass cookie). This was a read-only audit, so no code was changed.
Priority: **P0** = breaks a founder rule on trust, money or roles, or exposes admin or tutor tooling; **P1** = a wrong route, fake data or a missing rule a user hits on a main path; **P2** = a broken control or inconsistency on a side path; **P3** = polish.
Each item lists its evidence (screenshot in `shots/`, crawl JSON in `qa/out/`, API probe in `qa/probe.out`) and the fix area (auth · dashboards · admin · plans · profile · bg · links).
The "Appendix (generated)" at the end holds the machine lists: every dead click, every sidebar-for-visitor page, every page with no grid, and every label that goes to two places.

---

## P0

### P0-1 · Admin console opens for anyone, full of invented numbers · admin, auth
- **Seen:** `/admin.html` loads for a signed-out visitor and for the QA Learner (status *pending*, no roles). It shows the full console with fake data: "Total users 10,482", "Revenue UGX 18,450,000", "Pending payouts UGX 4,120,000", made-up members (Sarah Namubiru, Brian, Joseph, Grace) and payout rows. It also shows the quick actions *Add Course · Create Event · Post Announcement · Invite Admin* and a role dropdown on every user row. Nothing says the data is demo data.
- **Why:** there is no page guard anywhere in f33b32b. No page checks the role before it renders, and `js/auth.js` only paints the name chip. Every `CC_API.fetchAdmin*` call is `tryChain(backend) || CC_DATA.admin.*`. That means a 401 or 403 from the API, a host with no API, or an endpoint with no v1 mapping all quietly fall back to `js/data.js`. `markDemo()` skips 401/403/404, and the static-host guard answers with a fake JSON 404, so the demo banner never shows.
- **Server side is fine:** all 19 `/v1/admin/*` routes answer **401** to anon and **403** to the learner (`qa/probe.out`). Real data isn't leaking. The defect is that the UI exposes admin tooling and shows invented figures as if they were real.
- **Evidence:** `shots/P0-01-admin-console-visitor-1440.png`, `shots/P0-01-admin-console-pending-learner-1440.png`.
- **Fix:** a role gate before render (`CCAccess.gate`, so a visitor goes to `/auth?next=` and other roles go to their home). Remove the `|| CC_DATA` fallback for admin and tutor fetches, show empty states plus an explicit error instead, and allow demo data only with `?demo=1` for admins.

### P0-2 · Tutor dashboard shows invented earnings, learners and payouts to real accounts · dashboards
- **Seen:** `/tutor.html` as the QA Learner, and as the founder's own account (his screenshot 1005819869), shows "Earnings UGX 1,920,000", "Available balance UGX 1,070,000", the learners Sarah Namubiru, Ivan Mugisha, Esther Akello and Paul Wasswa, and fake sessions and payout history. A visitor gets the same page.
- **Why:** `GET /v1/tutor/dashboard` calls `requireTutor()`, which needs `roles ∋ tutor`, a *verified* tutor, and MFA when `REQUIRE_MFA_FOR_STAFF=true` (the env default). It answers 401 or 403, and `fetchTutorOverview()` then falls back to `CC_DATA.tutor`. The "Request payout" form reports "saved" even though nothing was sent. "New course" is an `alert()` stub. The "Add YouTube lesson / Add a book" forms write to unmapped endpoints and reply "Saved as draft".
- **Evidence:** `shots/P0-02-tutor-dashboard-demo-pending-learner-1440.png`; founder upload 1005819869.
- **Fix:** zeros and empty states for real accounts, the course → module → lesson builder, and a gate (non-tutors get "become a tutor").

### P0-3 · Users pick their own role, and a visitor can make themselves a "tutor" · auth
- **Seen:** `/onboarding.html` opens for signed-out visitors (Clerk doesn't guard it). Step 1 asks "How will you use 101? Learner / Tutor". Choosing **Tutor** and pressing Next three times lands a **visitor** on `/tutor.html` with the demo earnings (`qa/out/auth/authwalk-part2.log`, `shots/P0-03-visitor-onboarding-tutor-lands-tutor-dash-412.png`). A signed-in user who opens `/signup.html` is sent to `/onboarding.html` again every time (`authwalk.out`).
- **Nothing is saved:** `API.saveOnboarding` sends **POST** `/v1/me/onboarding`, but the route only exports **PUT**, so it returns **405** (probed). The body `{role, level, teaches, interests}` uses display labels, while the schema expects `intended_role, education_level, interests`. Even with PUT, Zod would drop `role/level/teaches`. So `onboarding_state` stays empty (QA Learner: `steps_completed: [], completed_at: null`).
- **Fix:** a role path chosen inside `/auth`, with the role assigned **server-side** (learner on completed onboarding; tutor only after an admin verifies them). Redirect by the server role.

### P0-4 · Same landing page for every role; no root_admin, and nothing ties the root email to it · auth, admin
- **Seen:** Clerk is mounted with `signInForceRedirectUrl = dashboard.html` and `signUpForceRedirectUrl = onboarding.html` for everyone (`js/auth.js mountAuthUi`). A real sign-in with email code (QA Learner, Clerk test code) lands on `/dashboard.html` (`shots/P1-signin-lands-learner-dash.png`). Root and admin never land on the admin console.
- **Backend:** the roles are `learner | tutor | admin | super_admin` (enum `app_role`). There is no `guest` and no `root_admin`. Nothing in the migrations, the webhook (`services/identity.ts`) or `lib/auth.ts` grants super_admin from the verified email `101codecrafts@gmail.com`; it is seeded by hand. The trigger only blocks removing the **last** super_admin, so any super_admin can demote another. Admins can't demote a super_admin (good), but nothing pins root to a single email.
- **Fix:** a server-side role claim (`root_admin` iff the Clerk verified primary email is 101codecrafts@gmail.com, and nobody else, ever), a `GET /v1/auth/session` → `{role, home}`, and a role-based redirect after sign-in.

### P0-5 · Sign-up skips DOB and guardian consent, and on a slow network the sign-up is fake · auth
- **Seen (Clerk loaded):** `/signup.html` = Clerk SignUp asking for *First name, Last name, Email, Password*, plus Google. There is no role choice, **no date of birth**, no guardian step and no terms consent (Clerk env: `legal_consent_enabled: false`). Password is **required** (`attributes.password.required: true`), so the founder's "guest = email + one-time code only" can't happen.
- **Seen (Clerk slow or failing, after the 6 s fallback):** the old custom form stays on screen with *Full name, Email, Phone (for Mobile Money), Date of birth, Password*. This is the founder's screenshot 1005819906. Submitting it shows "Accounts open when the 101 backend is live. Continuing to the onboarding preview…" and goes to onboarding, then dashboard or tutor, **without creating an account**. `API.signUp` posts `/auth/sign-up` and `/auth/guardian-consent`, and neither exists. The custom `#si` sign-in form likewise answers "Sign-in opens when the 101 backend is live". On a 3G phone in Kampala this is a realistic path, and it's a dead end disguised as success.
- **Law:** Uganda DPPA 2019 s.8 requires a parent's or guardian's consent before collecting a child's data. Today a minor can sign up through Clerk with nothing asked. Backend `startGuardianConsent` exists, but the UI never reaches it.
- **Fix:** a single `/auth` with DOB as step 1 (under 18 → guardian email plus a consent record before the account goes active). Drop the custom forms, or make them call Clerk; never simulate success.

---

## P1

### P1-1 · Visitors get the app shell and sidebar · links, auth
`#sbar` is visible to signed-out visitors on 33+ pages. That includes `news.html`, which the founder wants as a marketing page, and every gated page. At 412 px the hamburger opens the same drawer with "My Courses / My Projects / My Downloads / Member card / Settings". The full list is in the Appendix (`sidebar_visitor`). Evidence: `shots/P1-visitor-dashboard-sidebar-1440.png`. **Fix:** a marketing header for visitors and the app shell only for signed-in roles (`html.signed-out` → no `#sbar`).

### P1-2 · No page is gated: visitors can open courses, resources and the marketplace, and can buy · auth, plans
A visitor gets HTTP 200 and full content on dashboard, courses, course player, resources, practice, projects, seller centre, sessions, cart and checkout. **Add to cart works for a visitor** (marketplace). "Sell on 101" goes straight to `seller.html`. None of it sends the visitor to join with a return-to. **Fix:** `CCAccess.gate` per page plus per action, using the policy table in ROUTES.md "Page access".

### P1-3 · Fake people and fake activity under real accounts · dashboards, profile
- Dashboard "Latest from Community" for the QA Learner: "New message from David K.", "**Your** project got 5 new stars", "Grace M. commented on **your** post". These are fabricated personal notifications (`shots/P1-signin-lands-learner-dash.png`). The hard-coded stats "500+ projects & resources" and "100+ learning paths" also show.
- **"My Profile" → `/profile.html`**, which defaults to the handle `sarah-n`. If the portfolio API misses, it falls back to "Sarah Namubiru, Software engineering student in Kampala, building BodaSafe". Every signed-in user sees a stranger as "My Profile" (`js/pages.js` profile()). This is the "placeholder person" the founder reported.
- The account chip shows **"LEARNER"** (or "Member") while the server says `role: anon, account_status: pending, roles: []`. The label is invented client-side (`js/auth.js roles()`: `learner: true` is always set).
- **Fix:** read everything from `/v1/me`; empty states with faint example placeholders; profile = the signed-in user's own handle.

### P1-4 · Pages missing the grid and glyph background · bg
Measured by sampling 7 points per page for whether the first opaque layer is `body` (where `body::before` paints the grid). **0/7** on: **offline**, **onboarding** (all 3 steps), **signin** and **signup** (every Clerk step: factor-one, protect-check), **verify**, plus the editor pages ide and problem (covered by the editor, acceptable). `main.center` / `.auth` paint an opaque fill over the whole viewport, and the canvas runs underneath unseen. Evidence: `shots/P1-bg-offline-1440.png`, `P1-bg-onboarding-412.png`, `P1-bg-signin-412.png`; founder uploads 1005819905, 1005819842, 1005819841. Also: `js/bg.js` lists `admin, article, terms, privacy, go, ide, problem, interview, contest, whiteboard` as **no canvas** (grid only), and light theme never animates. That conflicts with "animated grid and glyph background on EVERY page", so the founder should confirm the light-theme policy.

### P1-5 · Duplicate sign-in and sign-up pages, no `/auth` · auth, links
There are four auth surfaces: `signin.html` (Clerk SignIn plus a hidden legacy `#si` form), `signup.html` (Clerk SignUp plus the legacy `#su` form with DOB), `onboarding.html` (a separate, unguarded role picker) and the legacy fallback forms. The "Join" CTAs disagree: top bar → `signup.html`; index "JOIN OUR COMMUNITY / JOIN THE COMMUNITY" → **`dashboard.html`**; dashboard hero "Join Community" → `signup.html`; quick-access "Join Community" → nothing. `vercel.json` has no `/auth` route and no redirects from the old pages. **Fix:** `/auth` with role paths and 308 redirects from signin, signup and onboarding.

### P1-6 · Quick access offers "Create Project" to visitors, and all four tiles are dead · links, dashboards
Dashboard quick access *Join Community · Create Project · Browse Courses · Read Docs* are `<a class="qa">` with **no href**: not focusable, nothing happens on click (confirmed in `qa/out/recheck`). They show for visitors and guests. The six "category" tiles (Software Engineering…) are also href-less anchors. **Fix:** real targets, shown per role (Create Project → learner and tutor only).

### P1-7 · The same label goes to different places for the same role · links
Same role (visitor), different targets:
- **Community** → `community.html` (top/footer on 40 pages) vs **`profile.html`** (sidebar on 31 pages) vs `index.html#community` (dashboard footer)
- **Home** → `index.html` (brand/footer) vs `dashboard.html` (sidebar)
- **Learn** → `courses.html` (footer/top) vs `learn.html` (sidebar)
- **About** → `about.html` vs `index.html#about` (dashboard footer)
- **Join … community** → `signup.html` vs `dashboard.html` (index)
- **Library** → `resources.html` vs `admin.html#add-resource`
- **Notifications** and **Announcements** → both `announcements.html`; **Learning** vs **My Courses** (`courses.html` vs `courses.html#c101`); **Library** and **My Downloads** → both `resources.html`; **Projects** and **My Projects** → both `projects.html`

The full machine list is in the Appendix (`inconsistent`). **Fix:** one link registry (label → per-role target) used by the shell and the footer.

### P1-8 · Admin console says actions worked when they didn't · admin
`admin.js` toasts **"Role changed to admin"**, "Flag X: on", "Commission set to N%" and "Announcement queued for …" whatever `CC_API` returned (null = failed). Of the 26 admin reads and actions in `js/api.js`, **19 never reach a real route**: 12 have no v1 mapping, so they are never requested and always resolve to demo or null, and 7 are mapped to paths that don't exist. Examples: `/admin/users/:id/role` (the real route is `/v1/admin/users/:id/roles`), `/admin/users/:id/suspend` (real: `/status`), `/admin/payouts/:id/approve` (real: `/v1/admin/payouts/:id`), and no route at all for approvals/members, approvals/courses, flags, transactions, events, signups/recent, announcements (POST), tutors/verify and courses/approve. The table is in LOGIC_AUDIT.md §3. **Fix:** server-confirmed UI only; wire to the real routes.

### P1-9 · The public certificate checker can show a fabricated "valid" certificate · links, profile
On the static domain (no API) `verifyCertificate()` falls back to a hard-coded rule. Code `101-SE24-7Q3K` returns **"Valid certificate · Sarah Namubiru completed Software Engineering Path — Level 1"**, and every real code shows as invalid. Outcome in `qa/out/recheck/recheck.json` / `verify-fake-cert-pub.png`. **Fix:** a verifier that only trusts the API and otherwise says "can't verify right now".

### P1-10 · Account menu and settings are bare · profile
The menu holds only *name/email · Profile · Settings · (Switch role, hidden) · Sign out* (`shots/P1-account-menu-minimal.png`). "Settings" is `settings-apps.html` = "Connected apps" (Meet/Zoom/Teams buttons). There is no subscription or upgrade, billing, payment methods, payouts, security (password, 2FA, sessions), notifications, privacy or data export, guardian, or delete account. The backend already has `/v1/me/export`, `/v1/me/delete`, `/v1/me/notification-preferences`, `/v1/me/guardian` and `/v1/me/consents`, with no UI. Clerk has `authenticator_app` **disabled**, so 2FA can't be offered. That collides with `REQUIRE_MFA_FOR_STAFF` defaulting to `true` (see LOGIC_AUDIT §1.6). The profile can't be shared as an image or PDF ("Share profile" is `href="#"`).

### P1-11 · Guardian consent is approved by a plain GET link · auth
`GET /v1/guardian/verify?token=…` marks the consent verified on the first GET. Mail scanners (Outlook Safe Links, Gmail link preview, antivirus) fetch links automatically, which can approve a child's account without the guardian ever acting. Nothing checks that the guardian email isn't the child's own. **Fix:** GET shows a confirm page; a POST from that page records consent, plus the identity checks.

---

## P2

- **P2-1 Dead or no-feedback controls.** See the Appendix `dead` list and the `qa/out/recheck` verdicts: cards.html *Register solo / Register a team*, article *Post comment* (signed out: no prompt), IDE *Run ▶ / Download / Clear* (signed out), problem *Get a hint / Debug with 101 AI / Reset*, product *Post*, marketplace/cart/orders/seller/rfq *Search* with an empty box (no message), *Hide pinned announcement* (works once, then nothing to undo). Signed-out actions should go to `/auth?next=`, not do nothing. · links
- **P2-2 `href="#"` links** jump to the top of the page: *Share profile* (profile), *Share* (product, index), *Share on WhatsApp* (news), *Open Cal.com* (tutor, and 3 × *Cal.com* on admin), *Get a free key ↗* (ai-tools), *Invite Friends* (dashboard). · links
- **P2-3 The cookie notice covers "Next" on onboarding at 412 px** for a first-time visitor: Playwright reports `div.cc-cookie` intercepting the click, so the primary action needs a dismiss first. · bg/links
- **P2-4 The offline page offers "Open saved dashboard" to visitors,** which leads into the ungated app shell. · links
- **P2-5 Demo data is never labelled.** `window.CC_DEMO` is only set on 5xx or network failure, so on the static host and on 401/403 the invented data shows with no badge. (Covered by P0-1 and P0-2; listed so the fix covers every page: courses, marketplace, events, competitions, article comments and launchpad all show seeded people and prices.) · dashboards
- **P2-6 Onboarding can't save even when fixed client-side.** The backend `onboardingBody` has no `teaches`, `phone`, `gender`, `goals list` or `heard_about` fields, which the founder's learner and tutor field lists need. · auth
- **P2-7 Signed-in users still see "Join Community" CTAs** (dashboard hero → `signup.html`, which then sends them to onboarding). · links
- **P2-8 The role switcher logic trusts nobody but shows nothing useful:** it hides for single-role users, but `/tutor.html` and `/admin.html` stay reachable by URL (see P0). · auth
- **P2-9 Admin charts need jsDelivr (Chart.js).** In this sandbox they showed "Charts load from jsDelivr… Offline right now"; on flaky mobile data the stats section is empty. Bundle Chart.js locally. · admin

## P3

- Mixed `/x.html` and `x.html` hrefs for the same targets (profile, 404, go and whiteboard use absolute paths; the rest are relative). Harmless, but it doubles the link registry.
- The 404 probe returns a real **404** with the site 404 page (good). `go.html` with no id offers "Browse the Library" to visitors, which is a gated page.
- The `/go/<id>` fallback resolves ids from `localStorage.cc_ext_drafts`, so a local draft can redirect anywhere. Self-only, but worth an allow-list (http/https only).
- The editor pages (ide, problem) have no visible grid: the full-bleed editor covers it. Acceptable, but say so in the bg rule.
