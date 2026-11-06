// Round 12: admin review of member-submitted events + the stored form fields.
// Migration: 20261106030000_r12_event_review.sql
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;
let n = 0;
async function submit(db, who = U.alice, extra = {}) {
  await as(db, who);
  const k = `r12rev-${++n}-${Date.now()}`;
  const cols = { title: 'Kampala AI meetup ' + n, starts_at: new Date(Date.now() + 5 * 864e5).toISOString(), source_url: `https://lu.ma/${k}`, dedupe_key: `member:${k}`,
    event_type: 'meetup', price: 20000, currency: 'UGX', description: 'Talks and demos', ...extra };
  const keys = Object.keys(cols);
  return one(db, `insert into public.external_events (${keys.join(',')}) values (${keys.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, keys.map((k) => cols[k]));
}
const notes = async (db, who) => { await as(db, 'postgres'); return q(db, `select type, title, body, link from public.notifications where user_id=$1 and type='event.review' order by created_at`, [who]); };
const audit = async (db, id) => { await as(db, 'postgres'); return q(db, `select action, actor_id, actor_role, old_data, new_data, context from public.audit_log where table_name='external_events' and record_id=$1 and action like 'admin.event_%'`, [id]); };

export const tests = [
  t('r12 event review: a member submission stores type/price/currency/description, stays pending, and cannot pre-fill review fields', async (db) => {
    const ev = await submit(db, U.alice, { review_reason: 'self approved', reviewed_by: U.alice, reviewed_at: new Date().toISOString() });
    assert.equal(ev.status, 'pending_review'); assert.equal(ev.submitted_by, U.alice);
    assert.equal(ev.event_type, 'meetup'); assert.equal(Number(ev.price), 20000); assert.equal(ev.currency, 'UGX'); assert.equal(ev.description, 'Talks and demos');
    assert.equal(ev.review_reason, null); assert.equal(ev.reviewed_by, null); assert.equal(ev.reviewed_at, null);
    await as(db, U.alice);
    await fails(db, `insert into public.external_events (title, starts_at, source_url, dedupe_key, currency) values ('Bad currency', now()+interval '1 day', 'https://x.example/a', 'member:bad-cur', 'EUR')`, [], '23514');
  }),

  t('r12 event review: admin approves → published, reviewer stamped, audited (before → after), submitter notified; second decision refused', async (db) => {
    const ev = await submit(db);
    await as(db, U.admin);
    const r = await one(db, `select public.admin_review_external_event($1,'approve',null) r`, [ev.id]);
    assert.equal(r.r.status, 'published');
    await as(db, 'postgres');
    const row = await one(db, `select status, reviewed_by, reviewed_at, review_reason from public.external_events where id=$1`, [ev.id]);
    assert.equal(row.status, 'published'); assert.equal(row.reviewed_by, U.admin); assert.ok(row.reviewed_at); assert.equal(row.review_reason, null);
    const a = await audit(db, ev.id);
    assert.equal(a.length, 1); assert.equal(a[0].action, 'admin.event_approve'); assert.equal(a[0].actor_id, U.admin); assert.equal(a[0].actor_role, 'admin');
    assert.deepEqual(a[0].old_data, { status: 'pending_review' }); assert.deepEqual(a[0].new_data, { status: 'published' });
    const ns = await notes(db, U.alice);
    assert.equal(ns.length, 1); assert.match(ns[0].title, /is live/); assert.equal(ns[0].link, '/events.html');
    await as(db, U.admin);
    await fails(db, `select public.admin_review_external_event($1,'reject','changed my mind')`, [ev.id], /already reviewed/);
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.external_events where id=$1`, [ev.id])).length, 1, 'published row is public');
  }),

  t('r12 event review: reject needs a 3..300 char reason; the reason reaches the submitter and stays off public rows', async (db) => {
    const ev = await submit(db);
    await as(db, U.root);
    await fails(db, `select public.admin_review_external_event($1,'reject',null)`, [ev.id], /reason/);
    await fails(db, `select public.admin_review_external_event($1,'reject','  ')`, [ev.id], /reason/);
    await fails(db, `select public.admin_review_external_event($1,'reject',$2)`, [ev.id, 'x'.repeat(301)], /too long/);
    await fails(db, `select public.admin_review_external_event($1,'maybe','ok fine')`, [ev.id], '22023');
    const r = await one(db, `select public.admin_review_external_event($1,'reject',$2) r`, [ev.id, ' Link is not an event page ']);
    assert.equal(r.r.status, 'rejected'); assert.equal(r.r.reason, 'Link is not an event page');
    const a = await audit(db, ev.id);
    assert.equal(a[0].action, 'admin.event_reject'); assert.equal(a[0].actor_role, 'root_admin'); assert.equal(a[0].context.reason, 'Link is not an event page');
    const ns = await notes(db, U.alice);
    assert.equal(ns.length, 1); assert.match(ns[0].title, /not approved/); assert.equal(ns[0].body, 'Link is not an event page');
    await as(db, U.alice);   // the submitter still sees their own rejected row and the reason
    assert.equal((await one(db, `select review_reason from public.external_events where id=$1`, [ev.id])).review_reason, 'Link is not an event page');
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.external_events where id=$1`, [ev.id])).length, 0);
  }),

  t('r12 event review: learners, tutors and anon cannot decide; an admin without the approvals scope cannot either; unknown id → not found', async (db) => {
    const ev = await submit(db);
    for (const who of [U.alice, U.bob, U.tutorA]) { await as(db, who); await fails(db, `select public.admin_review_external_event($1,'approve',null)`, [ev.id], '42501'); }
    await as(db, 'anon');
    await fails(db, `select public.admin_review_external_event($1,'approve',null)`, [ev.id], '42501');
    await as(db, 'postgres');
    await q(db, `insert into public.admin_grants (user_id, scopes, granted_by) values ($1, '{audit}', $2) on conflict (user_id) do update set scopes = '{audit}'`, [U.admin, U.root]);
    await as(db, U.admin);
    await fails(db, `select public.admin_review_external_event($1,'approve',null)`, [ev.id], /scope/);
    await as(db, U.root);
    await fails(db, `select public.admin_review_external_event(gen_random_uuid(),'approve',null)`, [], 'P0002');
    await as(db, 'postgres');
    assert.equal((await one(db, `select status from public.external_events where id=$1`, [ev.id])).status, 'pending_review');
  }),

  t('r12 event review: contact email is private (admin + submitter only), only for your own submission, never anon', async (db) => {
    const ev = await submit(db);
    await as(db, U.alice);
    await q(db, `insert into public.external_event_contacts (event_id, user_id, contact_email) values ($1,$2,'alice@example.com')`, [ev.id, U.alice]);
    assert.equal((await q(db, `select contact_email from public.external_event_contacts`)).length, 1);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.external_event_contacts`)).length, 0);
    await fails(db, `insert into public.external_event_contacts (event_id, user_id, contact_email) values ($1,$2,'bob@example.com')`, [ev.id, U.bob], '42501');
    await as(db, U.admin);
    assert.equal((await one(db, `select contact_email from public.external_event_contacts where event_id=$1`, [ev.id])).contact_email, 'alice@example.com');
    await as(db, 'anon');
    await fails(db, `select 1 from public.external_event_contacts`, [], '42501');
  }),
];
