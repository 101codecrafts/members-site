# 101 Codecrafts members site — Threat model (STRIDE)

Status: draft v1, 2026-11-02 (security branch). Owner: security review.
Scope: the whole system as designed — static front end on the default branch and the
Next.js / Supabase backend on `backend`. Free tiers only (Vercel Hobby, Supabase Free,
Clerk Free, Resend Free, Flutterwave standard, Chatwoot Cloud/self-host free, Cal.com free).

## 1. System overview

```
 Browser (static HTML/CSS/JS, GSAP, three.js, CDN scripts)
   │  ├─ Clerk JS (sign-in)  ──────────────► Clerk (issues session JWT, "supabase" template / third-party auth)
   │  ├─ supabase-js (anon key + Clerk JWT) ► Supabase PostgREST / Realtime / Storage  (RLS is the ONLY guard)
   │  ├─ fetch /api/* (Clerk session)  ────► Next.js route handlers on Vercel (server; holds service-role key)
   │  ├─ GitHub / Dev.to / HN public APIs (read-only, no secrets)
   │  ├─ Cal.com embed (iframe + script)     Chatwoot widget (iframe + script)
   │  └─ Flutterwave Inline checkout (script + iframe)
   │
 Vercel route handlers ──► Supabase (service role, bypasses RLS)
                       ──► Flutterwave API (secret key: verify transaction)
                       ──► Resend (API key: transactional mail)
 Webhooks (inbound, unauthenticated by design → must be signature-verified):
   Clerk (svix)  ─────► /api/webhooks/clerk        → upsert profiles
   Flutterwave   ─────► /api/webhooks/flutterwave  → mark payment / membership
 Vercel Cron  ────────► /api/cron/*  (must check CRON_SECRET bearer)
```

### Trust boundaries
| # | Boundary | Crosses it | Guard that must exist |
|---|---|---|---|
| TB1 | Browser → Supabase (PostgREST/Realtime/Storage) | anon key + Clerk JWT | RLS on every table, storage.objects policies, JWT verification via Clerk third-party auth (JWKS) |
| TB2 | Browser → Vercel `/api/*` | Clerk session cookie / bearer | `auth()` on every handler, role check server-side, CSRF (Origin check) for cookie-auth mutations, rate limit |
| TB3 | Internet → webhooks | Clerk/svix, Flutterwave POSTs | svix signature + timestamp; Flutterwave `verif-hash` constant-time compare **and** server-side `GET /transactions/{id}/verify`; idempotency table |
| TB4 | Vercel Cron → `/api/cron/*` | GET from Vercel | `Authorization: Bearer ${CRON_SECRET}` |
| TB5 | Page ↔ third-party scripts/iframes | GSAP, three.js, Cal.com, Chatwoot, Flutterwave | pinned versions + SRI, CSP allow-list, no secrets in page |
| TB6 | Server → third-party APIs | Flutterwave, Resend, Clerk Backend API | secrets only in Vercel env (never `NEXT_PUBLIC_*`) |

### Assets (what we protect)
1. Admin role / privileged actions (approve members, moderate posts, refunds, broadcast email).
2. Member PII: name, email, phone (MoMo number for UGX payments), student/university details, avatar, DMs.
3. Payment state: membership status, amounts in UGX, Flutterwave `tx_ref` / transaction IDs.
4. Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `RESEND_API_KEY`, `CRON_SECRET`.
5. Community content integrity (posts, comments, messages) and the site's reputation (defacement, phishing via XSS).
6. Availability on free-tier quotas (Supabase 500 MB DB / 1 GB storage / egress, Resend 100 emails/day, Vercel function invocations).

### Roles
- **anon** — not signed in. Public pages only; should read nothing from member tables.
- **member** — signed-in Clerk user with a `profiles` row; paid or unpaid status matters for gated content.
- **admin** — small set. Role must live in a place the member cannot write: a `profiles.role` column whose UPDATE is blocked for non-admins, or Clerk `public_metadata.role` (only writable via Clerk Backend API). **Never** `unsafe_metadata` (user-writable from the browser).
- **service** — route handlers using the service-role key; bypasses RLS, so every handler is itself an authorization point.

## 2. STRIDE by component

Severity guide: C = Critical, H = High, M = Medium, L = Low (likelihood × impact for this system).

### 2.1 Identity: Clerk ↔ Supabase JWT
| STRIDE | Threat | Sev | Mitigation |
|---|---|---|---|
| S | Supabase trusts a JWT it did not get from our Clerk instance (wrong issuer, legacy shared HS256 secret leaked) | C | Use Supabase **Third-Party Auth → Clerk** (verifies RS256 via Clerk JWKS, issuer pinned to our Clerk domain). Do not paste the Supabase JWT secret into a Clerk JWT template (legacy method). |
| S | Token has no `role: authenticated` claim → requests run as `anon`, or a custom template sets `role` to something powerful | H | Clerk's Supabase integration adds `role: "authenticated"`; never emit `role: service_role`. Verify with `select auth.jwt()`. |
| E | Admin flag read from a user-controlled claim (`unsafe_metadata`, a custom template field filled from it) | C | `is_admin()` reads `profiles.role` (or `public_metadata` only). Add a test: a member PATCHing their own Clerk unsafe metadata gains nothing. |
| S | User id mismatch: policies compare `auth.uid()` (uuid) to a Clerk id (`user_…` text) → cast errors or always-false/always-true policies | H | Store Clerk id in `text` columns and compare with `(auth.jwt()->>'sub')`. Never `auth.uid()` with Clerk. |
| R | No record of who did admin actions | M | `audit_log` table written by trigger / security-definer function, insert-only, admins read-only. |

### 2.2 Database: Supabase Postgres + RLS (TB1)
| STRIDE | Threat | Sev | Mitigation |
|---|---|---|---|
| I/T | A table in `public` without `enable row level security` is fully readable/writable with the anon key published in the page | C | `alter table … enable row level security` on **every** table, incl. join/lookup tables; CI check query (see checklist). Consider `force row level security` on sensitive tables. |
| E | Member updates their own `profiles.role` / `membership_status` / `paid_until` because UPDATE policy is `using (id = jwt sub)` without column restriction | C | Split: users update only safe columns via `grant update (display_name, bio, avatar_url) on profiles to authenticated` + revoke table-level UPDATE, or a `BEFORE UPDATE` trigger rejecting changes to privileged columns unless `is_admin()`. |
| E | `security definer` function with mutable `search_path` → object shadowing via a schema the attacker can write | H | Every definer function: `set search_path = ''` (or `pg_catalog, public`) and fully-qualify names; `revoke execute … from public, anon`. |
| E | `is_admin()` recursion / reads the same table under RLS → infinite recursion or always false; dev "fixes" with `using (true)` | H | `is_admin()` as `security definer stable` with fixed search_path; never `using (true)` for write policies. |
| I | Over-broad SELECT (`using (true)`) on profiles exposes email/phone of all members | H | Public profile view with non-PII columns only (`security_invoker = true` view) or column grants; PII columns readable by owner + admin only. |
| I | IDOR on payments/messages: `select * from payments where id = …` works for any id | H | Policies `using (user_id = (auth.jwt()->>'sub'))`; messages readable only by sender/recipient/participants. |
| T | Policies without `with check` let a user INSERT rows owned by someone else (spoofed `author_id`) | H | Every INSERT/UPDATE policy has `with check (author_id = (auth.jwt()->>'sub'))`; or default column from JWT. |
| D | Unbounded selects / Realtime subscriptions exhaust free tier | M | PostgREST `max_rows`, pagination, Realtime only on tables with RLS (Realtime honours RLS for postgres_changes; Broadcast/Presence need channel authorization). |

### 2.3 Route handlers on Vercel (TB2) and server actions
| STRIDE | Threat | Sev | Mitigation |
|---|---|---|---|
| E | Handler uses service-role client and trusts `userId` / `role` / `amount` from the request body | C | Derive identity only from `auth()` (Clerk); look up role server-side; prefer the user-scoped client (Clerk JWT) so RLS still applies; service role only where unavoidable. |
| I | Service-role key bundled to the client (`NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`, imported in a client component, or in static JS) | C | Name it without `NEXT_PUBLIC_`; `import "server-only"` in the admin client module; gitleaks + grep in CI. |
| T | CSRF on cookie-authenticated POST handlers (Clerk `__session` cookie is SameSite=Lax) | M | Next.js server actions check Origin vs Host automatically; for route handlers, check `Origin` against an allow-list and require JSON `Content-Type`; never mutate on GET. |
| T | SSRF: handler fetches a user-supplied URL (link previews, "import avatar from URL", GitHub username → URL) | M | Allow-list hosts (`api.github.com`, `dev.to`, `hacker-news.firebaseio.com`), build URLs server-side from validated identifiers, no redirects to private IPs. |
| D | No rate limiting on sign-up hooks, posting, messaging, email sending (Resend 100/day) | M | Per-user limits in Postgres (counter table + check in insert policy/trigger) or Upstash free tier; cap Resend sends per user/day. |
| I | Verbose errors leak stack traces / SQL | L | Generic error responses; log details server-side only. |

### 2.4 Webhooks (TB3) and cron (TB4)
| STRIDE | Threat | Sev | Mitigation |
|---|---|---|---|
| S | Forged Clerk webhook creates an admin profile or deletes users | C | `new Webhook(secret).verify(rawBody, {svix-id, svix-timestamp, svix-signature})` on the **raw** body (`await req.text()`), reject on failure; svix enforces a 5-minute timestamp window. |
| S/T | Forged Flutterwave webhook marks membership paid | C | Compare `verif-hash` header to `FLW_SECRET_HASH` with `crypto.timingSafeEqual`; then **always** call `GET https://api.flutterwave.com/v3/transactions/{id}/verify` with the secret key and trust only that response. |
| T | Amount/currency tampering: client sets amount in Inline config (e.g. UGX 1 instead of 50,000) | C | Server creates the `tx_ref` + expected amount/currency in a `payments` row before checkout; on verify require `status === "successful"`, `currency === "UGX"`, `amount >= expected`, `tx_ref` matches the row and the user. |
| R/T | Replay of a valid webhook / duplicate delivery double-credits | H | Idempotency: unique constraint on `flw_transaction_id` / `svix-id` in a `webhook_events` table; process inside a transaction; return 200 on duplicate. |
| S | Unauthenticated cron endpoint triggered by anyone (mass email, data purge) | H | `if (req.headers.get('authorization') !== \`Bearer ${process.env.CRON_SECRET}\`) return 401`. |

### 2.5 Front end, community content, third-party scripts (TB5)
| STRIDE | Threat | Sev | Mitigation |
|---|---|---|---|
| T/E | Stored XSS via posts/comments/messages/bios rendered with `innerHTML` / `dangerouslySetInnerHTML` / markdown → steals Clerk session, acts as admin | H (C if admins view content) | Render with `textContent`; if markdown, sanitize with DOMPurify (pinned + SRI) and disallow `javascript:` URLs; strict CSP without `'unsafe-inline'` scripts as defence in depth. |
| T | XSS from third-party API data (GitHub repo descriptions, Dev.to titles, HN titles) inserted with `innerHTML` | M | Same — treat external API data as untrusted. |
| T | CDN compromise / version drift (unpinned `gsap@latest`, three.js from a CDN without SRI) | H | Exact versions, `integrity="sha384-…"` + `crossorigin="anonymous"`, or self-host under `/vendor/`. |
| T | Clickjacking of payment / admin pages | M | `Content-Security-Policy: frame-ancestors 'none'` + `X-Frame-Options: DENY`. |
| I | Reverse tabnabbing / Referer leak of tokens in URLs | L | `rel="noopener noreferrer"`, `Referrer-Policy: strict-origin-when-cross-origin`. |
| I | Chatwoot widget receives PII via `setUser` / identity without HMAC → impersonation in support chat | M | Enable Chatwoot identity validation (HMAC of identifier computed server-side). |

### 2.6 Storage (avatars, attachments)
| STRIDE | Threat | Sev | Mitigation |
|---|---|---|---|
| T/E | Upload of HTML/SVG served from the Supabase storage origin → stored XSS / phishing | M | Bucket `allowed_mime_types` = image/png, image/jpeg, image/webp (no SVG/HTML); `file_size_limit` (e.g. 2 MB); random object names. |
| T | Overwrite or delete another user's files | H | `storage.objects` policies: `bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.jwt()->>'sub')` for insert/update/delete. |
| I | Private attachments in a public bucket | M | Private bucket + signed URLs with short expiry. |
| D | Storage quota exhaustion (1 GB free) | M | Size limits + per-user count limit. |

### 2.7 Secrets & supply chain
| Threat | Sev | Mitigation |
|---|---|---|
| Secrets committed (`.env`, `.env.local`, keys in JS) | C | `.gitignore` `.env*` (keep `.env.example`), gitleaks in CI + pre-commit, rotate on any leak. |
| Malicious/vulnerable npm dependency | M | lockfile committed, `npm ci`, Dependabot, npm audit / OSV-Scanner in CI. |
| Compromised GitHub Action | M | Actions pinned to SHAs, `permissions: contents: read` by default. |

## 3. Privacy: Uganda Data Protection and Privacy Act, 2019 (DPPA, now Cap. 97) + Data Protection and Privacy Regulations, 2021

Section numbers checked against the Act text at https://ulii.org/akn/ug/act/2019/9 . This is an engineering checklist, not legal advice.

| Requirement | What it means here |
|---|---|
| Registration with the PDPO (NITA-U) as a data collector/processor (Regs 2021) | Register 101 Codecrafts at pdpo.go.ug before collecting member data at scale. |
| Consent (s.7), specific purpose (s.12), minimality (s.14) | Collect only what membership needs; explicit consent checkbox on sign-up; no phone number unless paying via MoMo. |
| Children (s.8) | Members under 18 need parental consent — ask date of birth or require 18+ attestation. |
| Information given before collection (s.13) and data subject rights (ss.24–28): access, correction, deletion, objection to direct marketing | Privacy notice page; self-service export & delete (delete Clerk user → webhook `user.deleted` → cascade delete/anonymise rows + storage objects); unsubscribe in every Resend marketing mail. |
| Security safeguards (s.20) and breach notification to the Authority (s.23) | This review; incident runbook in SECURITY.md; notify PDPO immediately on breach. |
| Retention (s.18) | Keep data only as long as the purpose needs; destroy so it cannot be reconstructed (s.18(5)). Decide a retention period per table (payment records as long as tax/accounting law requires; inactive accounts purged after a set period via cron) and write it in the privacy notice. |
| Cross-border transfer (s.19) | Supabase/Clerk/Vercel/Resend store data outside Uganda — document adequate protection (vendor DPAs) and tell members in the notice. |
| Processors (s.21) | Keep DPAs with Supabase, Clerk, Vercel, Resend, Flutterwave, Chatwoot, Cal.com. |

## 4. Logging & audit
- `audit_log(id, actor_id, action, target_table, target_id, diff jsonb, at timestamptz default now())`, insert-only via triggers on `profiles.role`, payments, moderation; RLS: admins select, nobody update/delete.
- Log webhook verification failures and payment verification mismatches (without full PAN/MoMo numbers).
- Never log JWTs, webhook secrets or full request bodies containing PII.
- Supabase free tier keeps logs ~1 day: export important audit rows to the table, not to platform logs.

## 5. Top risks to close before go-live
1. RLS enabled + correct on every table; privileged columns (`role`, membership/payment status) not writable by members.
2. Service-role key server-only; never `NEXT_PUBLIC_`.
3. Both webhooks signature-verified; Flutterwave verified server-side with amount/currency/tx_ref checks and idempotency.
4. No `innerHTML` with user or API content; strict CSP.
5. CDN scripts pinned with SRI; security headers deployed (`security/vercel.headers.json`).
