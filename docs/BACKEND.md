# 101 Codecrafts — Backend

API-first backend for the members site, PWA and future native apps.

| Layer | Choice |
|---|---|
| API | Next.js App Router route handlers in `backend/app/api/v1/**` (Vercel, Node runtime, region `cdg1`) |
| Database | Supabase Postgres — schema, RLS, business rules and money logic live in SQL (`supabase/migrations`) |
| Auth | Clerk (sessions, MFA, social). Supabase sees the Clerk JWT (`sub` = user id) via third-party auth |
| Payments | Flutterwave (MTN / Airtel Mobile Money, cards) — one double-entry ledger |
| Email | Resend (transactional + digests) |
| Jobs | Vercel Cron → `/api/v1/cron/*` (Bearer `CRON_SECRET`) |
| AI | Vercel AI Gateway first, then OpenRouter `:free`, Groq, Gemini (server-side keys only) |
| Judge | Self-hosted Judge0 CE (`JUDGE0_URL`) behind a pluggable `Runner` |
| Meetings | Jitsi Meet by default; Google Meet / Zoom / Teams via the tutor's OAuth |

## Architecture

```
client (web / PWA / Expo) ──► /api/v1/* route handler
                                 │  lib/http.route(): CORS, rate limit, zod validation, {data}|{error} envelope, request id
                                 │  lib/auth: Clerk session verified on EVERY call → RLS-scoped Supabase client (acts as the user)
                                 ▼
                        Supabase Postgres (RLS on every table)
                                 ▲
   services/* (server-only) ─────┘  service-role client ONLY in webhooks, cron, judge, AI metering, privacy jobs
```

"Enforced twice": `lib/rbac.ts` (route level) **and** Postgres RLS + SECURITY DEFINER RPCs (row level). The service-role client may only be imported from `services/` (ESLint `no-restricted-imports`).

### Migrations (apply in order)
`foundation → identity → learning → projects_catalog_news → events_sessions_groups → community → commerce_ledger → growth_engagement → levels_safety_launchpad → course_media_errors → platform_admin → analytics → rls_policies_grants → external_courses → ads_settings → launch_promo → storage_realtime → security_hardening → practice_articles → marketplace_v2 → ai_tools_usage → community_platform → activity_reactions → (r11) auth_roles → plan_tiers_enum → plans_access → admin_console`

Rules every migration follows (checked in CI):
- RLS enabled in the **same** migration that creates a table; `select app.enable_rls_all()` at the end; a test fails if any table in `public/app/analytics` lacks RLS (and a meta-test proves the guard catches one).
- Every table has at least one policy (service-only tables get an explicit `using (false)` policy).
- No implicit grants: global `alter default privileges … revoke execute on functions from public` (SR-04); each migration `revoke all … from anon, authenticated` then grants exactly what is needed. **New user-callable RPCs must be granted explicitly** (`grant execute … to authenticated`), and service-only RPCs to `service_role`.
- Service-only functions start with `perform app.require_backend()` (trusted caller check that ignores definer context, SR-03).

### Domains
| Domain | Tables (main) | Notes |
|---|---|---|
| Identity / RBAC | profiles, profile_private, user_roles, tutor_profiles, guardian_consents | Minors: guardian consent before activation |
| Learning | courses, lessons, enrollments, progress, certificates, course_media | |
| Practice (GfG-style) | practice_topics, articles(+versions), problems, problem_editorials, problem_hints, test_cases, submissions, contests(+problems, registrations), plagiarism_flags, problem_of_the_day, practice_stats, practice_solved, quizzes, quiz_questions, quiz_answer_keys, quiz_attempts, interview_sets, bookmarks | Hidden tests + answer keys never client-readable; editorial/hints/AI solutions locked while a problem is in an upcoming/live contest |
| Marketplace v2 | mkt_stores(+private KYC), mkt_products, mkt_variants, mkt_price_tiers, mkt_digital_assets, mkt_categories, mkt_cart_items, mkt_wishlist, mkt_coupons, mkt_shipping_zones, mkt_pickup_points, mkt_order_groups, mkt_orders, mkt_order_items, mkt_order_events, mkt_reviews, mkt_questions, mkt_disputes, mkt_rfqs, mkt_rfq_quotes, external_products(+clicks) | Escrow in the ledger (below) |
| Commerce / ledger | payments, ledger_accounts, ledger_transactions, ledger_entries, refunds, payouts, coupons, subscriptions | Balanced by trigger; immutable |
| AI | ai_tools, ai_usage, ai_moderation_events | Never stores users' API keys |
| Meetings | meetings, meeting_private, meeting_oauth_tokens, meeting_attendance | Links + tokens service-only |
| Community | announcements(+reads), opportunities(+saves), events(+registrations), external_events, news_items, groups, posts, messages | |
| Security | email_domain_rules, security_events, email_fingerprints, audit_log, rate_limits | |

### Money flow
- `create_checkout` / `mkt_checkout` compute **amount and tx_ref in the database** (SR-17); the client only opens Flutterwave's hosted link. Fulfilment happens only in the verified webhook (`apply_flutterwave_payment`, service role) which re-checks amount/currency.
- Courses/tickets/sessions: cash → commission revenue + tutor payable (or Flutterwave split subaccount).
- Marketplace: cash → `platform:escrow_marketplace` (liability) on payment. Release on buyer confirmation or automatically `marketplace.escrow_days` (7) after delivery with no open dispute (`/api/v1/cron/marketplace`): escrow → commission revenue + vendor payable. Disputes block release; admin refund moves escrow → `platform:refunds_payable` (MoMo refund execution via Flutterwave: TODO).
- Payout hold ≥ refund window (SR-14), enforced in `admin_set_setting` and `available_balance`.

## RBAC matrix (summary — source of truth `backend/lib/rbac.ts` + RLS)

| Resource | anon | learner | tutor / vendor | admin | super_admin |
|---|---|---|---|---|---|
| Courses, lessons | public | enrolled | own (cannot self-publish) | all | all |
| Articles | published | own drafts → submit for review | same | publish / reject | same |
| Problems / editorials | published (not contest-locked) | same + own submissions | same | all incl. hidden tests | same |
| Contests | published | register, submit in window | same | create, plagiarism review | same |
| Quizzes | questions only | attempt (graded server-side) | same | answer keys | same |
| Marketplace products | published from KYC-verified stores | buy, review (verified purchase), Q&A, RFQ | own store/products/orders (publish needs KYC) | KYC, disputes | same |
| Orders | — | own | orders of own store | all | all |
| Payments / wallet | — | own | own + earnings | read all | money settings, big payouts |
| AI | catalogue | chat/hint/explain/debug within daily quota | same | usage + moderation log | same |
| Meetings | — | join if paid/enrolled (minors: guardian + verified tutor) | create for own sessions/events/groups | all | all |
| Opportunities / external events | published (minors: age-appropriate) | submit (moderated), save | same | approve | same |
| Announcements | public, published | targeted, published | same | drafts, schedule | same |
| Roles | — | — | — | — | grant/revoke admin |
| Email domain rules, security events | — | — | — | manage / read | same |

## Round 11 · Admin console (`20261105001200_admin_console.sql`, branch r11/admin-api)
- **Root (`root_admin`) = only 101codecrafts@gmail.com.** `backend_bind_root(user, verified_email)` (service role, called by `GET /api/v1/admin/me` after Clerk confirms the verified email; also auto-binds on the first privileged `super_admin` grant to the verified root-email account) stores the Clerk id in `app.root_identity`. DB triggers stop anyone (admins, service role, postgres, cascades) from demoting, suspending, deleting or removing root. Break-glass rebind: SQL editor only, `set local app.break_glass = 'rebind-root'`.
- **Scoped admins:** `admin_grants(user_id, scopes[], status)`. Scopes: approvals, users, plans, flags, audit, stats, support_view, payments, moderation, content, settings. `app.require_scope()` in every new admin RPC. Suspended admins fail `app.is_admin()` everywhere. Admins without a grant row (legacy) keep every non-root scope. Root-only: `admin_invite` (sha256-hashed token, 7 days) → `backend_accept_admin_invite` (verified email must match; adults only), `admin_set_scopes`, `admin_set_admin_status`, `admin_remove_admin`.
- **Approval queue:** `review_submissions` (kinds: course, lesson, book, link, video, project, campaign, event, listing). `submit_for_review` (learners/tutors, owner-checked) → `services/link-check.ts` (static checks, YouTube oEmbed, Google Web Risk / Safe Browsing when keyed, else `not_scanned`) → `admin_review_queue` / `admin_decide_submission(approve | reject | request_changes)` with a required reason, fixes list, submitter notification and before→after audit. A blocked link can't be approved; high/unchecked links need an override note; no self-review. `is_approved(kind, ref)` is the "public only after approval" check for other areas. Price changes come from the plans branch's `course_price_requests` and are merged into the same queue.
- **Users:** `admin_search_users` (roles incl. guest/root_admin, plan, minor, guardian state), `admin_set_user_role` (learner/tutor only), `admin_set_user_status`, `admin_set_user_plan` (profiles.plan / tutor_plan), `admin_revoke_guardian`.
- **Audit:** `audit_log` is append-only for every caller (trigger). `app.audit_change()` writes old→new. `admin_audit_search` (scope audit).
- **Support view:** `admin_start_support_view(target, reason)` → 30-min session, user notified. `admin_support_snapshot(session)` is a read-only snapshot and every read is audited. Root can't be viewed, and admins only by root. No user token is ever minted.
- Env (optional): `WEB_RISK_API_KEY`, `SAFE_BROWSING_API_KEY`.
- Routes: `/api/v1/admin/{me,stats,admins,admins/[id],invites/[id],invites/accept,approvals,approvals/[id],approvals/[id]/recheck,people,people/[id],plans,plans/[audience]/[tier],courses/pricing,courses/[id]/pricing,flags,audit-log,support-view,support-view/[id]}`, `/api/v1/submissions[/id]`.

## Environment variables

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `CRON_SECRET` (≥16 chars).

| Group | Variables |
|---|---|
| App | `APP_URL`, `ALLOWED_ORIGINS`, `NODE_ENV`, `LOG_LEVEL`, `HASH_SALT` (≥16 chars), `REQUIRE_MFA_FOR_STAFF` |
| Flutterwave | `FLW_PUBLIC_KEY`, `FLW_SECRET_KEY`, `FLW_SECRET_HASH` (webhook verif-hash), `FLW_PAYOUT_CALLBACK_URL` |
| Payout encryption | `PAYOUT_ENCRYPTION_KEY` (32-byte base64), `PAYOUT_ENCRYPTION_KEY_ID` |
| Resend | `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_AUDIENCE_ID` |
| AI | `AI_GATEWAY_API_KEY`, `AI_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_FREE_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL` |
| Judge | `JUDGE0_URL` (self-hosted Judge0 CE — never a public shared instance), `JUDGE0_AUTH_TOKEN` |
| Meetings (TODO) | `JITSI_DOMAIN` (default `meet.jit.si`), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (scope `calendar.events`), `ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET`/`ZOOM_WEBHOOK_SECRET`, `MS_CLIENT_ID`/`MS_CLIENT_SECRET` (`OnlineMeetings.ReadWrite`), `MEETING_TOKEN_KEY` (32-byte base64) |
| Events | `TICKET_HMAC_SECRET` (≥32 chars) |
| Other | `GITHUB_TOKEN`, `GOOGLE_BOOKS_API_KEY`, `EXPO_ACCESS_TOKEN`, `SENTRY_DSN` |

Generate keys: `openssl rand -base64 32`.

## Deploy

### 1. Supabase
1. Create a project (region closest to users, e.g. `eu-west`). Settings → API: copy URL, anon key, service-role key.
2. Authentication → Third-party auth → add **Clerk** (domain of your Clerk instance) so Clerk JWTs are accepted; RLS reads `auth.jwt()->>'sub'`.
3. `supabase link --project-ref <ref>` then `supabase db push` (applies `supabase/migrations` in order). Optionally `psql < supabase/seed.sql` on staging only.
4. Storage buckets are created by migrations (`marketplace-private` etc.). Do not make private buckets public.

### 2. Clerk
1. Create the application; enable email + Google sign-in; enable MFA (required for staff when `REQUIRE_MFA_FOR_STAFF=true`).
2. **Restrictions → enable "Block disposable email addresses" and "Block email subaddresses" (+tags).** The server enforces the same again (below).
3. Webhooks → endpoint `https://<domain>/api/v1/webhooks/clerk`, events `user.created`, `user.updated`, `user.deleted`; copy the signing secret to `CLERK_WEBHOOK_SIGNING_SECRET`.
4. JWT template / session token must include `sub` (default).

### 3. Flutterwave (test mode first)
1. Dashboard → switch to **Test mode** → Settings → API keys: `FLW_PUBLIC_KEY`, `FLW_SECRET_KEY`.
2. Settings → Webhooks: URL `https://<domain>/api/v1/webhooks/flutterwave`, set a secret hash → `FLW_SECRET_HASH`.
3. Test with Uganda mobile-money test numbers from Flutterwave docs; confirm payments → ledger balanced (`select sum(...) from ledger_entries` = 0).
4. Go live only after the security checklist in `docs/SECURITY_REVIEW.md` is green.

### 4. Vercel
1. Import the repo, **Root directory `backend/`**, framework Next.js. Add all env vars (Production + Preview).
2. Crons are in `backend/vercel.json` (daily, news, event-reminders, link-check, practice, marketplace, community at 06:00 EAT). Hobby allows daily crons only; sub-daily jobs (15-min meeting reminders, judge retries) need Pro, Supabase `pg_cron`, or a GitHub Actions schedule calling the cron URL with `CRON_SECRET`.
3. Optional: Vercel AI Gateway key → `AI_GATEWAY_API_KEY`.

## Sign-up email guard (temp-mail blocking)
Defence in depth behind Clerk's restrictions:
1. `POST /api/v1/auth/email-check` pre-check (rate-limited 10 / 10 min per IP) before sign-up, email change or invite.
2. Clerk `user.created` / `user.updated` webhook runs `services/email-guard.checkEmail`: admin **allow** rule wins (e.g. `students.cavendish.ac.ug`) → admin **deny** rule → pinned **disposable-email-domains** list (`backend/data/disposable_email_blocklist.conf`, upstream commit `fe48a30`, refreshed by the weekly `refresh-disposable-domains` PR workflow) → **no MX** record (DNS errors never block) → **duplicate canonical mailbox** (Gmail dots / `+tags` collapsed; only a salted hash is stored). Blocked users are deleted (created) or banned (updated) in Clerk and logged to `security_events`.
3. Admin: `GET/POST/DELETE /api/v1/admin/email-domains`, `GET /api/v1/admin/security-events`.

## Testing / CI
```
cd backend && npm ci
npx tsc --noEmit && npx eslint . && npm test          # unit tests (CSV formula escaping, email guard)
DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres node ../supabase/tests/run.mjs   # migrations from scratch + RLS/business tests
node scripts/gen-openapi.mjs > ../docs/openapi.json   # regenerate the OpenAPI spec
DATABASE_URL=…/ccx_test node scripts/gen-types.mjs > types/database.ts                    # regenerate DB types
```
The DB suite covers RLS on every table, SR-00…SR-18 regressions (`supabase/tests/security.test.mjs`), practice, marketplace escrow, AI quotas and the community platform.

## API
OpenAPI 3.1: `docs/openapi.json` (generated from the route tree; `x-auth` marks public/user/member/tutor/admin/cron). Envelope: `{ data }` or `{ error: { code, message, request_id } }`.
Main groups: `/api/v1/practice/*`, `/api/v1/articles/*`, `/api/v1/marketplace/*`, `/api/v1/ai/*`, `/api/v1/ai-tools`, `/api/v1/meetings/*`, `/api/v1/events/*`, `/api/v1/opportunities/*`, `/api/v1/announcements/*`, `/api/v1/admin/*`, `/api/v1/webhooks/*`, `/api/v1/cron/*`.

### AI quota API for other features (ai-features branch)
Server code wraps any model call with `reserveAi(userId, feature, estTokens)` → provider call → `commitAi(usageId, status, usage)` from `services/ai.ts` (or uses `runAi(session, feature, messages)` which adds moderation). `userId = null` = quota-free system job (news summaries). Quotas: `site_settings.ai.quotas` (free / pro / minor per Africa/Kampala day); launch promo counts as Pro. `GET /api/v1/ai/quota` for the UI.

## Open TODOs
- Judge0: deploy self-hosted Judge0 CE, set `JUDGE0_URL`; confirm language ids against `GET /languages`.
- Meetings: create Google/Zoom/Microsoft OAuth apps + connect/callback routes that store tokens encrypted (`meeting_oauth_tokens`); token refresh; fan-out of 24h/15m reminders + `.ics` to participants.
- News ingest v2 (RSS/Atom: TechCrunch, The Verge, Ars Technica, HN API, TechCabal, Techpoint Africa, Disrupt Africa, Nile Post tech, Google/OpenAI/Hugging Face blogs) with canonical-URL dedupe and gateway summaries (quota-free system job) — schema exists (`news_items`), ingestion extension pending.
- Opportunities / events feed ingestion (Opportunity Desk, Opportunities For Africans, After School Africa, BrighterMonday/Fuzu, GDG Bevy, Luma, Meetup, Eventbrite, MLH, Devpost): **TODO-CONFIRM** feed URLs and terms/robots; link out only.
- Marketplace: Flutterwave refund execution for `refunds_payable`; affiliate tags once programmes approve; vendor payouts reuse `request_payout`.
- AI: add a model-based moderation pass via the gateway (regex guard is the first line only).
