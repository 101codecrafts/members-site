// Round 11 auth migration (20261105000100_auth_roles_r11.sql): root lock, guest role,
// onboarding guards, guardian-consent restrictions. Runs in the shared harness (run.mjs).
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;
const G = 'user_guest_r11', M = 'user_minor_r11', X = 'user_attacker_r11';

async function extra(db) {
  await as(db, 'postgres');
  await db.query(`
    insert into public.profiles (id, display_name, account_status, joined_at) values
      ('${G}','Guest Gabi','active',now()), ('${M}','Minor Mo','pending',null), ('${X}','Attacker','active',now())
      on conflict (id) do nothing;
    insert into public.profile_private (user_id, email, date_of_birth) values
      ('${G}','gabi@example.com',null), ('${M}','mo@example.com',(now() - interval '15 years')::date), ('${X}','attacker@example.com','1999-01-01')
      on conflict (user_id) do nothing;
    insert into public.onboarding_state (user_id, email_verified) values ('${X}', true), ('${G}', true) on conflict (user_id) do nothing;
    insert into public.user_roles (user_id, role) values ('${G}','guest'), ('${M}','learner') on conflict do nothing;
  `);
}

export const tests = [
  t('r11: guest is a valid app_role and is_guest_only() is true only for guest-only accounts', async (db) => {
    await extra(db);
    await as(db, G); assert.equal((await one(db, `select app.is_guest_only() v`)).v, true);
    await as(db, U.alice); assert.equal((await one(db, `select app.is_guest_only() v`)).v, false);
  }),

  t('r11: super_admin can only be granted to the verified root email — even the backend cannot mint another root', async (db) => {
    await extra(db);
    await as(db, 'service');
    await fails(db, `insert into public.user_roles (user_id, role) values ('${X}','super_admin')`, [], '42501');
    await as(db, 'postgres');
    await fails(db, `insert into public.user_roles (user_id, role) values ('${X}','super_admin')`, [], '42501');
    // root email but NOT verified -> still refused
    await db.query(`update public.profile_private set email = '101codecrafts@gmail.com' where user_id = '${G}'`);
    await db.query(`update public.onboarding_state set email_verified = false where user_id = '${G}'`);
    await fails(db, `insert into public.user_roles (user_id, role) values ('${G}','super_admin')`, [], '42501');
  }),

  t('r11: the root admin cannot be removed or demoted (admins, service role and postgres alike)', async (db) => {
    await as(db, 'service');
    await fails(db, `delete from public.user_roles where user_id = '${U.root}' and role = 'super_admin'`, [], '42501');
    await fails(db, `delete from public.user_roles where user_id = '${U.root}' and role = 'admin'`, [], '42501');
    await fails(db, `update public.user_roles set role = 'learner' where user_id = '${U.root}' and role = 'super_admin'`, [], '42501');
    await as(db, U.admin);
    await fails(db, `delete from public.user_roles where user_id = '${U.root}'`, [], /42501|roles change only|permission denied/);
    await as(db, 'service');
    await fails(db, `update public.profile_private set email = 'other@example.com' where user_id = '${U.root}'`, [], '42501');
    // a plain admin can still be removed (by the backend/root path)
    await db.query(`delete from public.user_roles where user_id = '${U.admin}' and role = 'admin'`);
  }),

  t('r11: a user cannot complete onboarding or pick a path by writing the table directly', async (db) => {
    await extra(db);
    await as(db, G);
    const r = await db.query('savepoint u').then(() => db.query(`update public.onboarding_state set path = 'tutor', completed_at = now() where user_id = '${G}' returning user_id`)).then((x) => x.rowCount, (e) => { assert.match(e.message, /onboarding|permission denied|42501/); return -1; });
    if (r === -1) await db.query('rollback to savepoint u');
    else assert.equal(r, 0, 'the row must not be updatable by its owner');
    await as(db, 'postgres');
    assert.equal((await one(db, `select path, completed_at from public.onboarding_state where user_id = '${G}'`)).path, null);
    await as(db, G);
    await fails(db, `insert into public.user_roles (user_id, role) values ('${G}','admin')`, [], /42501|roles change only|permission denied/);
  }),

  t('r11: my_access() reports is_minor and guardian_consent', async (db) => {
    await extra(db);
    await as(db, M);
    const a = (await one(db, `select public.my_access() a`)).a;
    assert.equal(a.is_minor, true); assert.equal(a.guardian_consent, false);
    await as(db, U.kid);
    const k = (await one(db, `select public.my_access() a`)).a;
    assert.equal(k.is_minor, true); assert.equal(k.guardian_consent, true);
  }),

  t('r11: minor without guardian consent is restricted; minor_restricted() clears after verification', async (db) => {
    await extra(db);
    await as(db, M); assert.equal((await one(db, `select app.minor_restricted() v`)).v, true);
    await as(db, 'postgres');
    await db.query(`insert into public.guardian_consents (user_id, guardian_name, guardian_email, relationship, verified_at, verification_method, consent_version, scope)
                    values ('${M}','Parent Mo','parent@example.com','parent',now(),'email_link','2026-11-05','{account,learning}')`);
    await as(db, M); assert.equal((await one(db, `select app.minor_restricted() v`)).v, false);
  }),

  t('r11: restrictive policies exist for guest writes, unconsented minors and minor selling', async (db) => {
    await as(db, 'postgres');
    const rows = await q(db, `select tablename, policyname, permissive from pg_policies where policyname like 'r11_%'`);
    const has = (tbl, pol) => rows.some((r) => r.tablename === tbl && r.policyname === pol && r.permissive === 'RESTRICTIVE');
    assert.ok(has('mkt_products', 'r11_no_guest_write'));
    assert.ok(has('projects', 'r11_no_guest_write'));
    assert.ok(has('mkt_products', 'r11_no_minor_sell'));
    assert.ok(has('messages', 'r11_minor_consent'));
    assert.ok(has('mkt_orders', 'r11_minor_consent'));
  }),

  t('r11: tutor payout intents are service-only (no client read or write)', async (db) => {
    await as(db, 'postgres');
    await db.query(`insert into public.tutor_payout_intents (user_id, network, last4) values ('${U.tutorA}','MTN','1234')`);
    await as(db, U.tutorA);
    await fails(db, `select * from public.tutor_payout_intents`, [], '42501');
  }),
];
