// r11/profile-api: account erasure hardening (migration 20261105003000_account_erase_hardening.sql).
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';
const { as, q, one, fails, t } = helpers;

export const tests = [
  t('ERASE-1: erase_user completes with a non-profile actor (was an FK violation that rolled back the whole erase)', async (db) => {
    await as(db, 'postgres');
    await db.query(`insert into public.data_requests (user_id, kind, created_at) values ($1, 'delete', now() - interval '25 hours')`, [U.bob]);
    await as(db, 'service');
    await db.query(`select public.erase_user($1, 'privacy-job')`, [U.bob]);
    await as(db, 'postgres');
    const p = await one(db, `select display_name, username, account_status, deleted_at from public.profiles where id = $1`, [U.bob]);
    assert.equal(p.display_name, 'Deleted user'); assert.equal(p.username, null); assert.equal(p.account_status, 'banned'); assert.ok(p.deleted_at);
    const r = await one(db, `select status, handled_by, handled_actor, completed_at from public.data_requests where user_id = $1 and kind = 'delete'`, [U.bob]);
    assert.equal(r.status, 'completed'); assert.equal(r.handled_by, null); assert.equal(r.handled_actor, 'privacy-job'); assert.ok(r.completed_at);
    assert.equal((await q(db, `select 1 from public.profile_private where user_id = $1`, [U.bob])).length, 0, 'private data gone');
  }),
  t('ERASE-2: the Clerk user.deleted path completes too', async (db) => {
    await as(db, 'service');
    await db.query(`select public.erase_user($1, 'clerk:user.deleted')`, [U.alice]);
    await as(db, 'postgres');
    assert.equal((await one(db, `select display_name from public.profiles where id = $1`, [U.alice])).display_name, 'Deleted user');
  }),
  t('ERASE-3: the privacy job can never erase the root admin (super_admin)', async (db) => {
    await as(db, 'service');
    await fails(db, `select public.erase_user($1, 'privacy-job')`, [U.root], '42501');
    await as(db, 'postgres');
    assert.equal((await one(db, `select display_name from public.profiles where id = $1`, [U.root])).display_name, 'Root Admin');
  }),
  t('ERASE-4: users cannot back-date or self-complete a request (cool-off cannot be skipped)', async (db) => {
    await as(db, U.bob);
    const r = await one(db, `insert into public.data_requests (user_id, kind, status, created_at, handled_actor) values ($1, 'delete', 'processing', now() - interval '3 days', 'x') returning status, created_at, handled_actor`, [U.bob]);
    assert.equal(r.status, 'received', 'status forced to received'); assert.equal(r.handled_actor, null);
    assert.ok(Date.now() - new Date(r.created_at).getTime() < 60000, 'created_at forced to now (no back-dating past the cool-off)');
    await as(db, U.alice);
    const o = await one(db, `insert into public.data_requests (user_id, kind) values ($1, 'export') returning user_id`, [U.bob]);   // someone else's id is replaced by yours
    assert.equal(o.user_id, U.alice);
  }),
  t('ERASE-5: one open delete request per user', async (db) => {
    await as(db, U.bob);
    await db.query(`insert into public.data_requests (user_id, kind) values ($1, 'delete')`, [U.bob]);
    await fails(db, `insert into public.data_requests (user_id, kind) values ($1, 'delete')`, [U.bob], '23505');
  }),
  t('ERASE-6: owner can cancel own open request, not complete it, not touch others', async (db) => {
    await as(db, U.bob);
    await db.query(`insert into public.data_requests (user_id, kind) values ($1, 'delete')`, [U.bob]);
    await as(db, U.alice);
    await db.query(`insert into public.data_requests (user_id, kind) values ($1, 'delete')`, [U.alice]);
    await as(db, U.bob);
    await fails(db, `update public.data_requests set status = 'completed' where user_id = $1`, [U.bob], '42501');
    const other = await db.query(`update public.data_requests set status = 'cancelled' where user_id = $1`, [U.alice]);
    assert.equal(other.rowCount, 0, 'cannot cancel someone else');
    const own = await db.query(`update public.data_requests set status = 'cancelled', cancelled_at = now() where user_id = $1 and kind = 'delete' and status = 'received'`, [U.bob]);
    assert.equal(own.rowCount, 1);
    await db.query(`savepoint s6`);
    let changed = 0; try { changed = (await db.query(`update public.data_requests set handled_by = $1 where user_id = $1`, [U.bob])).rowCount; } catch (e) { await db.query(`rollback to savepoint s6`); }
    assert.equal(changed, 0, 'a cancelled request cannot be edited further');
  }),
  t('ERASE-7: erase_user stays service-role only', async (db) => {
    await as(db, U.bob);
    await fails(db, `select public.erase_user($1, 'x')`, [U.bob], '42501');
  }),
];
