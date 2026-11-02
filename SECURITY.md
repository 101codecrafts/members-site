# Security Policy — 101 Codecrafts members site

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: **Security → Report a vulnerability**
(https://github.com/101codecrafts/members-site/security/advisories/new).
Repository admins: enable *Settings → Code security → Private vulnerability reporting* so this link works.

Include what you found, steps to reproduce, and the impact. We aim to:

| Step | Target |
|---|---|
| Acknowledge | 3 working days |
| Triage + severity | 7 days |
| Fix Critical / High | 14 days |
| Fix Medium / Low | next release |

We will credit you in the advisory unless you ask us not to. Good-faith research that respects
the rules below will not be pursued legally.

**Rules:** test only against your own account; no access to other members' data; no denial of
service, spam, or social engineering of members or staff; no real payments other than your own
test payments; stop and report as soon as you can see data that is not yours.

## Supported versions

Only the current production deployment (default branch) receives security fixes.

## How we keep the site secure

- Threat model: [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
- Latest review and go-live checklist: [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md)
- Proposed HTTP security headers: [`security/vercel.headers.json`](security/vercel.headers.json)
- CI on every push / PR: CodeQL, gitleaks (secret scan over full history), npm audit, OSV-Scanner
  (`.github/workflows/security.yml`); Dependabot for npm and GitHub Actions.

### Rules for contributors
1. **Never commit secrets.** `.env*` files stay out of git (only `.env.example` with empty values).
   Server secrets — `SUPABASE_SERVICE_ROLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`,
   `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `RESEND_API_KEY`, `CRON_SECRET` — live only in Vercel
   environment variables and must **never** have a `NEXT_PUBLIC_` prefix or appear in static JS.
   The only keys allowed in the browser are the Supabase URL + anon/publishable key, the Clerk
   publishable key and the Flutterwave public key.
2. Every new Postgres table: `enable row level security` + policies in the same migration.
3. Every `security definer` function: `set search_path = ''` and `revoke execute … from public, anon`.
4. Never render user or third-party API content with `innerHTML` / `dangerouslySetInnerHTML`
   without DOMPurify.
5. Every CDN `<script>` / `<link>`: exact version + `integrity` (SRI) + `crossorigin="anonymous"`.
6. Webhooks verify signatures on the raw body; payments are verified server-side with Flutterwave.

## If a secret leaks

1. Rotate it immediately at the provider (Supabase → API keys, Clerk, Flutterwave, Resend, Vercel).
2. Update the Vercel env var and redeploy.
3. Remove it from git history only *after* rotating (history rewrites do not un-leak a key).
4. Check provider logs for misuse; if member personal data may have been exposed, notify the
   Personal Data Protection Office (Uganda DPPA 2019, s.23) without delay and inform affected members.
