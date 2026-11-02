# Security review — 101 Codecrafts members site

Reviewer: Goldfish security review (zero prior context) · Branch: `security` · Date: 2026-11-02 (EAT)
Companion docs: [`THREAT_MODEL.md`](THREAT_MODEL.md) · [`../SECURITY.md`](../SECURITY.md) · [`../security/vercel.headers.json`](../security/vercel.headers.json)

## 0. What was actually reviewable

| Surface | State on GitHub at review time (`origin`, polled 16:11–16:45 EAT) | What I reviewed instead |
|---|---|---|
| `main` (front end) | Only `Initial commit 18845d8` (README, LICENSE, .gitignore). Nothing pushed. | The front-end engineer's **unpushed** working copy: `index.html`, `dashboard.html` (learner), `tutor.html`, `admin.html`, `js/{api,ui,admin,tutor,data,motion}.js` (backend calls are stubs falling back to placeholder data). |
| `backend` | **Branch does not exist on origin.** | The backend engineer's **unpushed** working copy of `supabase/migrations/0100–0700` (0700 = commerce ledger, payments, payouts, refunds, coupons; 0800 = growth, DPPA export/erase, referrals) (rewrite with learner/tutor/admin/super_admin roles), run in a local Postgres 18 (PGlite) lab with a Supabase shim. An earlier draft (v1, member/mentor roles, migrations 0100–1000 incl. RLS + storage) was read line by line before it was replaced; findings that the rewrite already fixed are listed in §4. |
| `docs/BACKEND.md` RBAC matrix, RLS tests | Not written yet (no `docs/` dir; `supabase/tests/rls.test.mjs` is a 25-byte stub). | Matrix audit **not possible yet** — see §3 for the matrix the policies must satisfy and the escalation suite to run against it. |
| Next.js route handlers, Clerk/svix + Flutterwave webhooks, Resend, Vercel Cron, `/api/resources/unfurl`, `/go/[id]` | No code anywhere (pushed or local). | Requirements + reference fixes only (§5). **Marked NOT REVIEWED.** |

> Because nothing is on `origin`, file:line references below point at the engineers' local working copies and **will drift**. Re-run the lab (§6) against the pushed `backend` branch before go-live.

### Severity counts (findings on code that exists)

| Critical | High | Medium | Low | Info |
|---:|---:|---:|---:|---:|
| 2 | 2 | 9 | 9 | 3 |

Accessibility findings are counted separately in §7 (WCAG 2.2 AA: 2 fail-level, 3 risk-level).

---

## 1. Findings table

| ID | Sev | File:line (working copy) | Issue | Fix |
|---|---|---|---|---|
| SR-00 | **Critical** (go-live blocker) | `…/20261102000700_commerce_ledger.sql:613-731, 769-856` (+ no `revoke execute` anywhere) | Service-role-only money functions are **executable by every learner**: `apply_flutterwave_payment`, `set_payment_checkout_link`, `complete_refund`, `mark_payout_processing`, `complete_payout`, `record_subscription_renewal` (Supabase grants EXECUTE on new `public` functions to `anon`/`authenticated`; the comments say "service-role only" but nothing enforces it). **Lab PoC:** learner runs `create_checkout('course', <paid course>)`, then `select public.apply_flutterwave_payment('<own tx_ref>', 424242, 'successful', 50000, 'UGX')` → payment `successful`, enrollment `active`, and the tutor's ledger is credited **UGX 40,000** with no money received. A colluding tutor+learner pair can then `request_payout` real cash after the hold window. | Revoke from everyone, grant to `service_role` only, **and** assert inside each function (snippet G). Add the E3/E5 lab cases to CI. |
| SR-00b | **Critical** (go-live blocker) | `…/20261102000800_growth_engagement.sql:421-447` `public.erase_user(p_user, p_actor)` | SECURITY DEFINER, **no authorization check**, executable by `anon` under default grants. **Lab PoC:** anonymous `select public.erase_user('user_victim')` → victim's `profile_private` deleted, messages/posts overwritten, payout methods erased. Same root cause as SR-00; `attach_referral(p_referred, …)` likewise lets any caller attach referrals for **other** users (referral-reward fraud). | `erase_user`: service-role only (snippet G) **plus** `if not (app.is_privileged() or app.is_admin()) then raise …`; self-erasure goes through `data_requests` + admin/cron. `attach_referral`: drop `p_referred`, use `app.requesting_user_id()`, only within N hours of sign-up, once per user. |
| SR-01 | **High** (go-live blocker) | `supabase/migrations/20261102000100…0700_*.sql` — every `create table` | 53 tables (after migration 0700) are created **without RLS**; RLS is deferred to a later migration that does not exist yet. With Supabase's default grants, the anon key can read/write them. Lab proof: `anon` read all 6 `profile_private` rows (emails/phones) and both `payout_methods` rows; tutor A **updated** tutor B's payout method (`E2`, `E4e/f`). | Enable RLS in the same migration that creates each table, and fail CI if any table lacks it (snippet A). |
| SR-02 | **High** | `…/20261102000500_events_sessions_groups.sql:157` (`tutor_sessions.meeting_url`), `:37` (`event_private` ok) | Paid-session join link sits in the catalog table. Any SELECT policy that lets learners browse sessions leaks `meeting_url` to non-payers, bypassing `session_join_info()`. | Move to `tutor_session_private(session_id pk, meeting_url)` with RLS (tutor/admin/confirmed booking), or `revoke select (meeting_url) on tutor_sessions from anon, authenticated` (snippet B). |
| SR-03 | Medium | `…0100_foundation.sql:65-68` `app.is_privileged()` | Trust is `current_user in ('service_role','postgres',…)`. Inside **every** SECURITY DEFINER function `current_user = postgres`, so all guard triggers (`guard_profile_update`, `guard_user_roles`, `guard_tutor_profile`…) are bypassed by any definer RPC. One definer RPC that writes a user-supplied column = privilege escalation. | Distinguish *trusted caller* from *definer context* (snippet C), and keep every user-callable definer RPC doing its own `app.is_admin()`/ownership check first. |
| SR-04 | Medium | all migrations (no `alter default privileges`) | Supabase grants EXECUTE on new `public` functions and ALL on new tables to `anon`/`authenticated`. Lab: `public.my_access` and `public.session_join_info` are executable by `anon`. Any future admin RPC is public until someone remembers to revoke. | `alter default privileges … revoke` (snippet D) at the top of the first migration, then grant per function. |
| SR-05 | Medium | `…0200_identity.sql:134-152` `payout_methods` | Comment says "written by the server only" but there is no guard trigger; protection depends entirely on the missing RLS. Ciphertext column would be returned to the browser by `select *`. | RLS: tutor `select` own rows only, no client insert/update/delete; `revoke select (account_ciphertext) … from authenticated`; key in Vercel env only, rotate-able (key id prefix in ciphertext). |
| SR-06 | Medium | `.github/workflows` (none on any branch) | No CI security gates existed. | Added `.github/workflows/security.yml` (CodeQL, Gitleaks, TruffleHog, npm audit, OSV) and `dependabot.yml` on `security`. |
| SR-07 | Medium | v1 `…0600_community.sql` `flag_autohide` (carried into rewrite `:277-294`) | 3 reports auto-hide any post: 3 colluding / sock-puppet learners can silence anyone. | Count only reporters with account age > N days, weight tutor/admin reports, and notify staff; never auto-hide staff/announcement content. |
| SR-08 | Medium | Storage (v1 `…1000_storage_realtime.sql:14-15`; not yet in rewrite) | `project-files` / `listing-files` buckets had `allowed_mime_types = null` → HTML/SVG uploads served from `*.supabase.co`. `course-media` was public **and listable by anon** — paid course videos downloadable without paying. | Explicit MIME allow-lists (no `text/html`, `image/svg+xml`); paid media in a private bucket gated by `app.is_enrolled()`; drop `select` policy on public buckets (public download does not need it). |
| SR-09 | Low | `…0500…:256-268` `session_join_info` | Distinct `not found` vs `not booked` errors allow session-ID probing. | Return one generic error. |
| SR-10 | Low | v1 `profiles_select` | `last_seen_at`, `email_opt_in` readable by anon on public profiles (DPPA s.14 minimality). | Public `profiles_public` view (security_invoker) with display fields only. |
| SR-11 | Low | v1 `payments.raw`, `webhook_events.payload` | Full Flutterwave / Clerk payloads (email, phone, card BIN/last4, IP) kept forever. | Store only needed fields; purge payloads after 30–90 days in the daily cron (DPPA s.18). |
| SR-12 | Low | v1 `…0800_platform.sql` `search_all` | `ilike '%'||q||'%'` without escaping `%`/`_` (not injection; wildcard abuse/slow scans). | `replace(replace(q,'%','\%'),'_','\_')` or use trigram index. |
| SR-13 | Low | v1 Realtime publication (`messages`, `notifications` with `replica identity full`) | Postgres Changes cannot RLS-filter DELETE events; deleted row PKs reach every subscriber of the table. | Soft-delete (UPDATE `deleted_at`) instead of DELETE on realtime tables; subscribe with filters. |
| SR-14 | Medium | `…0700:450-464` `available_balance` (hold default 7 d) vs `request_refund` (window default 14 d) | Tutor earnings become withdrawable **before** the learner's refund window closes; a refund after payout drives the tutor payable negative = platform loss (or deliberate cash-out-then-refund fraud with a sock-puppet learner). | `payouts.hold_days >= refunds.window_days` (enforce in `app.setting` validation), and block payout while the tutor has any negative/clawback balance. |
| SR-15 | Low | `…0700:563-569` `create_checkout` | Coupon redemption is recorded when checkout **starts**; abandoned checkouts consume `max_redemptions` until a failure webhook arrives (coupon exhaustion by sock-puppets). Also no capacity check for paid `event_ticket`/`tutor_session` → paid but over capacity. | Count redemptions on `successful`; add capacity check under `for update`; rate limit `create_checkout` per user. |
| SR-16 | Low | `…0700:655-731` `apply_flutterwave_payment` | Function trusts the caller to pass the *verified* Flutterwave data; it does not check that `p_flw_id` belongs to `p_tx_ref`. | Route handler must use `tx_ref`, `amount`, `currency`, `status` **from the `/transactions/{id}/verify` response** (snippet E), never from the webhook body. |
| SR-17 | Medium | `members-site/js/api.js:119-122` `flutterwaveCheckout` | Inline checkout takes `amount` and `tx_ref` from the page (`txRef \|\| "cc-"+Date.now()`). Anyone can open the modal with UGX 1 and an arbitrary tx_ref. | Only open checkout with the `tx_ref`/`amount` returned by server `create_checkout`; the webhook already compares to the stored amount — keep it that way and never fulfil from the client `callback`. |
| SR-18 | Medium | `members-site/js/api.js:166-170` `toCSV` | Admin CSV exports (users, transactions, audit) don't neutralise formulas: a display name like `=HYPERLINK("http://evil","click")` executes in Excel/Sheets on the admin's machine (CWE-1236). | Prefix cells starting with `= + - @ \t \r` with `'`: `const s=String(v??""); const safe=/^[=+\-@\t\r]/.test(s)?"'"+s:s;` |
| SR-19 | Low | `members-site/js/ui.js:94-95` `socialRow` | `href="${esc(l.url)}"` escapes HTML but allows `javascript:` URLs (admin-editable social links → stored XSS on every page if an admin account is phished). | Allow only `https:` (`new URL(u).protocol === "https:"`) client- and server-side. |
| SR-20 | Low | `members-site/js/admin.js:9-63` | Most `innerHTML` templates use `esc()` ✅, but some values are interpolated raw (`${x.key}`, `${x.m}`/`${x.d}`, `data-id="${r.id}"`, `id="role-${u.id}"`). Server data today, but one schema change away from XSS in the admin console. | Escape every interpolation, or build rows with `textContent`. Admin pages are static files reachable by anyone — fine only because the API enforces roles; never rely on hiding `admin.html`. |
| SR-I3 | Info | `*.html` CDN tags | **SRI verified**: gsap 3.13.0, chart.js 4.4.6, lenis 1.3.4 hashes match the jsDelivr files (sha384 recomputed). One inline `<script>` per page and an inline `onerror=` attribute need CSP hashes (`'sha256-…'`, `'unsafe-hashes'`) before CSP is enforced. CSP proposal narrowed to `cdn.jsdelivr.net`. |
| SR-I1 | Info | front-end working copy | three.js, Cal.com, Chatwoot are not on any page yet — SRI/CSP for them pending. | Same pattern as gsap (snippet F); evergreen vendor scripts contained by CSP. |
| SR-I2 | Info | repo settings | Private vulnerability reporting not confirmed enabled; my account (`bd197412-maker`) has **read-only** access, so this branch could not be pushed (see final note). | Enable PVR; grant the security reviewer push to `security` or install the Hark GitHub App on the org. |

### Fix snippets

**G — lock service-role money functions (SR-00)**
```sql
revoke execute on function public.apply_flutterwave_payment(text,bigint,text,numeric,text,text,jsonb),
  public.set_payment_checkout_link(text,text), public.complete_refund(uuid,boolean,bigint,text,jsonb),
  public.mark_payout_processing(uuid,bigint), public.complete_payout(text,boolean,text,jsonb),
  public.record_subscription_renewal  -- (full signature)
  from public, anon, authenticated;
grant execute on function public.apply_flutterwave_payment(text,bigint,text,numeric,text,text,jsonb) to service_role;  -- etc.
-- belt and braces, first line of each body:
if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and not (auth.jwt() is null and session_user = 'postgres') then
  raise exception 'service role only' using errcode = '42501';
end if;
```
Note `create_checkout` calls `apply_flutterwave_payment` for 100 % coupons; move that path into a private `app.apply_payment_internal()` so the public wrapper can stay service-role only.

**A — RLS in the same migration + CI guard (SR-01)**
```sql
create table public.payout_methods ( … );
alter table public.payout_methods enable row level security;
alter table public.payout_methods force row level security;   -- owner too (defence in depth)

-- last migration / CI check (fails the deploy if any table is open)
do $$ declare t text; begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ') into t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and n.nspname in ('public','app','analytics') and not c.relrowsecurity;
  if t is not null then raise exception 'RLS disabled on: %', t; end if;
end $$;
```
Optional belt-and-braces event trigger: `create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE') execute function app.enable_rls_on_new_tables();`

**B — keep join links out of catalog reads (SR-02)**
```sql
create table public.tutor_session_private (
  session_id uuid primary key references public.tutor_sessions(id) on delete cascade,
  meeting_url text check (meeting_url ~ '^https://'));
alter table public.tutor_session_private enable row level security;
create policy tsp_read on public.tutor_session_private for select to authenticated using (
  app.owns_session(session_id) or (select app.is_admin()) or exists (
    select 1 from public.session_bookings b where b.session_id = tutor_session_private.session_id
      and b.learner_id = (select app.requesting_user_id()) and b.status in ('confirmed','attended')));
alter table public.tutor_sessions drop column meeting_url;
```

**C — trusted-caller check that survives definer context (SR-03)**
```sql
create or replace function app.is_privileged() returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'                         -- server with service key
      or coalesce(current_setting('app.trusted_op', true), '') = 'on'                  -- set by audited definer RPCs only
      or (auth.jwt() is null and session_user in ('postgres','supabase_admin'))        -- migrations / SQL editor
$$;
-- inside an admin RPC, AFTER its own authorization check:
--   if not app.is_admin() then raise exception 'admins only' using errcode='42501'; end if;
--   perform set_config('app.trusted_op', 'on', true);   -- transaction-local
```

**D — no implicit grants (SR-04)**
```sql
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
-- then, per function:
grant execute on function public.session_join_info(uuid) to authenticated;
```

**E — Flutterwave webhook (for when the handler exists)**
```ts
// app/api/webhooks/flutterwave/route.ts
import { timingSafeEqual } from 'node:crypto';
export async function POST(req: Request) {
  const sig = Buffer.from(req.headers.get('verif-hash') ?? '');
  const exp = Buffer.from(process.env.FLW_SECRET_HASH!);
  if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) return new Response('bad sig', { status: 401 });
  const evt = await req.json();
  const id = Number(evt?.data?.id); if (!Number.isSafeInteger(id)) return new Response('bad id', { status: 400 });
  // never trust the body: re-verify with Flutterwave
  const v = await fetch(`https://api.flutterwave.com/v3/transactions/${id}/verify`,
    { headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }, cache: 'no-store' }).then(r => r.json());
  const d = v?.data;
  await supabaseAdmin.rpc('apply_flutterwave_payment', {           // idempotent, compares amount/currency to stored row
    p_tx_ref: d.tx_ref, p_flw_id: d.id, p_status: d.status, p_amount: d.amount, p_currency: d.currency });
  return new Response('ok');
}
```
Clerk: `new Webhook(process.env.CLERK_WEBHOOK_SIGNING_SECRET!).verify(await req.text(), { 'svix-id', 'svix-timestamp', 'svix-signature' })`, insert `svix-id` into `webhook_events (provider,event_id)` unique → duplicate = 200 no-op. Cron: `if (req.headers.get('authorization') !== \`Bearer ${process.env.CRON_SECRET}\`) return 401`.

**F — CDN pinning (when scripts are added)**
```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js"
        integrity="sha384-<compute: curl -s URL | openssl dgst -sha384 -binary | openssl base64 -A>"
        crossorigin="anonymous" referrerpolicy="no-referrer"></script>
```
Clerk, Cal.com (`embed.js`), Chatwoot (`sdk.js`) and Flutterwave (`v3.js`) are evergreen scripts and **cannot** carry SRI; contain them with the CSP host allow-list and keep secrets out of the page.

---

## 2. Secret scanning (TruffleHog + Gitleaks), full history, every branch

| Command | Target | Result |
|---|---|---|
| `git clone --mirror https://github.com/101codecrafts/members-site.git && git for-each-ref` | origin | 1 ref (`refs/heads/main 18845d8`), 1 commit total |
| `gitleaks git --redact --log-opts="--all" ms-mirror` (v8.21.2) | all refs | **no leaks found** (1 commit) |
| `trufflehog git https://github.com/101codecrafts/members-site.git --only-verified --no-update --json` (v3.99.7) | all branches | **0 verified** (4 chunks, 3,469 bytes) |
| `trufflehog git … --results=verified,unverified,unknown --no-update --json` | all branches | **0 unverified / unknown** |
| `gitleaks dir <front-end WIP>` + `trufflehog filesystem <WIP> --results=verified,unverified,unknown` | unpushed working copies (early warning) | 0 / 0 |
| `gitleaks dir .` on `security` branch before commit | this branch | no leaks |

Both scanners are now in `.github/workflows/security.yml`: Gitleaks over `--all` history (pinned binary + SHA-256), TruffleHog with `--only-verified --fail` (blocks) plus an unverified/unknown pass that reports to the job summary.

## 3. Authorization (RBAC) audit: learner / tutor / admin / super_admin

`docs/BACKEND.md` does not exist yet, so the matrix could not be diffed. This is the matrix the policies must implement; each row has an executable case in the lab (§6).

| Resource | anon | learner | tutor (verified) | admin | super_admin |
|---|---|---|---|---|---|
| own profile (safe columns) | – | R/W | R/W | R/W any | R/W any |
| `account_status`, `joined_at`, `member_number` | – | ✗ | ✗ | via admin RPC | via admin RPC |
| `user_roles` | – | R own | R own | R all; grant learner/tutor | grant/revoke admin |
| `profile_private` (email/phone) | ✗ | own | own | all (audited) | all (audited) |
| `tutor_profiles` public fields | R verified | R verified | R/W own (not verification/rating/commission) | all | all |
| `payout_methods` | ✗ | ✗ | R own (no ciphertext); write via server | R (no ciphertext) | R |
| earnings / ledger / payouts | ✗ | ✗ | R own only | R all, approve/hold | R all |
| `payments` | ✗ | R own | R own (+ aggregated earnings, not buyer rows) | R all | R all |
| session join link | ✗ | confirmed booking only | own sessions | all | all |
| admin RPCs (`admin_*`, `review_*`, payouts approve) | ✗ | ✗ (no EXECUTE) | ✗ | ✓ | ✓ |

### Escalation cases run (PGlite lab, Postgres 18.6, rewrite migrations 0100–0600)

| Case | Expected | Result |
|---|---|---|
| E1a learner `insert into user_roles (self,'admin')` | deny | **PASS** – `roles change only via admin_set_role()` |
| E1b learner `update user_roles set role='super_admin'` | deny | **PASS** |
| E1c learner edits protected `profiles.joined_at` | deny | **PASS** – guard trigger |
| E1d admin (not super) grants self `super_admin` | deny | **PASS** |
| E1e learner self-creates verified `tutor_profiles` row | deny | **PASS** |
| E1f tutor sets own `commission_pct_override = 0` | deny | **PASS** |
| E2 tutor A reads tutor B `payout_methods` | deny | **FAIL** – 1 row (no RLS yet, SR-01/SR-05) |
| E2 learner reads tutor B `payout_methods` | deny | **FAIL** |
| E2 tutor A **updates** tutor B `payout_methods` | deny | **FAIL** – 1 row updated |
| E2 anon reads `payout_methods` | deny | **FAIL** – 2 rows |

| E3 learner EXECUTE on service/admin money RPCs | deny | **FAIL** – `execute=true` for `apply_flutterwave_payment`, `set_payment_checkout_link`, `complete_refund`, `mark_payout_processing`, `complete_payout` (SR-00). `admin_set_role()` referenced but not defined yet. |
| E3-PoC learner forges own course payment via `apply_flutterwave_payment` | deny | **FAIL** – payment `successful`, enrollment `active`, tutor credited UGX 40,000 (SR-00) |
| E5b/d/f learner/tutor call `complete_payout` / `complete_refund` / `request_payout` | deny | executes; stopped only by data checks (`payout not found`, `verified tutors only`) – privilege still wrong (SR-00) |
| E5c/e `mark_payout_processing` / `set_payment_checkout_link` as learner/tutor | deny | **FAIL** – executed (no matching row in lab, would update real rows) |
| E5g/h wallet_balances other tutor / anon | deny | PASS (security_invoker view; 0 rows) – re-test with seeded ledger once RLS exists |
| E5i/j tutor reads/approves another tutor's payouts | deny | inconclusive (seed row not created) |
| E5k tutor inserts a payout row directly (bypassing balance check in `request_payout`) | deny | **FAIL** – 1 row inserted for UGX 9,999,999 (no RLS/guard on `payouts`, SR-01) |
| E4a/b/c/d IDOR on `payments` (read other, mark successful, forge successful via INSERT) | deny | inconclusive – direct INSERT blocked only by a NOT NULL column, seed row missing; the real forgery path is the RPC (E3-PoC) |
| E4e learner reads another learner's email/phone | deny | **FAIL** (no RLS yet) |
| E4f anon reads `profile_private` | deny | **FAIL** – all 6 rows |
| E4g learner lists all admins via `user_roles` | deny (or badges only) | **FAIL** (no RLS yet) |
| E4h learner reads `tutor_applications` (ID documents) | deny | PASS (0 rows seeded – inconclusive) |
| P1/P2 positive controls (own private row, own payout methods) | allow | PASS |

Reading: the **guard-trigger layer is solid** (all column/role escalation attempts blocked). Every other FAIL is either the **missing RLS layer** (SR-01, 53 tables open after 0700) or **missing EXECUTE revokes** (SR-00/SR-04). Re-run after the RLS migration lands; all E2/E4 rows must flip to PASS and E3 must show `execute=false` for learners.

### Software-engineering / DB principles check
- ✅ Least privilege by design: identity from verified JWT `sub` (`app.requesting_user_id()`), text Clerk IDs (no `auth.uid()` cast bugs), PII split into `profile_private`, payout numbers encrypted app-side with last-4 only.
- ✅ All SECURITY DEFINER functions set `search_path = ''` (lab query: none missing).
- ✅ Prices/amounts read server-side (v1 checkout RPCs), idempotent payment apply with `flw_transaction_id unique`, amount/currency check.
- ⚠ Defence in depth gaps: SR-01, SR-03, SR-04. Migrations should be "secure at every commit", not "secure after the last file".
- ⚠ Tests: `rls.test.mjs` is a stub. Adopt the lab cases as the CI suite (pgTAP or PGlite in `npm test`).

## 4. v1 findings already fixed in the rewrite (credit)
- `conversation_participants` UPDATE could change `conversation_id` (join any chat): rewrite adds `participants_guard` (`…0600:168`). ✅
- `user_roles` guard missed UPDATE: rewrite guards INSERT/UPDATE/DELETE and routes role changes through `admin_set_role()`. ✅
- Admin could edit any profile status directly: rewrite forces admin RPCs. ✅

## 5. NOT REVIEWED — no code yet (requirements to meet)

### 5.1 `POST /api/resources/unfurl` (server-side fetch of user URLs) — SSRF
Required controls (review again when code lands):
1. AuthN + rate limit (e.g. 20/min/user via `rate_limit_hit`), learners+ only.
2. Parse with `new URL()`; allow only `http:`/`https:`, ports 80/443, no userinfo (`user:pass@`), length ≤ 2 kB.
3. **Resolve DNS yourself and pin the IP** (prevents DNS rebinding): `dns.lookup(host, { all: true })`, reject if **any** address is private/reserved, then connect to that exact IP with the original `Host`/SNI (undici `Agent({ connect: { lookup } })` returning the vetted address).
4. Block ranges: `0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16 (incl. 169.254.169.254 metadata), 172.16/12, 192.0.0/24, 192.168/16, 198.18/15, 224/4, 240/4, 255.255.255.255`; IPv6 `::/128, ::1, fc00::/7, fe80::/10, ff00::/8, 64:ff9b::/96`, and **IPv4-mapped `::ffff:a.b.c.d`** (unwrap and re-check); also decimal/octal/hex IPv4 forms (`http://2130706433`, `0x7f.1`) — rely on the resolved address, not the string. Hostnames `localhost`, `*.internal`, `metadata.google.internal`.
5. `redirect: 'manual'`; follow at most 3 redirects, **re-running steps 2–4 for every hop**.
6. Limits: 5 s total timeout (`AbortSignal.timeout(5000)`), read at most 1 MB (stream and abort), only `text/html` / `application/xhtml+xml`; ignore `Content-Length` lies (count bytes).
7. Don't forward cookies/auth; fixed `User-Agent`; no proxy env vars.
8. Output: plain strings only — strip tags, decode entities once, collapse whitespace, cap title 200 / description 500 chars; `og:image` must itself pass steps 2–4 and be `https:`; store, never return raw HTML. Render with `textContent` (never `innerHTML`); images via `<img src>` only (CSP `img-src`), or proxy/cache them.
9. Cache results by normalised URL (24 h) to stop amplification.

### 5.2 `/go/[id]` outbound redirect — open redirect
Partial design found: `public.register_click(p_kind, p_id)` (`…0800:529-542`) returns only the **stored** URL of a `published` resource/news/job ✅ (lookup-only, no URL parameter). Route handler not written. Note: anyone can call it repeatedly to inflate `click_count` (Low) — count unique (user/IP, day).
- Look up `id` (uuid) → stored `resources.url` with status `approved`; 404 otherwise. **Never** accept a `url`/`to` query parameter.
- Re-validate the stored URL scheme (`http/https` only) at redirect time; `302` with `Referrer-Policy: no-referrer`, `Cache-Control: no-store`; optional interstitial for unverified domains.
- Rate limit + click logging without IP retention beyond 30 days (DPPA s.18).

### 5.3 Other not-yet-written surfaces
Route handlers (authZ on each, Origin check for cookie POSTs), Clerk/svix webhook, Flutterwave webhook (snippet E), Resend (per-user/day cap; free tier 100/day), Vercel Cron (`CRON_SECRET`), Chatwoot identity HMAC, Cal.com webhook signature, service-role key placement (`import 'server-only'`, never `NEXT_PUBLIC_`). CDN SRI (snippet F).

### 5.4 Minors (primary & O-level learners) — child safety. NOT IMPLEMENTED in DB yet
Found: only a front-end stub `requestGuardianConsent()` → `POST /auth/guardian-consent` (`js/api.js:155-156`) and a "Guardian consent required" label on a school group (`js/data.js:160`). No age, guardian, block or minor-protection columns/tables/policies exist in migrations 0100–0800. **Treat as a go-live blocker for any under-18 account.**

Legal basis: DPPA 2019 **s.8** — a child's personal data may only be collected/processed with the prior consent of a parent/guardian (or where the law requires it); a child is a person under 18 (also the Children Act definition). The Children Act (as amended 2016) places a duty on everyone caring for or dealing with children to protect them from abuse and exploitation — design for that, and get Ugandan legal review before launch.

Required controls (to verify when built):
1. **Age gate at sign-up**: date of birth (store year-month only + `is_minor` derived server-side; never trust a client flag). Under 18 → account created in `pending_guardian` state with **no** community, DM, marketplace, Launchpad or payment features until consent.
2. **Verifiable guardian consent**: guardian name, phone (MoMo-capable), relationship; OTP to the guardian's phone (not the child's), record in `consent_records` (who, when, what version, IP) and let the guardian withdraw. Schools: teacher-verified chapter + school consent letter for class sign-ups.
3. **Adult→minor messaging**: `start_direct_conversation()` must refuse when exactly one party is a minor unless the adult is a verified tutor **booked by the guardian** and the conversation is in a group/class context visible to the guardian/teacher; no private 1:1 adult–minor DMs; no image/file attachments to/from minors; links in minor chats rendered as text.
4. **PII minimisation for minors**: `profiles_select` hides minors from anon and from search (`search_all` person branch), no surname (display name + initial), no avatar photo (initials/illustrated avatar), no school + location combination, `is_public = false` forced by trigger, never in Launchpad maker lists or leaderboards by real name.
5. **Report & block**: one-tap report on every message/profile/post with `child_safety` reason routed to a priority queue; `user_blocks(blocker, blocked)` table enforced in DM/comment/mention policies; auto-freeze an adult's messaging on first child-safety report pending review; retain evidence (don't hard-delete reported content).
6. **Tutors working with minors**: verified ID + police clearance/reference for tutors who teach minors; sessions with minors only in group or recorded/observed mode; guardian receives booking + join notifications.
7. **Payments by minors**: guardian pays (guardian phone on the Flutterwave charge), never the child's own MoMo.
8. **Retention/erasure**: guardian can export/erase the child's data (`export_my_data`/`erase_user` flows, once SR-00b is fixed).
9. Lab cases to add: minor visible to anon (deny), adult starts DM with minor (deny), minor uploads attachment (deny), blocked user comments on blocker's post (deny).

### 5.5 Beta-testing area (user-submitted test URLs in iframes, downloadable builds). NOT IMPLEMENTED (front-end stubs `becomeTester`, `submitBugReport`, `fetchCampaigns` only)
1. **Never iframe arbitrary URLs inside the app origin's pages with privileges.** If embedding: `<iframe src=… sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" allow="" loading="lazy">` — **never** `allow-same-origin` together with `allow-scripts`, no `allow-top-navigation`, no `allow-popups-to-escape-sandbox`, no `allow-modals` (phishing prompts).
2. CSP: do **not** add `frame-src https:`. Either allow-list approved test hosts per campaign (stored, admin-approved, `https:` only), or open test builds in a new tab via `/go/[id]` with an interstitial ("You are leaving 101 Codecrafts; this is a member's beta"). Keep `frame-ancestors 'none'` on our pages.
3. Admin approval before a campaign is visible; re-approve on URL change; check URLs against Google Safe Browsing (free API) and block IP literals, URL shorteners, `data:`/`javascript:`/`file:`.
4. **Downloadable builds (APK/EXE/ZIP)**: upload to a private bucket only; MIME/extension allow-list (`.apk`, `.aab`, `.zip`), size cap; hash (SHA-256) shown to testers; scan with VirusTotal free API (public-file caveat) or ClamAV before approval; serve with `Content-Disposition: attachment` and short-lived signed URLs; never auto-download; minors cannot download builds.
5. Tester PII (devices, emails) visible only to the campaign owner and admins; bug reports with screenshots are private by default.

### 5.6 Launchpad upvotes (vote manipulation, sockpuppets). NOT IMPLEMENTED (front-end stub `POST /launchpad/{id}/upvote`; sorting by `votes` client-side)
1. Votes table `launchpad_votes(product_id, user_id, created_at, primary key(product_id,user_id))`, insert via RPC only; `votes` counter maintained by trigger, never client-writable (same guard pattern as `stars_count`).
2. Eligibility: active account ≥ 7 days old, email + phone verified (Clerk), at least one completed lesson or prior activity; makers cannot vote for own product; one vote per product per person.
3. Rank by **weighted, decayed** score (e.g. weight = account-age/reputation factor, Hacker-News-style time decay), not raw count; hide exact counts for the first hours.
4. Sockpuppet signals (for the moderation queue, not auto-ban): many votes from accounts created the same day, same device fingerprint/IP /24, same referral code (ties into `attach_referral` fix), vote bursts within minutes; admins can void votes, logged in `audit_log`.
5. Rate limit voting (e.g. 30/hour/user) with `rate_limit_hit`; Cloudflare Turnstile (already loaded by Clerk) on sign-up.
6. Minors' products: makers shown by first name + initial only; no voting rewards with cash value.

## 6. Reproducing the RLS lab
```bash
npm i @electric-sql/pglite
node harness.mjs supabase/migrations "" cases.mjs   # Supabase shim: anon/authenticated/service_role, auth.jwt(), storage.*
```
Harness + cases (`harness.mjs`, `cases.mjs`, `poc.mjs` payment forgery, `poc2.mjs` anonymous erase) are kept outside this branch's allowed paths and handed to the backend engineer; they set `request.jwt.claims` and `set role authenticated|anon` per case and print PASS/FAIL, tables without RLS, definer functions without `search_path`, and definer functions executable by anon/authenticated.

## 7. Accessibility (WCAG 2.2 AA) — front-end working copy (landing + learner dashboard)

Learner (`dashboard.html`), tutor (`tutor.html`) and admin (`admin.html`) pages appeared late in the window; A-01/A-02 measured on landing + learner dashboard, A-03/A-04 checked in shared CSS/JS. Tutor/admin contrast not measured individually.

| ID | WCAG | Level | Finding | Fix |
|---|---|---|---|---|
| A-01 | 1.4.3 Contrast | **Fail** | Orange text on light backgrounds: `STARTS HERE` (`--lor #fd9104` on hero `#eeeff1`, 46 px) = **1.98:1** (large text needs 3:1); eyebrow `WHAT WE OFFER` (#fd9104 on `#f3f6f7`, small) = **2.08:1** (needs 4.5:1). Cyan `#05e6f2`/`#00d5f9` on white = 1.54 / 1.77:1 — fine only on navy (9.4–11:1). | Keep bright orange/cyan as **fills** with dark text (dark on orange 7+:1 ✅) or on navy; for text on light use `#a84f00` (5.11:1 on #f3f6f7) / `#9a4a00` (5.77:1) and cyan `#006b80` (5.66:1). |
| A-02 | 1.4.10 Reflow / 1.4.4 Resize | **Fail** | Pages are absolutely positioned at fixed pixels (`.app{width:1536px;height:1024px;overflow:hidden}`, landing 1024 px) with `<meta name="viewport" content="width=1024">`: no reflow at 320 CSS px, content clipped by `overflow:hidden` at 200% zoom. | Rebuild layout with flex/grid + `max-width`, `width=device-width, initial-scale=1`, no `overflow:hidden` on page wrappers. |
| A-03 | 2.4.7 / 2.4.11 Focus visible / not obscured | **Fixed in latest WIP** (`brutal.css:39` `:focus-visible{outline:3px…}`); was: | Zero `:focus`/`:focus-visible` rules; relies on browser default ring, which is low-contrast on orange/cyan fills; absolutely positioned layers may obscure focused items. | `:focus-visible{outline:3px solid #10181f;outline-offset:2px}` and a light variant on navy (`#fff`). |
| A-04 | 2.3.3 / 2.2.2 Motion | **Fixed in latest WIP** (`brutal.css:41` reduced-motion reset; `motion.js:7` skips GSAP/Lenis); was: | No `prefers-reduced-motion`; hover transforms now, GSAP/three.js + count-up (`data-count`) planned. | Wrap all animation in `@media (prefers-reduced-motion: no-preference)`; in JS `if (matchMedia('(prefers-reduced-motion: reduce)').matches) gsap.globalTimeline.timeScale(0)` / skip three.js render loop; pause control for anything > 5 s. |
| A-05 | 2.1.1 / 4.1.2 Keyboard, name/role | Risk | Interactive elements are `<a>` (keyboard-reachable ✅) but `RESOURCES`/`ABOUT` are `href="#"` dead links, icon-only SVGs have no `aria-hidden`/labels, no skip link, no landmark `<nav>/<main>`. | Real hrefs or `<button>`; `aria-hidden="true"` on decorative SVG; "Skip to content" link; landmarks. |
| ✅ | 1.1.1 | Pass | All 13 / 9 `<img>` have `alt`. `lang="en"` set. Dark-on-orange (`#10181f` on `#fc8b0e` = 7.54:1) and dark-on-cyan pass. |

## 8. Recon tooling (own targets only)

| Tool | Command | Target | Result |
|---|---|---|---|
| httpx v1.12.0 | `echo http://127.0.0.1:8765/ \| httpx -sc -title -td -server -ct` | local `python -m http.server` of the front-end working copy | `200 text/html "101 Codecrafts · Your IT journey starts here"`; no security headers (expected for a dev server — production headers come from `security/vercel.headers.json`). |
| Katana v1.8.0 | `katana -u http://127.0.0.1:8765/ -d 3 -jc -cs 127.0.0.1` | same | 8 URLs: `/`, `/dashboard.html`, 5 CSS files and a reference to `tools/tune.py`; `curl` confirms **`/tools/tune.py` is served (200)** — a dev script in the web root. Keep `tools/`, `compare/`, `src/` out of the deployed output via `.vercelignore` or an `outputDirectory`). |
| hakrawler (built from source, Go 1.23) | `echo http://127.0.0.1:8765/ \| hakrawler -d 3 -u` | same | `/index.html`, `/dashboard.html`, **`/admin.html` (404 — linked but not built yet)**. |
| Vercel preview | — | — | **None exists**: no GitHub deployments/statuses for the repo, no `homepage`. Not scanned. |
| Subfinder v2.17.0 / gau v2.2.4 | — | — | **Not run**: no 101 Codecrafts domain is live/known. Third-party domains were not touched. Commands are in the go-live checklist. |

## 9. Go-live security checklist

**Database**
- [ ] Every table: RLS enabled in its creating migration; CI check (snippet A) passes; `force row level security` on PII/money tables.
- [ ] `alter default privileges` revoke (snippet D); explicit `grant execute` list reviewed; learners have no EXECUTE on `admin_*`/payout/payment-apply functions.
- [ ] `app.is_privileged()` fixed (snippet C); each definer RPC authorizes first.
- [ ] Lab/CI suite E1–E4 all PASS against the pushed `backend` branch, including earnings/payout IDOR and `payments` forging.
- [ ] Join links, payout ciphertext, ID documents only readable by owner/admin (column revokes or private tables).
- [ ] Storage: MIME allow-lists, size limits, private buckets for paid/ID content, no `select` policy on public buckets.
- [ ] `app`/`analytics` schemas **not** in Supabase "Exposed schemas".

**Auth**
- [ ] Supabase Third-Party Auth → Clerk (RS256/JWKS), no legacy shared JWT secret; `role: authenticated` claim present.
- [ ] Admin/super_admin require MFA (`mfa_enabled` checked in admin RPCs); super_admin count ≥ 2 but small.
- [ ] Clerk `unsafe_metadata` never used for authorization.

**Server / payments**
- [ ] SR-00: every service-role money function revoked from `public, anon, authenticated` and self-checks `service_role`; lab E3-PoC fails to forge a payment.
- [ ] `payouts.hold_days >= refunds.window_days`; no payout while balance has clawbacks.
- [ ] Service-role key only in Vercel env (no `NEXT_PUBLIC_`), `import 'server-only'`.
- [ ] Clerk (svix) and Flutterwave webhooks verified + idempotent; Flutterwave re-verify via API, amount/currency/tx_ref match.
- [ ] `CRON_SECRET` on every cron route; rate limits on posting, messaging, unfurl, checkout, email.
- [ ] Unfurl SSRF controls (§5.1) and `/go/[id]` lookup-only redirect (§5.2).

**Front end / headers**
- [ ] Deploy `security/vercel.headers.json` (merge into `vercel.json`); CSP ships as **Report-Only** for one week, then switch the key to `Content-Security-Policy`; replace `clerk.YOUR_DOMAIN`, narrow `*.supabase.co` to the project ref and the CDN list to the one actually used.
- [ ] CDN scripts pinned + SRI (snippet F); no `innerHTML` with user/API data; DOMPurify for markdown.
- [ ] `tools/`, `compare/`, `src/`, `*.py` excluded from deployed output.
- [ ] HSTS `preload` only after every subdomain serves HTTPS.
- [ ] WCAG A-01…A-05 fixed.

**Children, beta testing, Launchpad**
- [ ] Age gate + verified guardian consent (DPPA s.8) before any under-18 feature; adult↔minor 1:1 DM blocked; minors hidden from anon/search; report + block with child-safety priority queue.
- [ ] Beta builds: admin approval, Safe Browsing + malware scan, sandboxed iframes without `allow-same-origin`+`allow-scripts`, no wildcard `frame-src`.
- [ ] Launchpad: one vote per eligible account via RPC, maker can't self-vote, weighted/decayed ranking, sockpuppet review queue.

**Ops / privacy (Uganda DPPA 2019)**
- [ ] PDPO registration; privacy notice; consent at sign-up; under-18 parental consent path; export/delete flow; retention purge cron; vendor DPAs.
- [ ] Private vulnerability reporting enabled; `security.yml` required on `main`; Dependabot on.
- [ ] Recon on the real domain (own domain only) once live:
  ```bash
  subfinder -d <our-domain> -all -silent | httpx -silent -sc -title -td -fr > subs.txt
  gau --subs <our-domain> | sort -u > urls.txt     # look for leaked tokens, old endpoints, debug paths
  katana -u https://<our-domain> -d 3 -jc -cs <our-domain> > crawl.txt
  echo https://<our-domain> | hakrawler -d 3 -subs
  curl -sI https://<our-domain> | grep -iE 'strict-transport|content-security|x-frame|referrer|permissions'
  ```
