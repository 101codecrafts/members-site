// Round 11 course builder: modules, typed lessons, quiz keys, submission queue, price approval, dashboards.
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;

async function draftCourse(db, who = U.tutorA, slug = 'r11-builder-course') {
  await as(db, who);
  const c = await one(db, `insert into public.courses (slug, title, summary) values ($1, 'Builder course', 'A course built in the r11 builder') returning id, status, is_free, price_ugx`, [slug]);
  const m = await one(db, `insert into public.course_modules (course_id, position, title) values ($1, 0, 'Module one') returning id, approved`, [c.id]);
  return { c, m };
}

export const tests = [
  t('builder: fresh tutor course is a free draft; tutor cannot set a live price or self-review', async (db) => {
    await as(db, U.tutorA);
    const c = await one(db, `insert into public.courses (slug, title, is_free, price_ugx, status) values ('r11-price', 'Price test', false, 50000, 'published') returning *`);
    assert.equal(c.status, 'draft'); assert.equal(c.is_free, true); assert.equal(Number(c.price_ugx), 0);
    await fails(db, `update public.courses set is_free = false, price_ugx = 20000 where id = $1`, [c.id], '42501');
    await fails(db, `update public.courses set status = 'pending_review' where id = $1`, [c.id], '42501');
    await fails(db, `update public.courses set status = 'published' where id = $1`, [c.id], '42501');
    await q(db, `update public.courses set requested_price_ugx = 20000 where id = $1`, [c.id]);
    await fails(db, `update public.courses set requested_price_ugx = 500 where id = $1`, [c.id], '23514');
  }),

  t('builder: modules + typed lessons; payload shape enforced; quiz answers never in the lesson', async (db) => {
    const { c, m } = await draftCourse(db);
    assert.equal(m.approved, false, 'tutor content starts unapproved');
    await q(db, `insert into public.lessons (course_id, module_id, position, title, kind, payload) values ($1,$2,0,'Intro video','video','{"youtube_id":"dQw4w9WgXcQ"}')`, [c.id, m.id]);
    await fails(db, `insert into public.lessons (course_id, module_id, position, title, kind, payload) values ($1,$2,1,'Bad video','video','{"youtube_id":"x"}')`, [c.id, m.id], '23514');
    await q(db, `insert into public.lessons (course_id, module_id, position, title, kind, payload) values ($1,$2,1,'Book','book','{"isbn":"9781593279509"}')`, [c.id, m.id]);
    await fails(db, `insert into public.lessons (course_id, module_id, position, title, kind, payload) values ($1,$2,2,'Bad file','file','{"url":"http://evil.example/x.pdf"}')`, [c.id, m.id], '23514');
    await fails(db, `insert into public.lessons (course_id, module_id, position, title, kind, payload) values ($1,$2,2,'Leaky quiz','quiz','{"questions":[{"q":"2+2?","options":["3","4"],"answer":1}]}')`, [c.id, m.id], '23514');
    const qz = await one(db, `insert into public.lessons (course_id, module_id, position, title, kind, payload) values ($1,$2,2,'Quiz','quiz','{"questions":[{"q":"2+2?","options":["3","4"]}]}') returning id`, [c.id, m.id]);
    await q(db, `insert into public.lesson_quiz_keys (lesson_id, answers) values ($1, '[1]')`, [qz.id]);
    // another tutor can't touch it
    await as(db, U.tutorB);
    await fails(db, `insert into public.course_modules (course_id, position, title) values ($1, 1, 'Hijack')`, [c.id], '42501');
    assert.equal((await q(db, `select 1 from public.lesson_quiz_keys where lesson_id = $1`, [qz.id])).length, 0);
    // a learner never reads keys or draft lessons
    await as(db, U.alice);
    assert.equal((await q(db, `select 1 from public.lessons where course_id = $1`, [c.id])).length, 0);
    assert.equal((await q(db, `select 1 from public.lesson_quiz_keys`)).length, 0);
    await fails(db, `select public.grade_lesson_quiz($1, '[1]')`, [qz.id], '42501');
    // owner preview grades server-side
    await as(db, U.tutorA);
    const g = (await one(db, `select public.grade_lesson_quiz($1, '[1]') g`, [qz.id])).g;
    assert.deepEqual([g.score, g.total], [1, 1]);
  }),

  t('builder: submit runs the checklist, locks edits, admin approves (price applied, lessons visible)', async (db) => {
    const { c, m } = await draftCourse(db);
    await fails(db, `select public.submit_course_for_review($1)`, [c.id], /checklist incomplete/);
    await q(db, `insert into public.lessons (course_id, module_id, position, title, kind, content_md) values ($1,$2,0,'Read me','text','# Hello')`, [c.id, m.id]);
    await q(db, `update public.courses set requested_price_ugx = 15000 where id = $1`, [c.id]);
    const r = (await one(db, `select public.submit_course_for_review($1, 'please review') r`, [c.id])).r;
    assert.equal(r.kind, 'new');
    assert.equal((await one(db, `select status from public.courses where id = $1`, [c.id])).status, 'pending_review');
    await fails(db, `select public.submit_course_for_review($1)`, [c.id], /already in review/);
    await fails(db, `insert into public.lessons (course_id, module_id, position, title, kind, content_md) values ($1,$2,1,'Sneaky','text','x')`, [c.id, m.id], '42501');
    await fails(db, `update public.courses set title = 'Changed in review' where id = $1`, [c.id], '42501');
    // learners/other tutors cannot see or act on the queue
    await as(db, U.tutorB);
    assert.equal((await q(db, `select 1 from public.course_submissions where course_id = $1`, [c.id])).length, 0);
    await fails(db, `select public.admin_review_course_submission($1, 'approved')`, [r.submission_id], '42501');
    await fails(db, `insert into public.course_submissions (course_id, submitted_by) values ($1, $2)`, [c.id, U.tutorB], '42501');
    await as(db, U.alice);
    assert.equal((await q(db, `select 1 from public.course_submissions`)).length, 0);
    // the tutor sees their own submission
    await as(db, U.tutorA);
    assert.equal((await q(db, `select status from public.course_submissions where id = $1`, [r.submission_id]))[0].status, 'pending');
    // admin approves at a different price
    await as(db, U.admin);
    const a = (await one(db, `select public.admin_review_course_submission($1, 'approved', null, 10000) a`, [r.submission_id])).a;
    assert.equal(Number(a.price_ugx), 10000);
    const live = await one(db, `select status, is_free, price_ugx, requested_price_ugx from public.courses where id = $1`, [c.id]);
    assert.deepEqual([live.status, live.is_free, Number(live.price_ugx), live.requested_price_ugx], ['published', false, 10000, null]);
    // enrolled learner sees the approved lesson
    await as(db, 'postgres');
    await q(db, `insert into public.enrollments (user_id, course_id, status) values ($1, $2, 'active')`, [U.alice, c.id]);
    await as(db, U.alice);
    assert.equal((await q(db, `select 1 from public.lessons where course_id = $1`, [c.id])).length, 1);
    assert.equal((await q(db, `select 1 from public.course_modules where course_id = $1`, [c.id])).length, 1);
    assert.ok((await q(db, `select 1 from public.audit_log where action = 'course.review'`)).length === 0, 'audit is admin-read-only');
  }),

  t('builder: update to a live course stays hidden until approved; reject needs a reason and shows it', async (db) => {
    const { c, m } = await draftCourse(db, U.tutorA, 'r11-live-update');
    await q(db, `insert into public.lessons (course_id, module_id, position, title, kind, content_md) values ($1,$2,0,'One','text','x')`, [c.id, m.id]);
    const s1 = (await one(db, `select public.submit_course_for_review($1) r`, [c.id])).r;
    await as(db, U.admin);
    await q(db, `select public.admin_review_course_submission($1, 'approved')`, [s1.submission_id]);
    await as(db, 'postgres');
    await q(db, `insert into public.enrollments (user_id, course_id, status) values ($1, $2, 'active')`, [U.bob, c.id]);
    // tutor adds a lesson to the live course
    await as(db, U.tutorA);
    await q(db, `insert into public.lessons (course_id, module_id, position, title, kind, content_md) values ($1,$2,1,'Two (new)','text','y')`, [c.id, m.id]);
    await as(db, U.bob);
    assert.deepEqual((await q(db, `select title from public.lessons where course_id = $1 order by position`, [c.id])).map((r) => r.title), ['One']);
    await as(db, U.tutorA);
    const s2 = (await one(db, `select public.submit_course_for_review($1) r`, [c.id])).r;
    assert.equal(s2.kind, 'update');
    assert.equal((await one(db, `select status from public.courses where id = $1`, [c.id])).status, 'published', 'stays live during update review');
    await as(db, U.admin);
    await fails(db, `select public.admin_review_course_submission($1, 'rejected', 'no')`, [s2.submission_id], /reason/);
    await q(db, `select public.admin_review_course_submission($1, 'rejected', 'Lesson two needs a real explanation')`, [s2.submission_id]);
    await as(db, U.tutorA);
    const sub = await one(db, `select status, reason from public.course_submissions where id = $1`, [s2.submission_id]);
    assert.deepEqual([sub.status, sub.reason], ['rejected', 'Lesson two needs a real explanation']);
    assert.ok((await q(db, `select 1 from public.notifications where type = 'tutor.course_rejected'`)).length === 1);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.lessons where course_id = $1`, [c.id])).length, 1, 'rejected update stays hidden');
  }),

  t('builder: withdraw returns to draft; reorder keeps one position sequence; link report flags unsafe links', async (db) => {
    const { c, m } = await draftCourse(db, U.tutorA, 'r11-reorder');
    const m2 = await one(db, `insert into public.course_modules (course_id, position, title) values ($1, 1, 'Module two') returning id`, [c.id]);
    const a = await one(db, `insert into public.lessons (course_id, module_id, position, title, kind, content_md) values ($1,$2,0,'Aa','text','a') returning id`, [c.id, m.id]);
    const b = await one(db, `insert into public.lessons (course_id, module_id, position, title, kind, content_md) values ($1,$2,1,'Bb','text','b') returning id`, [c.id, m2.id]);
    await q(db, `select public.reorder_course($1, $2::uuid[], $3::jsonb)`, [c.id, [m2.id, m.id], JSON.stringify({ [m2.id]: [b.id, a.id] })]);
    const rows = await q(db, `select l.title, cm.title as module, l.position from public.lessons l join public.course_modules cm on cm.id = l.module_id where l.course_id = $1 order by l.position`, [c.id]);
    assert.deepEqual(rows.map((r) => [r.title, r.module, r.position]), [['Bb', 'Module two', 0], ['Aa', 'Module two', 1]]);
    assert.equal((await one(db, `select position from public.course_modules where id = $1`, [m2.id])).position, 0);
    // empty module now fails the checklist ("every module has a lesson")
    await fails(db, `select public.submit_course_for_review($1)`, [c.id], /modules_have_lessons/);
    await q(db, `delete from public.course_modules where id = $1`, [m.id]);
    await q(db, `insert into public.lessons (course_id, module_id, position, title, kind, payload) values ($1,$2,5,'Shortened','file','{"url":"https://bit.ly/abc"}')`, [c.id, m2.id]);
    await fails(db, `select public.submit_course_for_review($1)`, [c.id], /links_safe/);
    await q(db, `update public.lessons set payload = '{"url":"https://openstax.org/details/books/introduction-python-programming"}' where title = 'Shortened' and course_id = $1`, [c.id]);
    await q(db, `select public.submit_course_for_review($1)`, [c.id]);
    const w = (await one(db, `select public.withdraw_course_submission($1) w`, [c.id])).w;
    assert.equal(w.status, 'draft');
    assert.equal((await one(db, `select status from public.course_submissions where course_id = $1`, [c.id])).status, 'withdrawn');
    assert.equal((await one(db, `select app.link_verdict('https://192.168.1.10/x') v`)).v, 'ip_address');
    assert.equal((await one(db, `select app.link_verdict('https://user:pw@example.com/') v`)).v, 'has_credentials');
  }),

  t('dashboards: fresh learner and fresh tutor get zeros and empty arrays (no demo rows)', async (db) => {
    await as(db, 'postgres');
    await q(db, `insert into public.profiles (id, username, display_name, account_status, joined_at) values ('user_fresh_l','freshl','Fresh Learner','active',now()), ('user_fresh_t','fresht','Fresh Tutor','active',now())`);
    await q(db, `insert into public.user_roles (user_id, role) values ('user_fresh_l','learner'), ('user_fresh_t','tutor')`);
    await q(db, `insert into public.tutor_profiles (user_id, bio, expertise, verification_status, verified_at) values ('user_fresh_t','New','{web}','verified',now())`);
    await as(db, 'user_fresh_l');
    const l = (await one(db, `select public.learner_dashboard() d`)).d;
    assert.deepEqual(l.counts, { enrolled: 0, completed: 0, certificates: 0, saved: 0 });
    assert.deepEqual([l.enrollments, l.certificates, l.saved, l.sessions], [[], [], [], []]);
    assert.equal(l.plan, 'free');
    await fails(db, `select public.tutor_dashboard()`, [], '42501');
    await as(db, 'user_fresh_t');
    const d = (await one(db, `select public.tutor_dashboard() d`)).d;
    assert.deepEqual(d.kpis, { active_learners: 0, courses: 0, earnings_month_ugx: 0, rating_avg: 0, rating_count: 0 });
    assert.deepEqual([d.courses, d.learners, d.payouts, d.upcoming_sessions], [[], [], [], []]);
    await as(db, 'anon');
    await fails(db, `select public.learner_dashboard()`, [], '42501');
  }),

  t('admin: set any course free or paid; tutors cannot', async (db) => {
    await as(db, U.tutorA);
    const c = await one(db, `insert into public.courses (slug, title) values ('r11-admin-price', 'Admin price') returning id`);
    await fails(db, `select public.admin_set_course_price($1, 5000)`, [c.id], '42501');
    await as(db, U.admin);
    await fails(db, `select public.admin_set_course_price($1, 500)`, [c.id], '22023');
    await q(db, `select public.admin_set_course_price($1, 5000)`, [c.id]);
    let r = await one(db, `select is_free, price_ugx from public.courses where id = $1`, [c.id]);
    assert.deepEqual([r.is_free, Number(r.price_ugx)], [false, 5000]);
    await q(db, `select public.admin_set_course_price($1, 0)`, [c.id]);
    r = await one(db, `select is_free, price_ugx from public.courses where id = $1`, [c.id]);
    assert.deepEqual([r.is_free, Number(r.price_ugx)], [true, 0]);
  }),
];
