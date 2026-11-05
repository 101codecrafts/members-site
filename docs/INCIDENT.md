# Personal-data breach runbook (101 Codecrafts members site)

Owner: founder (Businge Daglous) as data controller contact. Applies to any
unauthorised access to, disclosure, alteration, loss or destruction of personal
data held by the members site (Supabase DB and storage, Clerk, Vercel, payment
provider, AI provider logs), whether confirmed or suspected.

Legal basis: Uganda Data Protection and Privacy Act 2019, **s.23** (a data
controller that believes personal data was accessed or acquired by an
unauthorised person must notify the Personal Data Protection Office (PDPO)
**immediately**), and Data Protection and Privacy Regulations 2021, **Reg 33**
(notification on the prescribed form, Form 7). Data subjects are notified
**when and as the PDPO directs**. Keep every step in the incident log (section 6).

> Do not wait for certainty before notifying. "Immediately" means the same day
> the breach is believed to have happened, with facts still being gathered.
> Missing facts are sent later as a follow-up.

## 1. Detect

Triggers that open an incident:
- Alerts or unexplained entries in Supabase logs (API, Postgres, auth), Vercel
  function logs, Clerk dashboard (unusual sign-ins, new admins, MFA removals).
- `audit_log` / admin activity you did not perform: role or scope grants,
  plan/price changes, payout approvals, mass exports.
- Webhook anomalies: failed signature checks spiking (Clerk, Zoom, Flutterwave),
  unknown payout transfers in the Flutterwave dashboard.
- A report from a user, tutor, guardian, researcher, or the `report` page.
- A secret seen where it should not be (repo, chat, screenshot, log).

On a trigger: open an incident log entry (section 6) with the time (EAT), who
noticed, and what was seen. Assign one incident lead (default: founder).

## 2. Contain (first hour)

Do the smallest steps that stop further loss; preserve evidence first
(export/screenshot logs before changing anything that would overwrite them).

1. **Pause payouts (manual admin step).** There is no automatic kill switch.
   - Admin: stop approving payouts in the admin Payouts screen; leave every
     `payouts` row in `requested` (do not approve, do not reject in bulk).
   - Flutterwave dashboard: disable / suspend Transfers for the account, and
     check for transfers not matching an approved `payouts.reference`.
   - If the payment provider key may be exposed: rotate it in the provider
     dashboard, then update the Vercel environment variable (founder only).
2. **Revoke access.** Remove the attacker's sessions and roles: Clerk → sign out
   sessions / ban the user; remove admin roles and scopes you did not grant.
3. **Rotate exposed secrets** (founder only, never paste them in chat or the
   repo): Supabase JWT secret / service key, Clerk secret and webhook secret,
   Zoom webhook secret, Flutterwave keys, OpenRouter key, Vercel tokens and
   protection-bypass secrets. Redeploy after updating Vercel env vars.
4. **Close the hole.** Disable the affected route or feature (feature flag,
   redeploy previous good build) until fixed. Prefer a reversible step.
5. **Keep evidence.** Export relevant logs, DB rows (IDs only, minimise
   personal data copied), and timestamps into the incident folder.

## 3. Assess (same day)

Record in the log:
- What data: categories (names, emails, phone, guardian details, ID documents,
  payout mobile-money numbers, KYC, messages, minors' data — treat minors and
  ID/financial data as high risk).
- Whose data and roughly how many people; whether children are affected.
- How it happened, when it started, when it was contained.
- Likely harm (fraud, identity theft, harassment, financial loss).

## 4. Notify the PDPO — immediately

- Send the PDPO notification (Reg 33, **Form 7**) the same day the breach is
  believed to have occurred, even if the assessment is incomplete. Submit via
  the PDPO's official channel (https://pdpo.go.ug — confirm current contact
  details there; TODO founder: record the submission channel here once used).
- Include: nature of the breach, data categories and approximate numbers of
  people, likely consequences, measures taken / proposed, contact person.
- Record the time sent and any reference number. Send follow-up updates as
  facts become known; log each.

## 5. Notify users (when directed)

- Notify affected data subjects **when and in the manner the PDPO directs**
  (DPPA s.23). If the PDPO directs notice, send it by email (and in-app notice)
  in plain language: what happened, what data, what we did, what they should do
  (e.g. change passwords, watch for mobile-money fraud), and a contact.
- For minors, address the notice to the consenting guardian.
- Do not publicise details that would help an attacker. Every outbound notice
  is approved by the founder before sending.

## 6. Incident log

Keep one record per incident (private, not in the public repo), retained for
regulatory reporting (including the periodic report to the PDPO under the
Regulations). Each entry:

| Field | Content |
|---|---|
| ID / title | INC-YYYYMMDD-n |
| Detected | time (EAT), by whom, how |
| Lead | name |
| Timeline | every action with time (EAT) and person |
| Data / people affected | categories, approx. count, minors? |
| Containment | steps taken, payouts paused (time) and resumed (time) |
| PDPO notice | Form 7 sent (time), reference, follow-ups |
| User notice | directed? sent (time), channel, copy |
| Root cause | |
| Fixes | commits / config changes |
| Closed | time, lessons learned, follow-up tasks |

## 7. Recover and close

- Resume payouts only after the cause is fixed and keys rotated; re-check every
  pending payout against its tutor and payout method before approval.
- Run the DB test suite and authz checks against the fixed build.
- Write a short post-incident review in the log; update this runbook.
