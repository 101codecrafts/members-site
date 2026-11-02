// Security-review regression suite (docs/SECURITY_REVIEW.md SR-00 … SR-18).
// Each test proves one fix is still in place; a failure here is a go-live blocker.
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t, courseId } = helpers;

// Single source of truth for the "no table without RLS" CI guard (SR-01).
export const TABLES_WITHOUT_RLS_SQL = `
  select n.nspname || '.' || c.relname as tbl
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r','p') and n.nspname in ('public','app','analytics') and not c.relrowsecurity`;

const SERVICE_ONLY = [
  'public.apply_flutterwave_payment(text,bigint,text,numeric,text,text,jsonb)',
  'public.set_payment_checkout_link(text,text)',
  'public.complete_refund(uuid,boolean,bigint,text,jsonb)',
  'public.mark_payout_processing(uuid,bigint)',
  'public.complete_payout(text,boolean,text,jsonb)',
  'public.record_subscription_renewal(bigint,text,bigint,text,numeric,text,jsonb)',
  'public.erase_user(text,text)',
  'public.attach_referral(text,text)',
];

export const tests = [
  t('SR-01: CI guard — no table in public/app/analytics lacks RLS (and the guard catches one that does)', async (db) => {
    await as(db, 'postgres');
    assert.deepEqual(await q(db, TABLES_WITHOUT_RLS_SQL), [], 'tables without RLS');
    // meta-test: the guard query must actually detect a table created without RLS
    await db.query(`create table public.__sr01_probe (id int)`);
    const hit = await q(db, TABLES_WITHOUT_RLS_SQL);
    assert.ok(hit.some((r) => r.tbl === 'public.__sr01_probe'), 'guard detects missing RLS');
  }),

  t('SR-00/SR-00b: privileged payment + erase/referral RPCs are service_role only (privilege AND in-function check)', async (db) => {
    await as(db, 'postgres');
    for (const fn of SERVICE_ONLY) {
      for (const role of ['anon', 'authenticated', 'public']) {
        if (role === 'public') {
          const r = await one(db, `select bool_or(a.grantee = 0) x from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = $1::regprocedure`, [fn]);
          assert.equal(r.x, false, `${fn} executable by PUBLIC`);
        } else {
          const r = await one(db, `select has_function_privilege($1, $2, 'execute') x`, [role, fn]);
          assert.equal(r.x, false, `${fn} executable by ${role}`);
        }
      }
      assert.equal((await one(db, `select has_function_privilege('service_role', $1, 'execute') x`, [fn])).x, true, `${fn} service_role`);
    }
    // in-function check: even with EXECUTE granted, a non-backend JWT is refused
    await as(db, 'postgres');
    await db.query(`grant execute on function public.erase_user(text,text) to authenticated`);
    await as(db, U.alice);
    await fails(db, `select public.erase_user($1)`, [U.bob], /service role only/);
    await as(db, U.alice);
    await fails(db, `select public.attach_referral($1, 'X')`, [U.bob], '42501');
  }),

  t('SR-02: meeting_url never sits in the catalog row; private table unreadable by non-bookers', async (db) => {
    await as(db, 'postgres');
    const col = await q(db, `select 1 from information_schema.columns where table_schema='public' and table_name='tutor_sessions' and column_name='meeting_url'`);
    assert.equal(col.length, 0, 'tutor_sessions.meeting_url must not exist');
    const s = await one(db, `insert into public.tutor_sessions (tutor_id, kind, title, starts_at, capacity, price_ugx)
      values ($1, 'group', 'Office hours', now() + interval '2 days', 5, 10000) returning id`, [U.tutorA]);
    await q(db, `insert into public.tutor_session_private (session_id, meeting_url) values ($1, 'https://meet.example.com/x')`, [s.id]);
    await as(db, U.bob);
    assert.equal((await q(db, `select * from public.tutor_session_private`)).length, 0, 'non-booker reads no join links');
    await as(db, U.tutorA);
    assert.equal((await q(db, `select * from public.tutor_session_private where session_id=$1`, [s.id])).length, 1, 'owner tutor reads own link');
    await as(db, 'anon');
    await fails(db, `select * from public.tutor_session_private`, [], '42501');
  }),

  t('SR-03: trusted-caller check ignores definer context (current_user=postgres but JWT=authenticated)', async (db) => {
    // simulate being inside a SECURITY DEFINER function: current_user is the owner, JWT is the learner
    await as(db, 'postgres');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: U.alice, role: 'authenticated' })]);
    assert.equal((await one(db, `select current_user u`)).u, 'postgres');
    assert.equal((await one(db, `select app.is_backend() b`)).b, false, 'definer context must not be trusted');
    await fails(db, `select app.require_backend()`, [], '42501');
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    assert.equal((await one(db, `select app.is_backend() b`)).b, true);
  }),

  t('SR-04: alter default privileges — a NEW function/table is not reachable by anon/authenticated', async (db) => {
    await as(db, 'postgres');
    await db.query(`create function public.__sr04_probe() returns int language sql as 'select 1'`);
    await db.query(`create table public.__sr04_tbl (id int)`);
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await one(db, `select has_function_privilege($1, 'public.__sr04_probe()', 'execute') x`, [role])).x, false, `${role} exec new fn`);
    }
    assert.equal((await one(db, `select has_table_privilege('anon', 'public.__sr04_tbl', 'select') x`)).x, false, 'anon select new table');
  }),

  t('SR-14: payout hold can never be shorter than the refund window', async (db) => {
    await as(db, U.root);
    await fails(db, `select public.admin_set_setting('payouts.hold_days', '3'::jsonb)`, [], /hold days must be >= refund window/);
    await q(db, `select public.admin_set_setting('payouts.hold_days', '30'::jsonb)`);
    // even if a bad value were written directly, available_balance uses greatest(hold, window)
    await as(db, 'postgres');
    const src = (await one(db, `select prosrc from pg_proc where oid = 'app.available_balance(text)'::regprocedure`)).prosrc;
    assert.match(src, /greatest\(/);
  }),

  t('SR-17: amount and tx_ref are server-created; client amount ignored for non-donations; webhook rejects mismatch', async (db) => {
    const cid = await courseId(db, 'fullstack-nextjs-supabase');
    await as(db, U.alice);
    const co = (await one(db, `select public.create_checkout('course', $1, null, 1, null, 1) c`, [cid])).c;
    assert.equal(co.amount_ugx, 50000, 'client-supplied UGX 1 ignored');
    assert.match(co.tx_ref, /^[a-z]{3}[-_]/, 'server-generated tx_ref');
    await as(db, 'service');
    await fails(db, `select public.apply_flutterwave_payment($1, 9091, 'successful', 1, 'UGX', 'mobilemoneyug')`, [co.tx_ref], /amount|underpa|mismatch/i)
      .catch(async () => {
        const p = await one(db, `select status from public.payments where tx_ref=$1`, [co.tx_ref]);
        assert.notEqual(p.status, 'successful', 'underpaid tx must not succeed');
      });
  }),
];
