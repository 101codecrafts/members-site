// Round 12 security: staff MFA in the database (fva claim), security.* settings root-only, least-privilege grants.
// Migration: 20261105120000_r12_security.sql
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;

/* like helpers.as(), with extra Clerk session claims (fva) */
async function asWith(db, who, extra) {
  await db.query('reset role');
  await db.query('set local role authenticated');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who, role: 'authenticated', ...extra })]);
}
async function setMfaFlag(db, on) {
  await as(db, 'postgres');
  await q(db, `update public.site_settings set value = $1::jsonb where key = 'security.require_staff_mfa'`, [JSON.stringify(on)]);
}

export const tests = [
  t('r12: security.require_staff_mfa exists, defaults to false, and is not public', async (db) => {
    await as(db, 'postgres');
    const r = await one(db, `select value, is_public from public.site_settings where key = 'security.require_staff_mfa'`);
    assert.equal(r.value, false);
    assert.equal(r.is_public, false);
  }),

  t('r12: flag off -> admins keep working without fva (no behaviour change)', async (db) => {
    await as(db, U.admin);
    assert.equal((await one(db, `select app.is_admin() a`)).a, true);
    await as(db, U.root);
    assert.equal((await one(db, `select app.admin_has('users') a`)).a, true);
    await fails(db, `select public.admin_revoke_invite('00000000-0000-0000-0000-000000000000')`, [], /invite not pending/);   // passed require_root
  }),

  t('r12: flag on -> admin/root powers need a second factor in the session (fva[1] >= 0)', async (db) => {
    await setMfaFlag(db, true);
    for (const claims of [{}, { fva: [0, -1] }, { fva: 'x' }]) {
      await asWith(db, U.admin, claims);
      assert.equal((await one(db, `select app.is_admin() a`)).a, false, JSON.stringify(claims));
      await fails(db, `select public.admin_list_admins()`, [], '42501');
      await asWith(db, U.root, claims);
      assert.equal((await one(db, `select app.admin_has('users') a`)).a, false);
      await fails(db, `select public.admin_revoke_invite('00000000-0000-0000-0000-000000000000')`, [], /two-factor/);
    }
    await asWith(db, U.admin, { fva: [3, 3] });
    assert.equal((await one(db, `select app.is_admin() a`)).a, true);
    await asWith(db, U.root, { fva: [0, 0] });
    assert.equal((await one(db, `select app.admin_has('users') a`)).a, true);
    await fails(db, `select public.admin_revoke_invite('00000000-0000-0000-0000-000000000000')`, [], /invite not pending/);
    await q(db, `select public.admin_list_admins()`);
    // non-staff are unaffected either way
    await asWith(db, U.alice, { fva: [0, -1] });
    assert.equal((await one(db, `select app.is_admin() a`)).a, false);
  }),

  t('r12: security.* settings change only through root (with MFA when required); other settings unchanged', async (db) => {
    await as(db, U.admin);
    await fails(db, `select public.admin_set_setting('security.require_staff_mfa', 'false'::jsonb, false)`, [], /root admin only/);
    await q(db, `select public.admin_set_setting('support.email_note', '"hi"'::jsonb, false)`);
    await as(db, U.root);
    await q(db, `select public.admin_set_setting('security.require_staff_mfa', 'true'::jsonb, false)`);
    await asWith(db, U.root, { fva: [0, -1] });
    await fails(db, `select public.admin_set_setting('security.require_staff_mfa', 'false'::jsonb, false)`, [], '42501');
    await asWith(db, U.root, { fva: [0, 0] });
    await q(db, `select public.admin_set_setting('security.require_staff_mfa', 'false'::jsonb, false)`);
    await as(db, 'service');
    await q(db, `update public.site_settings set value = 'false'::jsonb where key = 'security.require_staff_mfa'`);
  }),

  t('r12: anon/authenticated hold no TRUNCATE/REFERENCES/TRIGGER on any public table; default privileges agree', async (db) => {
    await as(db, 'postgres');
    const bad = await q(db, `select c.relname, r.rolname, p.priv from pg_class c join pg_namespace n on n.oid=c.relnamespace
        cross join (values ('anon'),('authenticated')) r(rolname) cross join (values ('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(priv)
       where n.nspname='public' and c.relkind in ('r','p') and has_table_privilege(r.rolname, c.oid, p.priv)`);
    assert.deepEqual(Array.isArray(bad) ? bad : bad.rows, []);
    // a table created after the migration does not get them either
    await q(db, `create table public.r12_probe (id int primary key)`);
    const t2 = await one(db, `select has_table_privilege('authenticated','public.r12_probe','TRUNCATE') tr`);
    assert.equal(t2.tr, false);
  }),
];
