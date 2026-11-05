// Round 12 money: L4. A tutor's plan students.max (Free = 2) also caps PAID course enrolments, refused at checkout.
// Migration: 20261106020000_r12_money_l4.sql
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t, courseId } = helpers;
const L3 = 'user_r12_l4_three';
let flw = 7200000;

async function third(db) {
  await as(db, 'postgres');
  await q(db, `insert into public.profiles (id, username, display_name, account_status, joined_at) values ($1,'r12l4three','Learner Three','active',now()) on conflict do nothing`, [L3]);
  await q(db, `insert into public.profile_private (user_id, email, date_of_birth) values ($1,'l4three@example.com','1999-02-02') on conflict do nothing`, [L3]);
  await q(db, `insert into public.user_roles (user_id, role) values ($1,'learner') on conflict do nothing`, [L3]);
}
async function checkout(db, who, cid) { await as(db, who); return (await one(db, `select public.create_checkout('course', $1) c`, [cid])).c; }
async function buy(db, who, cid) {
  const co = await checkout(db, who, cid);
  await as(db, 'service');
  await q(db, `select public.apply_flutterwave_payment($1,$2,'successful',$3,'UGX','mobilemoneyug')`, [co.tx_ref, ++flw, co.amount_ugx]);
  return co;
}
const students = async (db) => { await as(db, 'postgres'); return Number((await one(db, `select app.tutor_student_count($1) v`, [U.tutorA])).v); };

export const tests = [
  t('r12 L4: Free tutor (students.max 2): the third paying learner is refused at checkout, before paying', async (db) => {
    await third(db);
    const cid = await courseId(db, 'fullstack-nextjs-supabase');
    await buy(db, U.alice, cid); await buy(db, U.bob, cid);
    assert.equal(await students(db), 2);
    await as(db, L3);
    await fails(db, `select public.create_checkout('course', $1)`, [cid], /not taking new students/);
    await as(db, 'postgres');
    assert.equal((await one(db, `select count(*)::int n from public.payments where user_id=$1`, [L3])).n, 0, 'no payment opened');
    assert.equal(await students(db), 2);
  }),

  t('r12 L4: open checkouts reserve seats, so parallel buyers cannot overshoot the cap', async (db) => {
    await third(db);
    const cid = await courseId(db, 'fullstack-nextjs-supabase');
    await buy(db, U.alice, cid);
    await checkout(db, U.bob, cid);                     // pending, not yet paid: holds the last seat
    await as(db, L3);
    await fails(db, `select public.create_checkout('course', $1)`, [cid], /not taking new students/);
    // a stale (abandoned > 1 h) checkout frees the seat again
    await as(db, 'postgres');
    await q(db, `update public.payments set created_at = now() - interval '2 hours' where user_id=$1 and status='pending'`, [U.bob]);
    await checkout(db, L3, cid);
  }),

  t('r12 L4: existing students keep buying from a full tutor; an unlimited plan is not capped', async (db) => {
    await third(db);
    const cid = await courseId(db, 'fullstack-nextjs-supabase');
    const other = await courseId(db, 'web-foundations');
    await buy(db, U.alice, cid); await buy(db, U.bob, cid);
    await as(db, 'postgres');
    await q(db, `update public.courses set is_free=false, price_ugx=30000 where id=$1`, [other]);
    await checkout(db, U.alice, other);                 // already this tutor's student: allowed on a full Free plan
    await as(db, L3);
    await fails(db, `select public.create_checkout('course', $1)`, [other], /not taking new students/);
    await as(db, 'postgres');
    await q(db, `update public.profiles set tutor_plan='pro' where id=$1`, [U.tutorA]);
    assert.equal((await one(db, `select app.plan_limit('tutor', 'pro', 'students.max') v`)).v, null);
    await buy(db, L3, cid);
    assert.equal(await students(db), 3);
  }),

  t('r12 L4: capacity guard is not callable by API roles', async (db) => {
    await as(db, 'postgres');
    const r = await q(db, `select r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values ('anon'),('authenticated')) r(rolname)
      where n.nspname='app' and p.proname='guard_course_checkout_capacity' and has_function_privilege(r.rolname, p.oid, 'execute')`);
    assert.deepEqual(r, []);
  }),
];
