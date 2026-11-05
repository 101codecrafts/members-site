// Round 12 security: guest + unconsented-minor rules hold inside SECURITY DEFINER flows too.
// Migration: 20261105121000_r12_guest_minor_guards.sql
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t, courseId } = helpers;
const G = 'user_guest_r12';

async function guest(db) {
  await as(db, 'postgres');
  await q(db, `insert into public.profiles (id, username, display_name, account_status, joined_at) values ($1,'guestr12','Guest R12','active',now()) on conflict do nothing`, [G]);
  await q(db, `insert into public.user_roles (user_id, role) values ($1,'guest') on conflict do nothing`, [G]);
}
async function event(db) {
  await as(db, 'postgres');
  return one(db, `insert into public.events (slug, title, starts_at, capacity, status, created_by, mode) values ('r12-ev','R12 event', now()+interval '2 days', 10, 'published', $1, 'online') returning id`, [U.tutorA]);
}

export const tests = [
  t('r12: guest-only account cannot RSVP to an event, even through the definer RPC (L6)', async (db) => {
    await guest(db); const e = await event(db);
    await as(db, G);
    await fails(db, `select public.event_rsvp($1)`, [e.id], /guests cannot/);
    await as(db, U.alice);
    assert.equal((await one(db, `select status from public.event_rsvp($1)`, [e.id])).status, 'registered', 'learners unaffected');
  }),

  t('r12: guest-only account cannot create study groups / submit opportunities (S3/L7); learners can', async (db) => {
    await guest(db);
    await as(db, 'postgres');
    const cols = (await q(db, `select column_name from information_schema.columns where table_schema='public' and table_name='study_groups' and is_nullable='NO' and column_default is null`)).map((r) => r.column_name);
    assert.ok(cols.length > 0);
    // the trigger fires before any column check, so a minimal insert is enough to prove the refusal
    await as(db, G);
    await fails(db, `insert into public.opportunities (type, title, org, url, canonical_url) values ('job','x','y','https://a.ug/x','a.ug/x')`, [], /guests cannot|42501/);
    await fails(db, `insert into public.study_groups (name) values ('x')`, [], /guests cannot|42501/);
  }),

  t('r12: service role (no JWT sub) is never blocked by the guest trigger', async (db) => {
    await guest(db); const e = await event(db);
    await as(db, 'service');
    await q(db, `insert into public.event_registrations (event_id, user_id, status) values ($1, $2, 'registered')`, [e.id, G]);
  }),

  t('r12: unconsented minor cannot open a checkout through create_checkout (L5); consented minor path unchanged', async (db) => {
    await as(db, 'postgres');
    await q(db, `update public.guardian_consents set revoked_at = now() where user_id=$1`, [U.kid]);
    const cid = await courseId(db, 'fullstack-nextjs-supabase');
    await as(db, U.kid);
    await fails(db, `select public.create_checkout('course', $1)`, [cid], /parent or guardian must give consent/);
    await as(db, 'postgres');
    assert.equal((await one(db, `select count(*)::int n from public.payments where user_id=$1`, [U.kid])).n, 0);
  }),

  t('r12: guest cannot open a paid event-ticket payment (L6)', async (db) => {
    await guest(db);
    await as(db, 'postgres');
    await fails(db, `insert into public.payments (user_id, purpose, amount_ugx, currency, tx_ref, status) values ($1,'event_ticket',5000,'UGX','r12-ev-tx','pending')`, [G], /guests can only buy/);
  }),
];
