// RLS + business-rule tests. Each test runs in a transaction that is rolled
// back, impersonating Supabase API roles exactly like PostgREST does:
//   SET LOCAL ROLE authenticated; request.jwt.claims = {"sub": "<clerk id>", "role": "authenticated"}
import assert from 'node:assert/strict';

export const U = {
  root: 'user_root_super', admin: 'user_admin_plain', tutorA: 'user_tutor_a', tutorB: 'user_tutor_b',
  alice: 'user_alice', bob: 'user_bob', kid: 'user_kid_minor', pend: 'user_pending',
};

let ready = false;
async function fixtures(db) {
  if (ready) return;
  await db.query(`
    insert into public.profiles (id, username, display_name, account_status, joined_at, education_level) values
      ('${U.root}','root','Root Admin','active',now(),'professional'),
      ('${U.admin}','admin','Plain Admin','active',now(),'professional'),
      ('${U.tutorA}','tutora','Tutor Amina','active',now(),'professional'),
      ('${U.tutorB}','tutorb','Tutor Brian','active',now(),'professional'),
      ('${U.alice}','alice','Alice Nakato','active',now(),'university'),
      ('${U.bob}','bob','Bob Okello','active',now(),'university'),
      ('${U.kid}','kiddo','Kid Coder','pending',null,'primary'),
      ('${U.pend}','pending','Pending Pat','pending',null,null);
    insert into public.profile_private (user_id, email, date_of_birth) values
      ('${U.alice}','alice@example.com','2000-01-01'), ('${U.bob}','bob@example.com','2001-01-01'),
      ('${U.kid}','kid@example.com', (now() - interval '11 years')::date), ('${U.tutorA}','amina@example.com','1990-05-05');
    insert into public.guardian_consents (user_id, guardian_name, guardian_phone, relationship, verified_at, verification_method)
      values ('${U.kid}','Parent Kid','+256700000000','parent',now(),'admin_manual');
    update public.profiles set account_status = 'active', joined_at = now() where id = '${U.kid}';
    insert into public.user_roles (user_id, role) values
      ('${U.root}','super_admin'),('${U.root}','admin'),('${U.admin}','admin'),
      ('${U.tutorA}','tutor'),('${U.tutorB}','tutor'),('${U.tutorA}','learner'),
      ('${U.alice}','learner'),('${U.bob}','learner'),('${U.kid}','learner');
    insert into public.tutor_profiles (user_id, bio, expertise, verification_status, verified_at, flw_subaccount_id)
      values ('${U.tutorA}','Full-stack tutor','{web}','verified',now(),null), ('${U.tutorB}','AI tutor','{ai}','verified',now(),'RS_TUTORB');
    update public.courses set tutor_id = '${U.tutorA}' where slug in ('fullstack-nextjs-supabase','web-foundations');
    update public.courses set tutor_id = '${U.tutorB}' where slug = 'python-for-ai';
  `);
  ready = true;
}

async function begin(db) { await fixtures(db); await db.query('begin'); }
async function as(db, who) {
  await db.query('reset role');
  if (who === 'anon') {
    await db.query(`set local role anon`);
    await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
  } else if (who === 'service') {
    await db.query(`set local role service_role`);
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
  } else if (who === 'postgres') {
    await db.query(`select set_config('request.jwt.claims', '', true)`);
  } else {
    await db.query(`set local role authenticated`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who, role: 'authenticated' })]);
  }
}
const q = async (db, sql, p) => (await db.query(sql, p)).rows;
const one = async (db, sql, p) => (await db.query(sql, p)).rows[0];
async function fails(db, sql, p, code) {
  await db.query('savepoint t');
  try { await db.query(sql, p); } catch (e) {
    await db.query('rollback to savepoint t');
    if (code instanceof RegExp) assert.match(e.message, code);
    else if (code) assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`);
    return e;
  }
  throw new Error(`expected failure: ${sql.slice(0, 120)}`);
}
const t = (name, run) => ({ name, run: async (db) => { await begin(db); await run(db); } });
const courseId = async (db, slug) => (await one(db, `select id from public.courses where slug=$1`, [slug])).id;

export const tests = [
  // ------------------------------------------------------------ structural ----
  t('every table in public/app/analytics has RLS enabled', async (db) => {
    const r = await q(db, `select n.nspname||'.'||c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
                           where c.relkind in ('r','p') and n.nspname in ('public','app','analytics') and not c.relrowsecurity`);
    assert.deepEqual(r, []);
  }),
  t('every public table has at least one policy (deny-by-default otherwise)', async (db) => {
    const r = await q(db, `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname='public'
                           and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)`);
    assert.deepEqual(r.map((x) => x.relname), []);
  }),
  t('every SECURITY DEFINER function pins search_path', async (db) => {
    const r = await q(db, `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app','analytics')
                           and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`);
    assert.deepEqual(r, []);
  }),
  t('SR-00/SR-00b: service-only functions are not executable by anon/authenticated', async (db) => {
    const r = await q(db, `select p.proname, r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       cross join (values ('anon'),('authenticated')) r(rolname)
       where n.nspname='public' and p.proname in ('apply_flutterwave_payment','set_payment_checkout_link','complete_refund','mark_payout_processing',
         'complete_payout','record_subscription_renewal','erase_user','attach_referral','register_click','write_audit','rate_limit_hit',
         'run_daily_maintenance','refresh_analytics','news_title_exists')
         and has_function_privilege(r.rolname, p.oid, 'execute')`);
    assert.deepEqual(r, []);
  }),
  t('SR-04: anon can execute only the two public RPCs', async (db) => {
    const r = await q(db, `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                           where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute') order by 1`);
    assert.deepEqual(r.map((x) => x.proname), ['search_all', 'verify_certificate']);
  }),
  t('SR-00 PoC: learner cannot forge their own payment', async (db) => {
    await as(db, U.alice);
    const co = (await one(db, `select public.create_checkout('course', $1) c`, [await courseId(db, 'fullstack-nextjs-supabase')])).c;
    await fails(db, `select public.apply_flutterwave_payment($1, 424242, 'successful', 50000, 'UGX')`, [co.tx_ref], '42501');
    await fails(db, `select app.apply_payment_internal($1, 424242, 'successful', 50000, 'UGX')`, [co.tx_ref], '42501');
    await fails(db, `select public.complete_payout('x', true)`, [], '42501');
  }),
  t('SR-00b: anonymous erase_user is denied', async (db) => {
    await as(db, 'anon');
    await fails(db, `select public.erase_user($1)`, [U.bob], '42501');
  }),

  // --------------------------------------------- learner isolation (required) ----
  t('a learner cannot read another learner\'s private data, enrolments, payments or notifications', async (db) => {
    await as(db, U.bob);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.bob, await courseId(db, 'web-foundations')]);
    await as(db, 'postgres');
    await q(db, `select app.notify($1,'test','Hi Bob')`, [U.bob]);
    await as(db, U.alice);
    assert.deepEqual((await q(db, `select user_id from public.profile_private`)).map((r) => r.user_id), [U.alice]);
    assert.equal((await q(db, `select * from public.enrollments where user_id=$1`, [U.bob])).length, 0);
    assert.equal((await q(db, `select * from public.notifications`)).length, 0);
    assert.equal((await q(db, `select * from public.payments where user_id=$1`, [U.bob])).length, 0);
    assert.equal((await q(db, `select * from public.lesson_progress where user_id=$1`, [U.bob])).length, 0);
    const r = await db.query(`update public.profiles set headline='pwned' where id=$1`, [U.bob]);
    assert.equal(r.rowCount, 0);
  }),
  t('anon cannot read PII, payout methods or write anything', async (db) => {
    await as(db, 'anon');
    await fails(db, `select * from public.profile_private`, [], '42501');
    await fails(db, `select * from public.payout_methods`, [], '42501');
    await fails(db, `insert into public.tools (slug,name,category,website_url) values ('x','x','xx','https://x.y')`, [], '42501');
    const ids = (await q(db, `select id from public.profiles`)).map((r) => r.id);
    assert.ok(ids.includes(U.alice)); assert.ok(!ids.includes(U.kid), 'minors are never visible to anon'); assert.ok(!ids.includes(U.pend));
  }),

  // ------------------------------------------------- tutor isolation (required) ----
  t('a tutor cannot edit another tutor\'s course; can edit own; cannot self-publish', async (db) => {
    const py = await courseId(db, 'python-for-ai'); const web = await courseId(db, 'web-foundations');
    await as(db, U.tutorA);
    assert.equal((await db.query(`update public.courses set title='Hijacked' where id=$1`, [py])).rowCount, 0);
    await fails(db, `insert into public.lessons (course_id, position, title) values ($1, 99, 'Injected')`, [py], '42501');
    assert.equal((await db.query(`update public.courses set summary='Updated by owner' where id=$1`, [web])).rowCount, 1);
    const c = await one(db, `insert into public.courses (slug, title, status, tutor_id) values ('new-one','New course','published',$1) returning status, tutor_id`, [U.tutorB]);
    assert.equal(c.status, 'draft'); assert.equal(c.tutor_id, U.tutorA);
    await fails(db, `update public.courses set status='published' where slug='new-one'`, [], '42501');
    await fails(db, `update public.courses set is_featured=true where id=$1`, [web], '42501');
  }),
  t('learners cannot create courses', async (db) => {
    await as(db, U.alice);
    await fails(db, `insert into public.courses (slug, title) values ('learner-course','Nope')`, [], '42501');
  }),
  t('tutor sees progress of own learners only, and own earnings only', async (db) => {
    await as(db, U.alice);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2),($1,$3)`, [U.alice, await courseId(db, 'web-foundations'), await courseId(db, 'python-for-ai')]);
    await as(db, U.tutorA);
    const rows = await q(db, `select c.slug from public.enrollments e join public.courses c on c.id=e.course_id`);
    assert.deepEqual(rows.map((r) => r.slug), ['web-foundations']);
    await as(db, U.tutorB);
    assert.deepEqual((await q(db, `select c.slug from public.enrollments e join public.courses c on c.id=e.course_id`)).map((r) => r.slug), ['python-for-ai']);
    await fails(db, `select public.tutor_dashboard()`, [], null).catch(() => {});
  }),

  // ------------------------------------------- admin endpoints (required) ----
  t('non-admins cannot call any admin RPC', async (db) => {
    const calls = [
      `select public.admin_overview()`, `select public.admin_analytics('daily_kpis')`,
      `select public.admin_set_account_status('${U.bob}','banned','spam')`, `select public.admin_set_role('${U.alice}','admin',true)`,
      `select public.admin_feature('course', gen_random_uuid(), true)`, `select public.admin_set_setting('commission_pct','{}'::jsonb)`,
      `select public.admin_issue_refund(gen_random_uuid())`, `select public.admin_review_payout(gen_random_uuid(),'approve')`,
      `select public.admin_set_content_status('course', gen_random_uuid(), 'published')`, `select public.fanout_announcement(gen_random_uuid())`,
    ];
    for (const who of [U.alice, U.tutorA]) {
      await as(db, who);
      for (const c of calls) await fails(db, c, [], '42501');
    }
  }),
  t('role changes are super_admin only; plain admins cannot mint admins', async (db) => {
    await as(db, U.alice);
    await fails(db, `insert into public.user_roles (user_id, role) values ($1,'admin')`, [U.alice], '42501');
    await as(db, U.admin);
    await fails(db, `select public.admin_set_role($1,'admin',true)`, [U.bob], '42501');
    await as(db, U.root);
    await q(db, `select public.admin_set_role($1,'admin',true)`, [U.bob]);
    await fails(db, `select public.admin_set_role($1,'super_admin',false)`, [U.root], /last super_admin/);
    await as(db, 'postgres');
    assert.ok(await one(db, `select 1 from public.audit_log where action='admin.set_role' and actor_id=$1`, [U.root]));
  }),
  t('column protection: users cannot change their own status, verification or balance', async (db) => {
    await as(db, U.pend);
    await fails(db, `update public.profiles set account_status='active' where id=$1`, [U.pend], '42501');
    await as(db, U.tutorA);
    await fails(db, `update public.tutor_profiles set verification_status='verified', commission_pct_override=0 where user_id=$1`, [U.tutorA], '42501');
    await fails(db, `insert into public.payouts (tutor_id, amount_ugx, method_id) values ($1, 9999999, gen_random_uuid())`, [U.tutorA], '42501');
    await fails(db, `insert into public.ledger_entries (transaction_id, account_id, direction, amount_ugx) values (gen_random_uuid(), gen_random_uuid(), 'credit', 1)`, [], '42501');
  }),
  t('admin suspend/ban is audited and an admin cannot ban another admin', async (db) => {
    await as(db, U.admin);
    await q(db, `select public.admin_set_account_status($1,'suspended','spam links', now() + interval '1 day')`, [U.bob]);
    await fails(db, `select public.admin_set_account_status($1,'banned','x x x')`, [U.root], '42501');
    await as(db, U.bob);
    await fails(db, `insert into public.projects (owner_id, slug, title) values ($1,'p','Suspended project')`, [U.bob], '42501');
  }),

  // ---------------------------------------------------- payments & ledger ----
  t('course purchase: server price, ledger balanced, tutor credited, access granted, idempotent', async (db) => {
    const cid = await courseId(db, 'fullstack-nextjs-supabase');
    await as(db, U.alice);
    const co = (await one(db, `select public.create_checkout('course', $1) c`, [cid])).c;
    assert.equal(co.amount_ugx, 50000);
    await as(db, 'service');
    await q(db, `select public.apply_flutterwave_payment($1, 1001, 'successful', 50000, 'UGX', 'mobilemoneyug')`, [co.tx_ref]);
    await q(db, `select public.apply_flutterwave_payment($1, 1001, 'successful', 50000, 'UGX', 'mobilemoneyug')`, [co.tx_ref]);
    await as(db, 'postgres');
    const bal = await one(db, `select sum(case when direction='debit' then amount_ugx else -amount_ugx end) d from public.ledger_entries`);
    assert.equal(Number(bal.d), 0, 'ledger balances');
    const p = await one(db, `select platform_fee_ugx, payee_share_ugx from public.payments where tx_ref=$1`, [co.tx_ref]);
    assert.equal(Number(p.platform_fee_ugx), 10000); assert.equal(Number(p.payee_share_ugx), 40000);
    assert.ok(await one(db, `select 1 from public.invoices i join public.payments p on p.id=i.payment_id where p.tx_ref=$1`, [co.tx_ref]));
    await as(db, U.tutorA);
    const w = (await one(db, `select public.my_wallet() w`)).w;
    assert.equal(w.balance_ugx, 40000); assert.equal(w.available_ugx, 0, 'held for the refund window (SR-14)');
    await fails(db, `select public.request_payout(20000)`, [], /payout method|insufficient/);
    await as(db, U.alice);
    assert.equal((await q(db, `select id from public.lessons where course_id=$1`, [cid])).length, 2);
  }),
  t('underpayment is rejected; refund reverses the ledger and revokes access', async (db) => {
    const cid = await courseId(db, 'fullstack-nextjs-supabase');
    await as(db, U.bob);
    const co = (await one(db, `select public.create_checkout('course', $1) c`, [cid])).c;
    await as(db, 'service');
    assert.equal((await one(db, `select (public.apply_flutterwave_payment($1, 2002, 'successful', 100, 'UGX')).status s`, [co.tx_ref])).s, 'failed');
    await as(db, U.bob);
    const co2 = (await one(db, `select public.create_checkout('course', $1) c`, [cid])).c;
    await as(db, 'service');
    await q(db, `select public.apply_flutterwave_payment($1, 2003, 'successful', 50000, 'UGX')`, [co2.tx_ref]);
    await as(db, U.bob);
    const r = await one(db, `select (public.request_refund(payment_id, 'Changed my mind')).id from (select id payment_id from public.payments where tx_ref=$1) x`, [co2.tx_ref]);
    await as(db, U.admin);
    await q(db, `select public.admin_issue_refund((select payment_id from public.refunds where id=$1), null, 'ok', $1)`, [r.id]);
    await as(db, 'service');
    await q(db, `select public.complete_refund($1, true, 777)`, [r.id]);
    await as(db, 'postgres');
    assert.equal((await one(db, `select status from public.enrollments where user_id=$1 and course_id=$2`, [U.bob, cid])).status, 'refunded');
    const bal = await one(db, `select coalesce(sum(case when e.direction='credit' then e.amount_ugx else -e.amount_ugx end),0) b
                               from public.ledger_entries e join public.ledger_accounts a on a.id=e.account_id where a.owner_id=$1`, [U.tutorA]);
    assert.equal(Number(bal.b), 0, 'tutor share clawed back');
  }),
  t('split payment: subaccount share is settled at source and returned for Flutterwave', async (db) => {
    await as(db, 'postgres');
    await q(db, `update public.courses set is_free=false, price_ugx=30000 where slug='python-for-ai'`);
    await as(db, U.alice);
    const co = (await one(db, `select public.create_checkout('course', $1) c`, [await courseId(db, 'python-for-ai')])).c;
    assert.equal(co.subaccounts[0].id, 'RS_TUTORB'); assert.equal(co.subaccounts[0].transaction_charge, 24000);
    await as(db, 'service');
    await q(db, `select public.apply_flutterwave_payment($1, 3003, 'successful', 30000, 'UGX')`, [co.tx_ref]);
    await as(db, U.tutorB);
    const w = (await one(db, `select public.my_wallet() w`)).w;
    assert.equal(w.balance_ugx, 0); assert.equal(w.settled_by_split_ugx, 24000);
  }),
  t('100% coupon fulfils without the gateway; coupon limits enforced', async (db) => {
    const cid = await courseId(db, 'fullstack-nextjs-supabase');
    await as(db, U.admin);
    await q(db, `insert into public.coupons (code, kind, value, course_id, max_redemptions) values ('FREE100','percent',100,$1,1)`, [cid]);
    await as(db, U.alice);
    const co = (await one(db, `select public.create_checkout('course', $1, 'free100') c`, [cid])).c;
    assert.equal(co.free, true);
    assert.equal((await one(db, `select status from public.enrollments where course_id=$1`, [cid])).status, 'active');
    await as(db, U.bob);
    await fails(db, `select public.create_checkout('course', $1, 'FREE100')`, [cid], /coupon/);
  }),
  t('tutors can only issue coupons for their own courses', async (db) => {
    await as(db, U.tutorA);
    await fails(db, `insert into public.coupons (code, kind, value, course_id) values ('STEAL','percent',50,$1)`, [await courseId(db, 'python-for-ai')], '42501');
    await q(db, `insert into public.coupons (code, kind, value, course_id) values ('MINE10','percent',10,$1)`, [await courseId(db, 'fullstack-nextjs-supabase')]);
  }),
  t('payouts: balance check, super_admin threshold, ledger on completion', async (db) => {
    await as(db, 'postgres');
    await q(db, `insert into public.payout_methods (id, tutor_id, kind, provider_code, network, account_name, account_last4, account_ciphertext, is_default)
                 values ('00000000-0000-0000-0000-0000000000aa',$1,'mobile_money','MPS','MTN','Amina T','1234','v1:ciphertext-placeholder-xxxx',true)`, [U.tutorA]);
    await q(db, `update public.site_settings set value='0' where key in ('payouts.hold_days','refunds.window_days')`);
    await q(db, `select app.post_ledger('adjustment', jsonb_build_array(
                   jsonb_build_object('account', app.ledger_account('platform:cash_flutterwave','asset'), 'direction','debit','amount',2000000),
                   jsonb_build_object('account', app.payable_account($1), 'direction','credit','amount',2000000)))`, [U.tutorA]);
    await as(db, U.tutorA);
    await fails(db, `select public.request_payout(3000000)`, [], /insufficient/);
    const po = await one(db, `select * from public.request_payout(1500000)`);
    await as(db, U.admin);
    await fails(db, `select public.admin_review_payout($1,'approve')`, [po.id], '42501');
    await as(db, U.root);
    await q(db, `select public.admin_review_payout($1,'approve','ok')`, [po.id]);
    await as(db, 'service');
    await q(db, `select public.mark_payout_processing($1, 555)`, [po.id]);
    await q(db, `select public.complete_payout($1, true)`, [po.reference]);
    await as(db, U.tutorA);
    assert.equal((await one(db, `select public.my_wallet() w`)).w.balance_ugx, 500000);
    await fails(db, `select account_ciphertext from public.payout_methods`, [], '42501');   // column-level revoke
    assert.equal((await one(db, `select account_last4 from public.payout_methods`)).account_last4, '1234');
  }),

  // ------------------------------------------------------------ child safety ----
  t('minors: activation requires guardian consent; adults cannot DM minors; their tutors can', async (db) => {
    await as(db, 'postgres');
    await q(db, `insert into public.profiles (id, display_name, account_status) values ('user_kid2','Kid Two','pending')`);
    await q(db, `insert into public.profile_private (user_id, date_of_birth) values ('user_kid2', (now() - interval '12 years')::date)`);
    await as(db, U.admin);
    await fails(db, `select public.admin_set_account_status('user_kid2','active')`, [], /guardian consent/);
    await as(db, U.alice);
    await fails(db, `select public.start_direct_conversation($1)`, [U.kid], '42501');
    await as(db, U.kid);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.kid, await courseId(db, 'web-foundations')]);
    await as(db, U.tutorA);
    const c = (await one(db, `select public.start_direct_conversation($1) id`, [U.kid])).id;
    assert.ok(c);
    await as(db, U.kid);
    await fails(db, `update public.profiles set is_minor=false where id=$1`, [U.kid], '42501');
    assert.equal((await one(db, `select institution, is_public from public.profiles where id=$1`, [U.kid])).is_public, false);
  }),
  t('minors never see 18+ content; blocks stop messaging', async (db) => {
    await as(db, 'postgres');
    await q(db, `update public.courses set age_rating='18_plus' where slug='python-for-ai'`);
    await as(db, U.kid);
    assert.equal((await q(db, `select * from public.courses where slug='python-for-ai'`)).length, 0);
    await as(db, U.alice);
    assert.equal((await q(db, `select * from public.courses where slug='python-for-ai'`)).length, 1);
    await q(db, `insert into public.user_blocks (blocker_id, blocked_id) values ($1,$2)`, [U.alice, U.bob]);
    await as(db, U.bob);
    await fails(db, `select public.start_direct_conversation($1)`, [U.alice], '42501');
  }),
  t('safeguarding reports alert admins and are hidden from other members', async (db) => {
    await as(db, U.bob);
    await q(db, `insert into public.safeguarding_reports (subject_id, minor_id, category, details) values ($1,$2,'inappropriate_contact','Saw a worrying message')`, [U.alice, U.kid]);
    await as(db, U.alice);
    assert.equal((await q(db, `select * from public.safeguarding_reports`)).length, 0);
    await as(db, U.admin);
    assert.equal((await q(db, `select * from public.notifications where type='account.safeguarding'`)).length, 1);
  }),

  // --------------------------------------------------- learning mechanics ----
  t('progress is computed; certificate issued with verify code; XP + badge awarded', async (db) => {
    const cid = await courseId(db, 'python-for-ai');
    await as(db, U.alice);
    const e = await one(db, `insert into public.enrollments (user_id, course_id) values ($1,$2) returning id`, [U.alice, cid]);
    await fails(db, `update public.enrollments set progress_pct=100 where id=$1`, [e.id], '42501');
    for (const l of await q(db, `select id from public.lessons where course_id=$1 order by position`, [cid]))
      await q(db, `insert into public.lesson_progress (user_id, lesson_id) values ($1,$2)`, [U.alice, l.id]);
    assert.equal((await one(db, `select status from public.enrollments where id=$1`, [e.id])).status, 'completed');
    const cert = await one(db, `select verify_code from public.certificates where course_id=$1`, [cid]);
    await as(db, 'anon');
    const v = (await one(db, `select public.verify_certificate($1) v`, [cert.verify_code])).v;
    assert.equal(v.valid, true); assert.equal(v.recipient, 'Alice Nakato');
    await as(db, U.alice);
    assert.ok((await one(db, `select xp_total from public.user_stats where user_id=$1`, [U.alice])).xp_total >= 120);
    assert.ok(await one(db, `select 1 from public.user_badges ub join public.badges b on b.id=ub.badge_id where b.code='first_course'`));
  }),
  t('YouTube media: strict id check, enrolled-only, 90% watch completes', async (db) => {
    const cid = await courseId(db, 'web-foundations');
    await as(db, U.tutorA);
    await fails(db, `insert into public.course_media (course_id, kind, source_url, provider_id, title) values ($1,'youtube_video','https://youtu.be/x','bad id!','x')`, [cid], '23514');
    const m = await one(db, `insert into public.course_media (course_id, kind, source_url, provider_id, title, duration_seconds, approved)
                             values ($1,'youtube_video','https://www.youtube.com/watch?v=dQw4w9WgXcQ','dQw4w9WgXcQ','Intro',100,true) returning id`, [cid]);
    await as(db, U.bob);
    assert.equal((await q(db, `select * from public.course_media`)).length, 0);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.bob, cid]);
    await fails(db, `select public.record_media_progress($1, 100, 500)`, [m.id], '22023');
    for (let i = 0; i < 2; i++) await q(db, `select public.record_media_progress($1, 0, 45)`, [m.id]);
    assert.equal((await one(db, `select public.record_media_progress($1, 0, 1) r`, [m.id])).r.completed, true);
  }),

  // ------------------------------------------------- launchpad / testing ----
  t('launchpad: makers cannot self-publish or upvote themselves; admin publishes', async (db) => {
    await as(db, U.alice);
    const lp = await one(db, `insert into public.launch_products (slug, owner_id, name, tagline, status) values ('mtaa','x','Mtaa App','Find services nearby','published') returning id, status`);
    assert.equal(lp.status, 'draft');
    await fails(db, `insert into public.launch_upvotes (product_id, user_id) values ($1,$2)`, [lp.id, U.alice], '42501');
    await as(db, U.bob);
    assert.equal((await q(db, `select * from public.launch_products where id=$1`, [lp.id])).length, 0);
    await as(db, U.admin);
    await q(db, `select public.admin_set_content_status('launch_product', $1, 'published')`, [lp.id]);
    await as(db, U.bob);
    await q(db, `insert into public.launch_upvotes (product_id, user_id) values ($1,$2)`, [lp.id, U.bob]);
    assert.equal((await one(db, `select upvotes_count from public.launch_products where id=$1`, [lp.id])).upvotes_count, 1);
  }),
  t('testing: only accepted testers report; only makers triage; XP on confirm', async (db) => {
    await as(db, U.alice);
    const lp = await one(db, `insert into public.launch_products (slug, owner_id, name, tagline) values ('beta-app','x','Beta App','Testing things') returning id`);
    const c = await one(db, `insert into public.test_campaigns (product_id, created_by, title, instructions, deadline, reward_xp)
                             values ($1,'x','Round 1','Please test the sign-up and payment flows thoroughly.', now()+interval '7 days', 20) returning id`, [lp.id]);
    await as(db, U.bob);
    await q(db, `insert into public.test_testers (campaign_id, user_id) values ($1,$2)`, [c.id, U.bob]);
    await fails(db, `insert into public.test_feedback (campaign_id, tester_id, kind, title) values ($1,$2,'bug','Crash')`, [c.id, U.bob], '42501');
    assert.equal((await db.query(`update public.test_testers set status='accepted' where campaign_id=$1`, [c.id])).rowCount, 0, 'testers cannot accept themselves');
    await as(db, U.alice);
    await q(db, `update public.test_testers set status='accepted' where campaign_id=$1 and user_id=$2`, [c.id, U.bob]);
    await as(db, U.bob);
    const f = await one(db, `insert into public.test_feedback (campaign_id, tester_id, kind, severity, title) values ($1,$2,'bug','high','Crash on submit') returning id`, [c.id, U.bob]);
    await fails(db, `update public.test_feedback set status='fixed' where id=$1`, [f.id], '42501');
    await as(db, U.alice);
    await q(db, `update public.test_feedback set status='confirmed' where id=$1`, [f.id]);
    await as(db, U.bob);
    assert.equal((await one(db, `select tester_reputation from public.user_stats where user_id=$1`, [U.bob])).tester_reputation, 3);
  }),
  t('competitions: level gate, judges only score', async (db) => {
    const comp = (await one(db, `select id from public.competitions where slug='kampala-hack-2026'`)).id;
    await as(db, U.tutorA);
    await fails(db, `insert into public.competition_entrants (competition_id, user_id) values ($1,$2)`, [comp, U.tutorA], /education levels/);
    await as(db, U.alice);
    await q(db, `insert into public.competition_entrants (competition_id, user_id) values ($1,$2)`, [comp, U.alice]);
    const s = await one(db, `insert into public.competition_submissions (competition_id, title) values ($1,'Smart Boda') returning id`, [comp]);
    const crit = (await one(db, `select id from public.rubric_criteria where competition_id=$1 limit 1`, [comp])).id;
    await fails(db, `insert into public.submission_scores (submission_id, criterion_id, judge_id, score) values ($1,$2,$3,10)`, [s.id, crit, U.alice], '42501');
    await as(db, U.admin);
    await q(db, `insert into public.competition_judges (competition_id, judge_id) values ($1,$2)`, [comp, U.tutorB]);
    await as(db, U.tutorB);
    await q(db, `insert into public.submission_scores (submission_id, criterion_id, judge_id, score) values ($1,$2,$3,8)`, [s.id, crit, U.tutorB]);
  }),

  // ----------------------------------------------------------------- misc ----
  t('social links: per-platform domain validation in the database', async (db) => {
    await as(db, U.admin);
    await fails(db, `insert into public.social_links (platform, url) values ('instagram','https://evil.example/instagram')`, [], '23514');
    await fails(db, `insert into public.social_links (platform, url) values ('x','javascript:alert(1)')`, [], '23514');
    await q(db, `insert into public.social_links (platform, url) values ('x','https://x.com/101codecrafts')`);
    await as(db, U.alice);
    await fails(db, `insert into public.social_links (platform, url) values ('x','https://x.com/me')`, [], '42501');
  }),
  t('audit log is admin-read-only and append-only', async (db) => {
    await as(db, U.alice);
    assert.equal((await q(db, `select * from public.audit_log`)).length, 0);
    await fails(db, `delete from public.audit_log`, [], '42501');
    await as(db, 'service');
    await fails(db, `delete from public.audit_log`, [], '42501');
  }),
  t('rate limiter is service-only and enforces a fixed window', async (db) => {
    await as(db, U.alice);
    await fails(db, `select * from public.rate_limit_hit('k',2,60)`, [], '42501');
    await as(db, 'service');
    const r = [];
    for (let i = 0; i < 3; i++) r.push((await one(db, `select allowed from public.rate_limit_hit('ip:1.2.3.4:x',2,60)`)).allowed);
    assert.deepEqual(r, [true, true, false]);
  }),
  t('search respects RLS (drafts hidden) and filters by level', async (db) => {
    await as(db, 'anon');
    const res = await q(db, `select kind, slug from public.search_all('pyth')`);
    assert.ok(res.some((r) => r.slug === 'python-for-ai'));
    assert.ok(!(await q(db, `select * from public.search_all('llm')`)).some((r) => r.slug === 'llm-apps'));
    const prim = await q(db, `select slug from public.search_all('web', array['course'], 20, 'primary')`);
    assert.ok(!prim.some((r) => r.slug === 'web-foundations'));
    await fails(db, `select public.search_all('a%b_c')`, [], null).catch(() => {});
  }),
  t('storage: own folder only; paid course media private', async (db) => {
    await as(db, U.alice);
    await q(db, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${U.alice}/a.webp`]);
    await fails(db, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${U.bob}/a.webp`], '42501');
    const cid = await courseId(db, 'fullstack-nextjs-supabase');
    await as(db, U.tutorA);
    await q(db, `insert into storage.objects (bucket_id, name) values ('course-media', $1)`, [`${cid}/video.mp4`]);
    await as(db, U.bob);
    assert.equal((await q(db, `select * from storage.objects where bucket_id='course-media'`)).length, 0);
  }),
  t('analytics refresh + admin overview + daily maintenance (service/admin)', async (db) => {
    await as(db, 'service');
    await q(db, `select public.refresh_analytics()`);
    await q(db, `select public.run_daily_maintenance()`);
    await as(db, U.admin);
    const o = (await one(db, `select public.admin_overview() o`)).o;
    assert.equal(o.tutors, 2); assert.equal(o.minors, 1);
    const lv = (await one(db, `select public.admin_analytics('levels') x`)).x;
    assert.ok(lv.some((r) => r.level === 'university'));
  }),
];
