// r12: admin review of member-submitted events (GET /admin/events/pending, POST /admin/events/:id/approve|reject).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { approveBody, rejectBody, REASON_MAX, isSchemaOutdated, toPendingItem, decisionNotice, BASE_COLS, EXT_COLS } from '../lib/event-review.ts';

const route = (p: string) => readFileSync(new URL(`../app/api/v1/admin/events/${p}/route.ts`, import.meta.url), 'utf8');
const svc = readFileSync(new URL('../services/event-review.ts', import.meta.url), 'utf8');
const mig = new URL('../../supabase/migrations/20261106030000_r12_event_review.sql', import.meta.url);

test('reject needs a reason of 3..300 chars (trimmed); approve takes an optional note up to 300', () => {
  assert.equal(REASON_MAX, 300);
  for (const bad of [{}, { reason: '' }, { reason: '  ab ' }, { reason: 'x'.repeat(301) }, { reason: null }]) assert.equal(rejectBody.safeParse(bad).success, false, JSON.stringify(bad));
  assert.equal(rejectBody.parse({ reason: '  Not a real event page  ' }).reason, 'Not a real event page');
  assert.equal(rejectBody.safeParse({ reason: 'x'.repeat(300) }).success, true);
  assert.equal(approveBody.safeParse({}).success, true);
  assert.equal(approveBody.safeParse({ reason: null }).success, true);
  assert.equal(approveBody.safeParse({ reason: 'x'.repeat(301) }).success, false);
});

test('schema-outdated detection covers missing function/table/column (Postgres + PostgREST), nothing else', () => {
  for (const code of ['42883', '42P01', '42703', '42704', 'PGRST202', 'PGRST204', 'PGRST205']) assert.equal(isSchemaOutdated({ code }), true, code);
  for (const e of [{ code: '42501' }, { code: 'P0001' }, { code: '23505' }, null, undefined, 'PGRST202', {}]) assert.equal(isSchemaOutdated(e), false, JSON.stringify(e));
});

test('queue item: title, organiser, dates, link, submitter, submitted time; form fields only when the migration is applied', () => {
  const row = { id: 'e1', title: 'DevFest Kampala', organiser: 'google_gdg', organiser_name: null, mode: 'physical', venue: 'Makerere', city: 'Kampala',
    starts_at: '2026-12-01T14:00:00Z', ends_at: null, timezone: 'Africa/Kampala', price_text: 'Free', source: 'member', source_url: 'https://gdg.community.dev/x',
    status: 'pending_review', submitted_by: 'user_a', created_at: '2026-11-06T03:00:00Z', event_type: 'conference', price: '0.00', currency: 'UGX', description: 'Talks' };
  const people = [{ id: 'user_a', display_name: 'Alice', username: 'alice' }];
  const full = toPendingItem(row, people, { e1: 'a@example.org' }, true);
  assert.equal(full.link, 'https://gdg.community.dev/x'); assert.equal(full.submitted_at, '2026-11-06T03:00:00Z');
  assert.deepEqual(full.submitter, { id: 'user_a', display_name: 'Alice', username: 'alice' });
  assert.equal(full.price, 0); assert.equal(full.contact_email, 'a@example.org'); assert.equal(full.description, 'Talks');
  const lite = toPendingItem(row, people, {}, false);
  assert.equal('description' in lite, false); assert.equal('contact_email' in lite, false);
  assert.equal(toPendingItem({ ...row, submitted_by: null }, people, {}, false).submitter, null);
  assert.doesNotMatch(BASE_COLS, /description|event_type|contact/); assert.match(EXT_COLS, /description/);
});

test('submitter notice wording matches the SQL function and carries the reason', () => {
  assert.deepEqual(decisionNotice('reject', 'Hack night', 'Link is broken'), { type: 'event.review', title: 'Your event "Hack night" was not approved', body: 'Link is broken', link: '/events.html' });
  assert.equal(decisionNotice('approve', 'Hack night', null).title, 'Your event "Hack night" is live');
  assert.ok(decisionNotice('approve', 'x'.repeat(300), null).title.length <= 200, 'fits notifications.title (200)');
});

test('routes: admin-only, uuid id, approve/reject bodies; the service checks the approvals scope before any read or write', () => {
  const pending = route('pending'), approve = route('[id]/approve'), reject = route('[id]/reject');
  for (const s of [pending, approve, reject]) assert.match(s, /requireAdmin\(\)/);
  assert.match(pending, /query\(req, pagination\)/);
  assert.match(approve, /approveBody/); assert.match(approve, /uuid\.parse\(params\.id\)/); assert.match(approve, /'approve'/);
  assert.match(reject, /rejectBody/); assert.match(reject, /uuid\.parse\(params\.id\)/); assert.match(reject, /'reject', b\.reason/);
  for (const fn of ['pendingEvents', 'reviewEvent']) {
    const body = svc.slice(svc.indexOf(`export async function ${fn}`));
    const iScope = body.indexOf("requireScope(s, 'approvals')"), iDb = body.indexOf('db.');
    assert.ok(iScope > 0 && iScope < iDb, `${fn}: scope check first`);
  }
});

test('review: RPC first (atomic, audited, notifies); degraded path only on schema-outdated, pending-only, audits + notifies', () => {
  const body = svc.slice(svc.indexOf('export async function reviewEvent'));
  assert.match(body, /rpc\('admin_review_external_event'/);
  assert.match(body, /if \(!isSchemaOutdated\(err\)\) throw err/);
  assert.match(body, /\.eq\('status', 'pending_review'\)/);
  assert.match(body, /'write_audit'/);
  assert.match(body, /from\('notifications'\)\.insert/);
  assert.match(body, /new AppError\('conflict'/);
  assert.ok(body.indexOf(".update({ status: next })") < body.indexOf("'write_audit'"), 'audit after the admin\'s own update succeeded');
});

test('migration: new columns + private contact table + scoped, audited, notifying RPC; not callable by anon', () => {
  assert.ok(existsSync(mig));
  const sql = readFileSync(mig, 'utf8');
  for (const c of ['event_type', 'price', 'currency', 'description', 'review_reason', 'reviewed_by', 'reviewed_at']) assert.match(sql, new RegExp(`add column if not exists ${c}\\b`));
  assert.match(sql, /create table if not exists public\.external_event_contacts/);
  assert.match(sql, /app\.require_scope\('approvals'\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /app\.audit_change\('admin\.event_'/);
  assert.match(sql, /app\.notify\(ev\.submitted_by, 'event\.review'/);
  assert.match(sql, /revoke execute on function public\.admin_review_external_event\(uuid, text, text\) from public, anon/);
  assert.match(sql, /char_length\(review_reason\) between 3 and 300/);
});
