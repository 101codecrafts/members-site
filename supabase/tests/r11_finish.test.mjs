// Round 11 finish (integrate): DB-level admin scopes on the plans-branch admin
// RPCs, and course_syllabus hiding unapproved lessons.
// Migration: 20261105040000_r11_admin_scopes_syllabus.sql
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t, courseId } = helpers;

/* bob becomes an admin holding ONLY the given scopes (same path as admin.test.mjs) */
async function scopedAdmin(db, user, email, scopes) {
  await as(db, U.root);
  const inv = (await one(db, `select public.admin_invite($1, $2::text[]) j`, [email, scopes])).j;
  await as(db, 'postgres');
  await q(db, `update public.profile_private set email=$2 where user_id=$1`, [user, email]);
  await as(db, 'service');
  await q(db, `select public.backend_accept_admin_invite($1, $2, $3)`, [user, email, inv.token]);
}
async function priceRequest(db) {
  const wf = await courseId(db, 'web-foundations');
  await as(db, U.tutorA);
  const rid = (await one(db, `select public.request_course_price($1, 20000, false, 'scope test') r`, [wf])).r;
  return { wf, rid };
}

export const tests = [
  t('r11 finish: admin_update_plan needs scope "plans" (audit-only admin refused; plans admin, root and legacy admin allowed)', async (db) => {
    await scopedAdmin(db, U.bob, 'bob@example.com', '{audit}');
    await as(db, U.bob);
    await fails(db, `select public.admin_update_plan('tutor','free', null, null, '{"students.max":5}'::jsonb)`, [], /scope "plans"/);
    await as(db, U.root);
    await q(db, `select public.admin_set_scopes($1, '{plans}')`, [U.bob]);
    await as(db, U.bob);
    const r = (await one(db, `select public.admin_update_plan('tutor','free', null, null, '{"students.max":5}'::jsonb) r`)).r;
    assert.equal(r.find((x) => x.tier === 'free').limits['students.max'], 5);
    await as(db, U.root);
    await q(db, `select public.admin_update_plan('tutor','free', null, null, '{"students.max":2}'::jsonb)`);
    await as(db, U.admin);   // legacy admin (no grant row) keeps every non-root scope
    await q(db, `select public.admin_update_plan('tutor','free', null, null, '{"students.max":2}'::jsonb)`);
    await as(db, U.alice);
    await fails(db, `select public.admin_update_plan('tutor','free', null, null, '{"students.max":9}'::jsonb)`, [], '42501');
  }),

  t('r11 finish: admin_set_course_pricing needs scope "plans"', async (db) => {
    const wf = await courseId(db, 'web-foundations');
    await scopedAdmin(db, U.bob, 'bob@example.com', '{approvals,audit}');
    await as(db, U.bob);
    await fails(db, `select public.admin_set_course_pricing($1, false, 30000)`, [wf], /scope "plans"/);
    await as(db, 'postgres');
    const before = await one(db, `select is_free, price_ugx from public.courses where id=$1`, [wf]);
    await as(db, U.root);
    await q(db, `select public.admin_set_scopes($1, '{plans}')`, [U.bob]);
    await as(db, U.bob);
    await q(db, `select public.admin_set_course_pricing($1, false, 30000)`, [wf]);
    await as(db, 'postgres');
    const after = await one(db, `select is_free, price_ugx from public.courses where id=$1`, [wf]);
    assert.deepEqual([after.is_free, Number(after.price_ugx)], [false, 30000]);
    assert.notDeepEqual([before.is_free, Number(before.price_ugx)], [false, 30000]);
  }),

  t('r11 finish: decide_course_price needs scope "approvals"; a suspended admin is refused', async (db) => {
    const { rid } = await priceRequest(db);
    await scopedAdmin(db, U.bob, 'bob@example.com', '{plans}');
    await as(db, U.bob);
    await fails(db, `select public.decide_course_price($1, true)`, [rid], /scope "approvals"/);
    await as(db, U.root);
    await q(db, `select public.admin_set_scopes($1, '{approvals}')`, [U.bob]);
    await as(db, U.bob);
    await q(db, `select public.decide_course_price($1, false, 'not yet')`, [rid]);
    await as(db, 'postgres');
    assert.equal((await one(db, `select status from public.course_price_requests where id=$1`, [rid])).status, 'rejected');
  }),

  t('r11 finish: course_syllabus hides unapproved lessons (not shown locked); approved ones keep their lock state', async (db) => {
    await as(db, 'postgres');
    const c = await one(db, `insert into public.courses (slug, title, level, status, is_free, price_ugx, tutor_id, published_at)
                             values ('r11-syl-hide','Syllabus hide','beginner','published',true,0,$1,now()) returning id`, [U.tutorB]);
    for (let i = 1; i <= 5; i++) {
      await q(db, `insert into public.lessons (course_id, position, title, content_md) values ($1,$2,$3,'body')`, [c.id, i, `S${i}`]);
    }
    await q(db, `update public.lessons set approved = (position <> 2) where course_id=$1`, [c.id]);   // S2 is a tutor edit in review
    assert.equal((await one(db, `select count(*)::int n from public.lessons where course_id=$1 and not approved`, [c.id])).n, 1);
    await as(db, U.alice);
    await q(db, `insert into public.enrollments (user_id, course_id) values ($1,$2)`, [U.alice, c.id]);
    const syl = await q(db, `select title, locked from public.course_syllabus($1)`, [c.id]);
    assert.ok(!syl.some((r) => r.title === 'S2'), 'unapproved lesson is not listed at all');
    assert.deepEqual(syl.map((r) => r.title), ['S1', 'S3', 'S4', 'S5']);
    assert.ok(syl.some((r) => r.locked), 'free-plan lock still applies to approved lessons');
    await as(db, 'anon');
    const anon = await q(db, `select title from public.course_syllabus($1)`, [c.id]).catch(() => null);
    if (anon) assert.ok(!anon.some((r) => r.title === 'S2'));
  }),
];
