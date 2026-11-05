// Round 11 plans: catalogue, lesson locks, course + tutor caps, guests, price approval, verified ratings,
// listing approval, payment providers, server-priced plan checkout through the ledger (sandbox only).
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;
const G = { guest: 'user_r11_guest', carol: 'user_r11_carol', dan: 'user_r11_dan' };

async function people(db) {
  await as(db, 'postgres');
  await q(db, `insert into public.profiles (id, username, display_name, account_status, joined_at) values
      ($1,'r11guest','Guest Gina','active',now()), ($2,'r11carol','Carol A','active',now()), ($3,'r11dan','Dan B','active',now())
      on conflict (id) do nothing`, [G.guest, G.carol, G.dan]);
  await q(db, `insert into public.profile_private (user_id, email) values ($1,'gina@example.com'),($2,'carol@example.com'),($3,'dan@example.com') on conflict do nothing`, [G.guest, G.carol, G.dan]);
  await q(db, `insert into public.user_roles (user_id, role) values ($1,'learner'),($2,'learner') on conflict do nothing`, [G.carol, G.dan]);
}
async function lockCourse(db) {
  await as(db, 'postgres');
  const c = await one(db, `insert into public.courses (slug, title, level, status, is_free, price_ugx, tutor_id, published_at)
                           values ('r11-locks','Locks 101','beginner','published',true,0,$1,now()) returning id`, [U.tutorB]);
  for (let i = 1; i <= 5; i++) {
    await q(db, `insert into public.lessons (course_id, position, title, content_md, is_preview) values ($1,$2,$3,'body',$4)`, [c.id, i, `L${i}`, i === 5]);
  }
  return c.id;
}
const courseId = async (db, slug) => { await as(db, 'postgres'); return (await one(db, `select id from public.courses where slug=$1`, [slug])).id; };
const setPlan = async (db, who, col, tier) => { await as(db, 'postgres'); await q(db, `update public.profiles set ${col}=$2 where id=$1`, [who, tier]); };
const ledgerZero = async (db) => {
  await as(db, 'postgres');
  const b = await one(db, `select coalesce(sum(case when direction='debit' then amount_ugx else -amount_ugx end),0) d from public.ledger_entries`);
  assert.equal(Number(b.d), 0, 'ledger balanced');
};

export const tests = [
  t('plans: catalogue has 4 learner + 4 tutor tiers with DB prices; anon cannot call it (SR-04)', async (db) => {
    await as(db, U.alice);
    const c = (await one(db, `select public.plans_catalogue() c`)).c;
    assert.deepEqual(c.learner.map((x) => x.tier), ['free', 'standard', 'plus', 'pro']);
    assert.deepEqual(c.tutor.map((x) => x.tier), ['free', 'standard', 'plus', 'pro']);
    assert.equal(c.tutor[0].limits.max_students, 2, 'founder anchor: Tutor Free = 2 students');
    assert.equal(c.learner[0].limits.courses_active, 1, 'founder anchor: Learner Free = 1 course');
    assert.equal(c.learner[1].monthly_ugx, 15000);
    assert.equal(c.learner[0].monthly_ugx, null, 'free has no price');
    await as(db, 'anon');
    await fails(db, `select public.plans_catalogue()`, [], '42501');
  }),

  t('plans: free plan locks lessons past the first 3 (previews stay open); Standard unlocks; per-lesson min_plan overrides', async (db) => {
    const cid = await lockCourse(db);
    await as(db, U.alice);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.alice, cid]);
    const syl = await q(db, `select title, locked, min_plan from public.course_syllabus($1)`, [cid]);
    assert.deepEqual(syl.map((r) => [r.title, r.locked]), [['L1', false], ['L2', false], ['L3', false], ['L4', true], ['L5', false]]);
    assert.deepEqual((await q(db, `select title from public.lessons where course_id=$1 order by position`, [cid])).map((r) => r.title), ['L1', 'L2', 'L3', 'L5']);
    await setPlan(db, U.alice, 'plan', 'standard');
    await as(db, U.alice);
    assert.equal((await q(db, `select 1 from public.lessons where course_id=$1`, [cid])).length, 5);
    await as(db, U.tutorB);
    await q(db, `update public.lessons set min_plan='plus' where course_id=$1 and position=2`, [cid]);
    await as(db, U.alice);
    assert.deepEqual((await q(db, `select title from public.lessons where course_id=$1 order by position`, [cid])).map((r) => r.title), ['L1', 'L3', 'L4', 'L5']);
    await as(db, U.bob);   // not enrolled: previews only
    assert.deepEqual((await q(db, `select title from public.lessons where course_id=$1`, [cid])).map((r) => r.title), ['L5']);
  }),

  t('plans: a paid course is fully unlocked for its buyer; all_lessons_free opens a free course; launch promo = Pro', async (db) => {
    const cid = await lockCourse(db);
    await as(db, U.admin);
    await q(db, `select public.admin_set_course_pricing($1, true, 0, true)`, [cid]);
    await as(db, U.alice);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.alice, cid]);
    assert.equal((await q(db, `select 1 from public.lessons where course_id=$1`, [cid])).length, 5, 'all_lessons_free');
    await as(db, U.admin);
    await q(db, `select public.admin_set_course_pricing($1, true, 0, false)`, [cid]);
    await q(db, `select public.admin_set_launch_promo(true, now() - interval '1 day', now() + interval '1 day')`);
    await as(db, U.alice);
    assert.equal((await q(db, `select 1 from public.lessons where course_id=$1`, [cid])).length, 5, 'promo: everyone Pro');
  }),

  t('plans: Learner Free = 1 active free course (can_enroll explains); dropping frees the slot; Standard allows 3', async (db) => {
    await as(db, U.alice);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.alice, await courseId(db, 'web-foundations')]);
    await as(db, U.alice);
    const py = await courseId(db, 'python-for-ai');
    await as(db, U.alice);
    const v = (await one(db, `select public.can_enroll($1) v`, [py])).v;
    assert.equal(v.ok, false); assert.equal(v.reason, 'plan_limit'); assert.equal(v.limit, 1);
    await fails(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.alice, py], 'P0001');
    await q(db, `update public.enrollments set status='dropped' where user_id=$1`, [U.alice]);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.alice, py]);
    await setPlan(db, U.alice, 'plan', 'standard');
    await as(db, U.alice);
    await q(db, `update public.enrollments set status='active' where user_id=$1 and status='dropped'`, [U.alice]);
    assert.equal((await one(db, `select count(*)::int n from public.enrollments where user_id=$1 and status='active'`, [U.alice])).n, 2);
  }),

  t('plans: Tutor Free = max 2 students; the 3rd learner is refused (tutor_full); an upgrade lifts it', async (db) => {
    await people(db);
    const cid = await lockCourse(db);   // tutorB, Free plan
    for (const who of [U.alice, U.bob]) { await as(db, who); await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [who, cid]); }
    await as(db, G.carol);
    assert.equal((await one(db, `select public.can_enroll($1) v`, [cid])).v.reason, 'tutor_full');
    await fails(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [G.carol, cid], 'P0001');
    await setPlan(db, U.tutorB, 'tutor_plan', 'standard');
    await as(db, G.carol);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [G.carol, cid]);
  }),

  t('plans: guests take free courses and buy on the marketplace only (no paid course, no plan, no selling)', async (db) => {
    await people(db);
    await as(db, G.guest);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [G.guest, await courseId(db, 'scratch-for-kids')]);
    await as(db, G.guest);
    await fails(db, `select public.create_checkout('course', $1)`, [await courseId(db, 'fullstack-nextjs-supabase')], '42501');
    await as(db, G.guest);
    await fails(db, `select public.create_plan_checkout('learner','standard','monthly','mtn_momo')`, [], '42501');
    await as(db, G.guest);
    const st = await one(db, `insert into public.mkt_stores (slug, name) values ('gina-shop','Gina') returning id`).catch(() => null);
    if (st) await fails(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx) values ($1,'gina-one','Gina kit','digital',1000)`, [st.id], /guests can buy but not sell/);
  }),

  t('plans: tutor price requests need admin approval; tutors cannot set prices directly; plan caps the requested price', async (db) => {
    const wf = await courseId(db, 'web-foundations');
    await as(db, U.tutorA);
    await fails(db, `update public.courses set is_free=false, price_ugx=20000 where id=$1`, [wf], '42501');
    await fails(db, `select public.request_course_price($1, 60000)`, [wf], 'P0001');           // Free tutor cap 50,000
    const rid = (await one(db, `select public.request_course_price($1, 20000, false, 'intro price') r`, [wf])).r;
    await as(db, U.alice);
    await fails(db, `select public.decide_course_price($1, true)`, [rid], '42501');
    await as(db, U.tutorB);
    await fails(db, `select public.request_course_price($1, 20000)`, [wf], '42501');           // not the owner
    await as(db, U.admin);
    await q(db, `select public.decide_course_price($1, true, 'ok')`, [rid]);
    const c = await one(db, `select is_free, price_ugx from public.courses where id=$1`, [wf]);
    assert.deepEqual([c.is_free, Number(c.price_ugx)], [false, 20000]);
    await fails(db, `select public.decide_course_price($1, true)`, [rid], 'P0001');             // already decided
    await as(db, U.tutorA);
    assert.equal((await q(db, `select status from public.course_price_requests where id=$1`, [rid]))[0].status, 'approved');
  }),

  t('ratings: only enrolled learners rate a course; only delivered buyers rate a product; item ratings need recorded use', async (db) => {
    const py = await courseId(db, 'python-for-ai');
    await as(db, U.bob);
    await fails(db, `insert into public.tutor_reviews (tutor_id, learner_id, course_id, rating) values ($1,$2,$3,5)`, [U.tutorB, U.bob, py], '42501');
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.bob, py]);
    await q(db, `insert into public.tutor_reviews (tutor_id, learner_id, course_id, rating) values ($1,$2,$3,4)`, [U.tutorB, U.bob, py]);
    await q(db, `update public.tutor_reviews set rating=2 where learner_id=$1`, [U.bob]);            // editing your own verified rating is fine
    await as(db, U.alice);
    await fails(db, `insert into public.tutor_reviews (tutor_id, learner_id, rating) values ($1,$2,5)`, [U.tutorB, U.alice], '42501');
    // items: no recorded use -> refused; fresh use -> still refused (10 min); older use -> allowed
    await fails(db, `insert into public.item_ratings (user_id, item_kind, item_id, rating) values ($1,'book','eloquent-js',5)`, [U.alice], '42501');
    await q(db, `select public.record_item_use('book','eloquent-js')`);
    await fails(db, `insert into public.item_ratings (user_id, item_kind, item_id, rating) values ($1,'book','eloquent-js',5)`, [U.alice], '42501');
    await as(db, 'postgres');
    await q(db, `update public.item_usage set first_used_at = now() - interval '1 hour' where user_id=$1`, [U.alice]);
    await as(db, U.alice);
    const r = await one(db, `insert into public.item_ratings (user_id, item_kind, item_id, rating) values ($1,'book','eloquent-js',2) returning id`, [U.alice]);
    await as(db, U.admin);
    await fails(db, `update public.item_ratings set rating=5 where id=$1`, [r.id], '42501');         // admins never rewrite
    await q(db, `update public.item_ratings set hidden_at=now(), hidden_by=$2 where id=$1`, [r.id, U.admin]);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.item_ratings where id=$1`, [r.id])).length, 0, 'hidden from others');
  }),

  t('payments: providers are data; only root switches them; stubs/slots can never be enabled', async (db) => {
    await as(db, 'anon');
    const ps = await q(db, `select code, enabled, status from public.payment_providers order by sort`);
    assert.deepEqual(ps.map((p) => p.code), ['flutterwave', 'pesapal', 'dpo', 'mtn_momo', 'airtel_money', 'payway']);
    assert.deepEqual(ps.filter((p) => p.enabled).map((p) => p.code), ['flutterwave']);
    await as(db, U.admin);
    await fails(db, `select public.admin_set_payment_provider('flutterwave', false)`, [], '42501');
    await as(db, U.root);
    await fails(db, `select public.admin_set_payment_provider('payway', true)`, [], '23514');
    await q(db, `select public.admin_set_payment_provider('flutterwave', false)`);
    await as(db, U.alice);
    await fails(db, `select public.create_plan_checkout('learner','standard','monthly','mtn_momo')`, [], 'P0001');
  }),

  t('payments: plan checkout is server-priced (SR-17), sandbox-only, webhook-fulfilled (SR-16); upgrade supersedes; ledger balanced', async (db) => {
    await as(db, U.alice);
    const co = (await one(db, `select public.create_plan_checkout('learner','standard','monthly','mtn_momo') c`)).c;
    assert.equal(co.amount_ugx, 15000); assert.equal(co.provider, 'flutterwave'); assert.equal(co.mode, 'sandbox'); assert.equal(co.method, 'mtn_momo');
    assert.equal((await one(db, `select plan from public.profiles where id=$1`, [U.alice])).plan, 'free', 'nothing granted before the webhook');
    await fails(db, `select public.apply_flutterwave_payment($1, 9001, 'successful', 15000, 'UGX')`, [co.tx_ref], '42501');
    await fails(db, `select public.apply_provider_payment('flutterwave', $1, '9001', 'successful', 15000, 'UGX')`, [co.tx_ref], '42501');
    await as(db, 'service');
    await fails(db, `select public.apply_provider_payment('pesapal', $1, 'x', 'successful', 15000, 'UGX')`, [co.tx_ref], '42501'); // provider mismatch
    await q(db, `select public.apply_flutterwave_payment($1, 9001, 'successful', 15000, 'UGX', 'mobilemoneyuganda')`, [co.tx_ref]);
    await as(db, U.alice);
    assert.equal((await one(db, `select plan from public.profiles where id=$1`, [U.alice])).plan, 'standard');
    assert.equal((await one(db, `select public.my_entitlements() e`)).e.learner_plan, 'standard');
    await fails(db, `select public.create_plan_checkout('learner','standard','monthly','card')`, [], '23505');   // already on it
    await fails(db, `select public.create_plan_checkout('learner','free','monthly','card')`, [], '22023');
    await fails(db, `select public.create_plan_checkout('tutor','plus','monthly','card')`, [], '42501');         // not a tutor
    await fails(db, `select public.create_plan_checkout('learner','plus','monthly','bitcoin')`, [], '22023');
    // underpayment never grants
    const up = (await one(db, `select public.create_plan_checkout('learner','plus','yearly','card') c`)).c;
    assert.equal(up.amount_ugx, 350000);
    await as(db, 'service');
    const bad = await one(db, `select (public.apply_flutterwave_payment($1, 9002, 'successful', 1000, 'UGX')).status s`, [up.tx_ref]);
    assert.equal(bad.s, 'failed');
    await as(db, U.alice);
    const up2 = (await one(db, `select public.create_plan_checkout('learner','plus','yearly','card') c`)).c;
    await as(db, 'service');
    await q(db, `select public.apply_flutterwave_payment($1, 9003, 'successful', 350000, 'UGX', 'card')`, [up2.tx_ref]);
    await as(db, 'postgres');
    const subs = await q(db, `select s.status, sp.tier from public.subscriptions s join public.subscription_plans sp on sp.id=s.plan_id where s.user_id=$1 and s.status in ('active','cancelled') order by s.created_at`, [U.alice]);
    assert.deepEqual(subs.map((s) => [s.tier, s.status]), [['standard', 'cancelled'], ['plus', 'active']]);
    assert.equal((await one(db, `select plan from public.profiles where id=$1`, [U.alice])).plan, 'plus');
    assert.equal((await one(db, `select app.ad_tier($1) a`, [U.alice])).a, 'none', 'paid tiers are ad-free');
    await ledgerZero(db);
  }),

  t('payments: tutors buy tutor plans separately; a learner plan and a tutor plan can both be live', async (db) => {
    await as(db, U.tutorA);
    const a = (await one(db, `select public.create_plan_checkout('tutor','standard','monthly','airtel_money') c`)).c;
    assert.equal(a.amount_ugx, 25000);
    const b = (await one(db, `select public.create_plan_checkout('learner','standard','monthly','card') c`)).c;
    await as(db, 'service');
    await q(db, `select public.apply_flutterwave_payment($1, 9101, 'successful', 25000, 'UGX')`, [a.tx_ref]);
    await q(db, `select public.apply_flutterwave_payment($1, 9102, 'successful', 15000, 'UGX')`, [b.tx_ref]);
    await as(db, 'postgres');
    const p = await one(db, `select plan, tutor_plan from public.profiles where id=$1`, [U.tutorA]);
    assert.deepEqual([p.plan, p.tutor_plan], ['standard', 'standard']);
    await ledgerZero(db);
  }),

  t('admin: plans and prices are editable data (admins only); edits are audited', async (db) => {
    await as(db, U.tutorA);
    await fails(db, `select public.admin_update_plan('tutor','free', null, null, '{"max_students":5}'::jsonb)`, [], '42501');
    await as(db, U.admin);
    const r = (await one(db, `select public.admin_update_plan('tutor','free', null, null, '{"max_students":5}'::jsonb) r`)).r;
    assert.equal(r[0].limits.max_students, 5);
    await q(db, `select public.admin_update_plan('learner','standard', null, null, null, null, 20000, 200000, true)`);
    const c = (await one(db, `select public.plans_catalogue() c`)).c;
    assert.equal(c.learner[1].monthly_ugx, 20000); assert.equal(c.learner[1].price_is_suggestion, false);
    await as(db, 'postgres');
    assert.ok((await q(db, `select 1 from public.audit_log where action in ('plan.update')`)).length >= 2);
  }),

  t('marketplace: guests cannot list; sellers submit for review; listing count follows the plan', async (db) => {
    await as(db, U.admin);
    await q(db, `select public.admin_update_plan('learner','free', null, null, '{"listings_active":1}'::jsonb)`);
    await as(db, U.bob);
    const st = await one(db, `insert into public.mkt_stores (slug, name) values ('bob-kit','Bob Kit') returning id`);
    await fails(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx, status) values ($1,'bob-zero','Bob kit zero','digital',2000,'published')`, [st.id], /admin after review/);
    await q(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx, status) values ($1,'bob-one','Bob kit one','digital',2000,'pending_review')`, [st.id]);
    await fails(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx) values ($1,'bob-two','Bob kit two','digital',2000)`, [st.id], 'P0001');
  }),
];
