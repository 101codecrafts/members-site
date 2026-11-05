# Round 11 — plans / access / payments: REPORT

**Branches (pushed to github.com/101codecrafts/members-site)**
- Front end: `r11/plans` @ **95a6fd3** (based on main f33b32b)
- Backend: `r11/plans-api` @ **7c08569** (based on backend 3f36f1a)

**Protected preview (front end only):** https://members-site-staging-4lfbqmx1a-101codecrafts-8167.vercel.app (`dpl_BoCRRMDgWtbybViorgN47YHxCRu3`, READY).
- Without the bypass it returns 302, so protection is on. With the fe bypass, `/pricing.html`, `/upgrade.html`, `/js/plans.js`, `/js/access.js` and `/css/plans.css` serve the new code.
- No production, alias, env, protection, domain or billing changes.
- The backend preview was NOT deployed: its new RPCs need migrations that are written but not applied, so it would only return errors.
- On this preview, `/api/v1/plans` is unreachable. The pricing page therefore shows the bundled default catalogue, marked "suggested", and checkout says honestly that payments aren't connected.

## Deliverables
| # | Item | Where |
|---|---|---|
| 1 | Research with sources (Coursera/Udemy/Skillshare/LinkedIn/Brilliant/Duolingo/NetAcad/edX, Preply/italki, Teachable/Thinkific, Gumroad, FTC 16 CFR 465, Flutterwave/MTN/Airtel/Pesapal/DPO) | `work/round11/plans/RESEARCH.md` (+ copies in `api/docs/`, `site/docs/round11/`) |
| 2 | Plans proposal: Learner + Tutor × Free/Standard/Plus/Pro, limits, UGX suggestions, visitor/guest rights, open questions | `work/round11/plans/PLANS.md` |
| 3 | Gating through the shared access contract | `site/src/data/access-policy.json` → `site/js/access.js` (stub with the owner's API); `api/backend/data/access-policy.json` + `lib/access.ts`; DB/RLS in migration 20261105001100 |
| 4 | Pricing page, upgrade/checkout UI, locked-lesson UI, rating gate, marketplace gates | `site/src/pricing.html`, `site/src/upgrade.html`, `site/js/plans.js`, `site/css/plans.css`, hooks in `site/js/pages.js` |
| 5 | `lib/payments`: Flutterwave active (MTN/Airtel MoMo + card); Pesapal and DPO stubs; MTN-direct, Airtel-direct and Payway slots; sandbox-only guards; existing ledger; SR-17 | `api/backend/lib/payments/**`, `services/billing.ts`, migration `create_plan_checkout` / `apply_provider_payment` |
| 6 | Migrations (written, NOT applied), tests, QA, preview, this report | below |

## What the rules do (server = authority)
- **Plans are data.**
  - `plan_tiers` holds limits and features as jsonb; `subscription_plans` holds the monthly and yearly UGX price rows.
  - Admins edit both with `admin_update_plan`, which is audited.
  - Seed prices are flagged `price_is_suggestion` until the founder confirms them.
  - `profiles.plan` is the learner tier and the new `profiles.tutor_plan` is the tutor tier; both are derived from active subscriptions.
  - An upgrade supersedes the old subscription for the same audience. There is no proration.
- **Founder anchors (seed):** Tutor Free has `students.max` = 2. Learner Free has `courses.active` = 1 and `lessons.free_per_course` = 3, with previews always open.
- **Lesson locks:**
  - RLS on `lessons` and `course_media` runs through `app.can_view_lesson`.
  - A per-lesson `min_plan` override exists.
  - Bought courses are fully open, and `courses.all_lessons_free` (admin only) opens a course to every plan.
  - The launch promo means everyone is Pro.
  - `course_syllabus()` returns locked titles so the UI can show them.
- **External courses** are never locked (UI), and nothing in the DB gates them.
- **Caps:** `can_enroll()` gives a readable verdict and `enrollments_plan_guard` enforces it. Both apply `courses.active` and the tutor's `students.max`, counting course learners plus 1:1 bookers.
- **Guests:**
  - `payments_buyer_guard` stops guests buying courses, sessions or plans; they can still buy on the marketplace.
  - Listing triggers stop guests from selling.
  - In the UI, visitors are sent to the auth route with `next`, and guests to "become a learner".
- **Prices:**
  - Tutors can't change `is_free`, `price_ugx` or `all_lessons_free`.
  - Instead they call `request_course_price`, which is capped by the plan's `price.max_ugx`; an admin then runs `decide_course_price`.
  - Admins can also call `admin_set_course_pricing` directly.
- **Ratings (verified only):**
  - `tutor_reviews` needs an enrolment in that course, attendance at that session, or being that tutor's student.
  - `mkt_reviews` needs a delivered order containing the product.
  - The new `item_ratings` (books, resources, external courses, AI tools) needs recorded use (`item_usage`, written by `POST /api/v1/me/item-use`) at least 10 minutes old.
  - Admins can hide a rating but never rewrite it; hides are audited. This follows FTC anti-suppression.
- **Marketplace:**
  - Sellers can't self-publish: products go to `pending_review` and an admin publishes them.
  - The listing count follows `listings.active`.
- **Payments:**
  - `payment_providers` is data. Only the root admin can switch providers, and the CHECK constraint means stubs and slots can never be enabled.
  - `create_plan_checkout` prices plans in SQL. The client sends only audience, tier, interval, method and phone, and zod `.strict()` rejects `amount_ugx`.
  - Fulfilment happens only through the verified webhook (`apply_flutterwave_payment`, or the service-only `apply_provider_payment`, which also moves cash to the provider's ledger account).
- **Sandbox only:**
  - `PAYMENTS_MODE` must be `sandbox`, and Flutterwave keys must start `FLWSECK_TEST-`; both are checked before any network call.
  - DPO also needs `DPO_SANDBOX=true`, and Pesapal is hard-wired to `cybqa`.
  - Every payment row has `mode='sandbox'`.
  - The existing course and marketplace checkouts now call the same sandbox guard.
  - `js/api.js` no longer sends client amounts to Flutterwave.

## New access keys (contract format = owner's: `roles`, optional `plans`, `minor`)
New keys:
- `course.enroll`
- `lesson.view_locked` (plans: standard, plus, pro)
- `rating.create`
- `payment.provider_manage` (root_admin)

Keys reused from the owner's file:
- `course.take_external`, `course.take_free`, `course.take_tutor`, `course.set_price`, `course.set_free`
- `course.rate`, `resource.rate`
- `market.browse`, `market.buy`, `market.sell`
- `session.book`, `account.upgrade`, `plan.upgrade`, `plans.edit`

New limit keys (dotted, to match the owner's file):
- Learner: `courses.active`, `lessons.free_per_course`, `ai.daily`, `projects.active`, `certificates`, `offline`, `sessions.discount_pct`, `sessions.included_monthly`
- Marketplace (both audiences): `listings.active`, `seller.fee_pct`
- Tutor: `students.max`, `courses.published`, `sessions.per_month`, `commission.pct`, `price.max_ugx`, `coupons`, `featured.monthly`, `payout.min_ugx`

**Merge notes for the owner (r11/auth):**
- Keep your `access-policy.json` and `js/access.js`, then fold in the 4 new keys and the `limits` block.
- My stub uses `auth_route=/signup.html` and `home.guest=/courses.html` only because `/auth.html` and `/guest.html` live on your branch. Your values win.
- Your `lessons.preview_only` is superseded by `lessons.free_per_course`, a number.
- Your `students.max` is null for Standard and up; mine is 25, 150 or null by tier. That is a founder question.
- My stub's `build.py` also inlines the policy between the same `/*POLICY*/…/*END*/` markers.

## New endpoints (r11/plans-api)
- `GET /api/v1/plans`
- `GET /api/v1/payments/providers`
- `POST /api/v1/billing/checkout`
- `GET /api/v1/me/entitlements`
- `POST /api/v1/me/item-use`
- `POST /api/v1/ratings`
- `GET /api/v1/courses/{slug}/syllabus`
- `POST /api/v1/tutor/courses/{id}/price-request`
- `GET /api/v1/admin/price-requests`
- `POST /api/v1/admin/price-requests/{id}`
- `PUT /api/v1/admin/payment-providers/{code}` (root)
- `POST /api/v1/webhooks/payments/{provider}`: Flutterwave delegates to the verified handler; other providers return 5xx until they are enabled.

I removed my duplicate `PUT /admin/plans/{audience}/{tier}` and `/admin/courses/{id}/pricing` routes. The r11/admin-api console already owns those paths (with scope checks) and calls my RPCs.

## Migrations (written, NOT applied)
- `supabase/migrations/20261105001000_plan_tiers_enum.sql`: adds `member_plan` + `standard`, `plus` (ordered before `pro`).
- `supabase/migrations/20261105001100_plans_access.sql`: everything above.
  - Two legacy tests changed to the new rules: `rls.test.mjs` (the tutor-progress test now puts Alice on Standard, because Free = 1 course) and `marketplace.test.mjs` (listings need admin publish).
  - The SR-04 anon allow-list is unchanged: `plans_catalogue` is served by the API with the service client, and the syllabus is for signed-in users only.

## Tests and QA
- **DB:** **77/77**, against a local embedded Postgres in a scratch DB `plans_test`, never staging. That is 64 existing tests plus 13 new ones in `supabase/tests/plans.test.mjs`. Log: `work/round11/plans/qa/dbtest.out`.
- **Backend unit:** **22/22** via `npm test`, including the new `tests/plans-payments.test.ts`. `tsc --noEmit` and `eslint .` are clean.
- **Browser QA** (`flock` on the chromium lock, real page code, fixtures for each role, `/api` mocked): **52/53**.
  - Script: `work/round11/plans/qa/plans_qa.py`. Results: `qa/out/plans_qa.json`. 13 screenshots in `qa/out/`.
  - Coverage: pricing at 412/1440 × light/dark, the live catalogue overriding the defaults, CTAs per role, upgrade redirects (visitor, guest, learner asking for a tutor plan), a MoMo phone being required, the network-mismatch warning, **the request body carrying no amount**, opening the server-issued checkout URL, the honest no-backend message, locks per role (learner Free, guest, Standard), lock CTAs, the rating gate, and marketplace sell/buy gates (visitor, guest, learner).
  - **Open (1):** `course.html` at 412px with a locked lesson had a 29px horizontal overflow.
    - I added `.stage-area{min-width:0}`, made the lock panel wrap, and committed in 95a6fd3.
    - I couldn't re-run to confirm: the shared chromium lock was held by other agents' long runs on two tries, so per the brief I stopped there.
    - I also never confirmed whether the overflow already exists on main. Next step: re-run `plans_qa.py`.
- **Fixed during QA:**
  - The rating card was being wiped on lesson switch.
  - Script order: `plans.js` now loads before `pages.js`.
  - A locked lesson's title had low contrast in the active row.

## Open founder questions
1. Are the suggested UGX prices right? Learner 15k / 35k / 75k a month; tutor 25k / 60k / 120k; yearly = 10× monthly.
2. Free lessons: is "first 3 + previews" right, or should tutors pick them per course? (`lessons.min_plan` already supports per-lesson picks.)
3. Proration on upgrade: none (as built), or credit the unused days?
4. "Payway": PayWay Uganda (payway.ug)? We need its merchant API docs and test credentials. It's a slot for now.
5. Should Standard be ad-free (as built), or only Plus and up?
6. Tutor student caps above Free: 25 / 150 / unlimited (mine) or unlimited (the auth stub)?
7. Is the marketplace seller fee by plan (15 / 12 / 10 / 8%) right?
8. Sandbox credentials:
   - Flutterwave test keys (`FLWSECK_TEST-…`) in the staging env.
   - Pesapal demo key/secret plus a RegisterIPN id.
   - DPO sandbox company token.

## Not done / caveats
- Pesapal and DPO verify paths are stubs: they need the provider reference stored at checkout (`payments.provider_ref`, which exists) before they can be wired. MTN-direct, Airtel-direct and Payway refuse to run.
- `types/database.ts` was not regenerated. The new RPCs are called untyped in `services/billing.ts`. Regenerate after the migration is applied.
- OpenAPI spec not regenerated.
- The service-worker cache version was not bumped (to avoid merge conflicts). Bump it at merge.
- The admin UI for price requests and provider switches is on r11/admin, which consumes these RPCs.
- The account Settings "plan" panel is the owner's/profile agent's job. `GET /api/v1/me/entitlements` gives it what it needs.
