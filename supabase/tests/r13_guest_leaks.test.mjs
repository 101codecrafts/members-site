// Round 13 guest-leaks: a guest-only account (active, role 'guest') reads only what visitors + its own rows allow;
// learners keep member reads; anon loses internal columns. Migration: 20261107020000_r13_guest_leaks.sql
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;
const G = 'user_guest_r13';

async function guest(db) {
  await as(db, 'postgres');
  await q(db, `insert into public.profiles (id, username, display_name, account_status, joined_at, is_public) values ($1,'guestr13','Guest R13','active',now(), false) on conflict do nothing`, [G]);
  await q(db, `insert into public.user_roles (user_id, role) values ($1,'guest') on conflict do nothing`, [G]);
}
const count = async (db, sql, p = []) => (await one(db, `select count(*)::int n from (${sql}) x`, p)).n;

export const tests = [
  t('r13: app.is_member_role() is false for a guest-only account, true for a learner, false for anon', async (db) => {
    await guest(db);
    await as(db, G); assert.equal((await one(db, `select app.is_member_role() v`)).v, false);
    assert.equal((await one(db, `select app.is_member() v`)).v, true, 'guest stays an active account (it may still buy)');
    await as(db, U.alice); assert.equal((await one(db, `select app.is_member_role() v`)).v, true);
    await as(db, 'anon'); assert.equal((await one(db, `select app.is_member_role() v`)).v, false, 'anon: false (policies on anon-readable tables call it)');
  }),

  t('r13: guest cannot read a minor\'s profile or a private adult profile; a learner can (unchanged)', async (db) => {
    await guest(db);
    await as(db, 'postgres'); await q(db, `update public.profiles set is_public = false where id = $1`, [U.bob]);
    await as(db, G);
    assert.equal(await count(db, `select 1 from public.profiles where id = $1`, [U.kid]), 0, 'minor hidden from guest');
    assert.equal(await count(db, `select 1 from public.profiles where id = $1`, [U.bob]), 0, 'private adult hidden from guest');
    assert.equal(await count(db, `select 1 from public.profiles where id = $1`, [G]), 1, 'own profile still visible');
    await as(db, U.alice);
    assert.equal(await count(db, `select 1 from public.profiles where id = $1`, [U.kid]), 1, 'learners keep member visibility');
    assert.equal(await count(db, `select 1 from public.profiles where id = $1`, [U.bob]), 1);
  }),

  t('r13: guest cannot read other members\' roles, badges or stats (leaderboards); own rows stay visible', async (db) => {
    await guest(db);
    await as(db, 'postgres');
    await q(db, `insert into public.user_stats (user_id) values ($1), ($2) on conflict do nothing`, [U.alice, G]);
    await as(db, G);
    assert.equal(await count(db, `select 1 from public.user_roles where user_id <> $1`, [G]), 0, 'who is tutor/admin is not shown to guests');
    assert.equal(await count(db, `select 1 from public.user_stats where user_id = $1`, [U.alice]), 0);
    assert.equal(await count(db, `select 1 from public.user_stats where user_id = $1`, [G]), 1);
    await as(db, U.bob);
    assert.ok(await count(db, `select 1 from public.user_roles where role <> 'learner'`) > 0, 'members still see tutors/admins');
    assert.equal(await count(db, `select 1 from public.user_stats where user_id = $1`, [U.alice]), 1);
  }),

  t('r13: guest cannot read live tutor sessions, community posts or public study groups; learner can', async (db) => {
    await guest(db);
    await as(db, 'postgres');
    await q(db, `insert into public.tutor_sessions (tutor_id, title, starts_at) values ($1, 'R13 session', now() + interval '1 day')`, [U.tutorA]);
    await q(db, `insert into public.study_groups (name, owner_id, is_private) values ('R13 public group', $1, false)`, [U.alice]);
    await as(db, G);
    assert.equal(await count(db, `select 1 from public.tutor_sessions where title = 'R13 session'`), 0);
    assert.equal(await count(db, `select 1 from public.study_groups where name = 'R13 public group'`), 0);
    assert.equal(await count(db, `select 1 from public.posts`), 0);
    await as(db, U.bob);
    assert.equal(await count(db, `select 1 from public.tutor_sessions where title = 'R13 session'`), 1);
    assert.equal(await count(db, `select 1 from public.study_groups where name = 'R13 public group'`), 1);
  }),

  t('r13: guest cannot read member-audience announcements; public ones stay visible to everyone', async (db) => {
    await guest(db);
    await as(db, 'postgres');
    await q(db, `insert into public.announcements (title, body, audience, published_at) values ('R13 members only','x','members', now() - interval '1 minute'), ('R13 public','x','public', now() - interval '1 minute')`);
    await as(db, G);
    assert.equal(await count(db, `select 1 from public.announcements where title = 'R13 members only'`), 0);
    assert.equal(await count(db, `select 1 from public.announcements where title = 'R13 public'`), 1);
    await as(db, U.alice);
    assert.equal(await count(db, `select 1 from public.announcements where title = 'R13 members only'`), 1);
  }),

  t('r13: anon cannot select internal columns (payout routing, KYC note, moderation state); public columns still work', async (db) => {
    await as(db, 'anon');
    await fails(db, `select flw_subaccount_id from public.tutor_profiles`, [], /permission denied|42501/);
    await fails(db, `select commission_pct_override from public.tutor_profiles`, [], /permission denied|42501/);
    await fails(db, `select status_reason from public.profiles`, [], /permission denied|42501/);
    await fails(db, `select last_seen_at from public.profiles`, [], /permission denied|42501/);
    await fails(db, `select review_note from public.courses`, [], /permission denied|42501/);
    assert.ok(await count(db, `select user_id, bio, expertise, rating_avg from public.tutor_profiles`) >= 1, 'verified tutor cards still public');
    assert.ok(await count(db, `select id, username, display_name from public.profiles`) >= 0);
    assert.ok(await count(db, `select id, slug, title, price_ugx from public.courses`) >= 1);
    await as(db, U.tutorB);
    assert.equal((await one(db, `select flw_subaccount_id from public.tutor_profiles where user_id = $1`, [U.tutorB])).flw_subaccount_id, 'RS_TUTORB', 'owner still reads own payout routing');
  }),

  t('r13: guest write guards unchanged (guest still cannot post; learner can)', async (db) => {
    await guest(db);
    await as(db, G);
    await fails(db, `insert into public.posts (author_id, body) values ($1, 'hi')`, [G], /42501|row-level security|guests cannot|violates/);
  }),
];
