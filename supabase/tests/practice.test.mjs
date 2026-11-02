// Practice & articles: hidden tests, judge path, contest lock, quiz keys, article review.
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;

async function seedProblem(db, { slug = 'two-sum', difficulty = 'easy' } = {}) {
  await as(db, 'postgres');
  const p = await one(db, `insert into public.problems (slug, title, statement_md, difficulty, status, author_id, languages)
     values ($1, 'Two Sum', 'Find two numbers', $2, 'published', $3, '{python,cpp}') returning id`, [slug, difficulty, U.admin]);
  await q(db, `insert into public.test_cases (problem_id, ord, input, expected_output, is_sample) values
     ($1, 1, '1 2', '3', true), ($1, 2, 'SECRET_IN', 'SECRET_OUT', false)`, [p.id]);
  await q(db, `insert into public.problem_editorials (problem_id, editorial_md) values ($1, 'Use a hash map')`, [p.id]);
  await q(db, `insert into public.problem_hints (problem_id, ord, body_md) values ($1, 1, 'Think hashing')`, [p.id]);
  return p.id;
}

export const tests = [
  t('practice: hidden test cases are never readable by learners or anon; samples are', async (db) => {
    const pid = await seedProblem(db);
    for (const who of [U.alice, 'anon']) {
      await as(db, who);
      const rows = await q(db, `select input, is_sample from public.test_cases where problem_id=$1`, [pid]);
      assert.deepEqual(rows.map((r) => r.is_sample), [true], `${who} sees samples only`);
      assert.ok(!rows.some((r) => r.input === 'SECRET_IN'));
    }
    await as(db, U.alice);
    await fails(db, `insert into public.test_cases (problem_id, input, expected_output) values ($1,'x','y')`, [pid]);
    await fails(db, `select public.judge_payload(gen_random_uuid())`, [], '42501');
  }),

  t('practice: submit → judge (service) → AC updates score, solved, POTD streak, XP; learners cannot set verdicts', async (db) => {
    const pid = await seedProblem(db);
    await as(db, 'postgres');
    await q(db, `insert into public.problem_of_the_day (day, problem_id) values ((now() at time zone 'Africa/Kampala')::date, $1)`, [pid]);
    await as(db, U.alice);
    await fails(db, `select public.submit_solution($1, 'rust', 'fn main(){}')`, [pid], /language not allowed/);
    const s = await one(db, `select * from public.submit_solution($1, 'python', 'print(3)')`, [pid]);
    assert.equal(s.verdict, 'pending');
    await fails(db, `update public.submissions set verdict='AC' where id=$1`, [s.id]);
    await fails(db, `select public.judge_record_result($1, 'AC', 2, 2)`, [s.id], '42501');
    await as(db, 'service');
    const payload = (await one(db, `select public.judge_payload($1) p`, [s.id])).p;
    assert.equal(payload.tests.length, 2, 'judge gets hidden tests');
    await q(db, `select public.judge_record_result($1, 'AC', 2, 2, null, 40, 9000)`, [s.id]);
    await as(db, U.alice);
    const st = await one(db, `select coding_score, solved_easy, potd_streak from public.practice_stats where user_id=$1`, [U.alice]);
    assert.equal(st.coding_score, 2); assert.equal(st.solved_easy, 1); assert.equal(st.potd_streak, 1);
    const prog = (await one(db, `select public.my_practice_progress() p`)).p;
    assert.equal(prog.by_difficulty.easy, 1);
    // bob cannot see alice's code
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.submissions where id=$1`, [s.id])).length, 0);
  }),

  t('practice: contest locks problem, editorial, hints and AI solution reveal until it ends; ICPC leaderboard', async (db) => {
    const pid = await seedProblem(db, { slug: 'contest-p' });
    await as(db, 'postgres');
    const c = await one(db, `insert into public.contests (slug, title, starts_at, ends_at, scoring, status)
       values ('weekly-1','Weekly 1', now() - interval '10 minutes', now() + interval '1 hour', 'icpc', 'published') returning id`);
    await q(db, `insert into public.contest_problems (contest_id, problem_id, label) values ($1,$2,'A')`, [c.id, pid]);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.problems where id=$1`, [pid])).length, 0, 'unregistered cannot see live contest problem');
    await q(db, `select public.register_contest($1)`, [c.id]);
    assert.equal((await q(db, `select 1 from public.problems where id=$1`, [pid])).length, 1, 'registrant sees it');
    assert.equal((await q(db, `select 1 from public.problem_editorials where problem_id=$1`, [pid])).length, 0, 'editorial hidden');
    assert.equal((await q(db, `select 1 from public.problem_hints where problem_id=$1`, [pid])).length, 0, 'hints hidden');
    const pol = (await one(db, `select public.practice_ai_policy($1) p`, [pid])).p;
    assert.equal(pol.contest_locked, true); assert.equal(pol.may_reveal_solution, false);
    const s = await one(db, `select id from public.submit_solution($1,'python','print(3)',$2)`, [pid, c.id]);
    await as(db, 'service');
    await q(db, `select public.judge_record_result($1,'AC',2,2)`, [s.id]);
    await as(db, 'anon');
    const lb = await q(db, `select * from public.contest_leaderboard($1)`, [c.id]);
    assert.equal(lb.length, 1); assert.equal(lb[0].solved, 1); assert.equal(Number(lb[0].rank), 1);
    await as(db, U.alice);
    await fails(db, `select public.submit_solution($1,'python','x',$2)`, [pid, c.id], /not registered|not found/);
  }),

  t('practice: plagiarism flags near-identical AC code (admin/service only)', async (db) => {
    const pid = await seedProblem(db, { slug: 'plag-p' });
    await as(db, 'postgres');
    const c = await one(db, `insert into public.contests (slug, title, starts_at, ends_at, status) values ('plag-c','Plag contest', now()-interval '1 hour', now()+interval '1 hour','published') returning id`);
    const code = 'def solve(a, b):\n    total = a + b\n    return total\nprint(solve(1, 2))';
    for (const u of [U.alice, U.bob]) {
      await q(db, `insert into public.submissions (user_id, problem_id, contest_id, language, code, verdict) values ($1,$2,$3,'python',$4,'AC')`,
        [u, pid, c.id, u === U.bob ? code.replace(/total/g, 'TOTAL') + '  # mine' : code]);
    }
    await as(db, U.alice);
    await fails(db, `select public.flag_plagiarism($1)`, [c.id], '42501');
    await as(db, 'service');
    assert.equal((await one(db, `select public.flag_plagiarism($1) n`, [c.id])).n, 1);
  }),

  t('quizzes: answer keys are unreadable; grading is server-side', async (db) => {
    await as(db, 'postgres');
    const z = await one(db, `insert into public.quizzes (slug, title, status) values ('py-basics','Python basics','published') returning id`);
    const qq = await one(db, `insert into public.quiz_questions (quiz_id, ord, prompt_md, options) values ($1,1,'2+2?','["3","4"]') returning id`, [z.id]);
    await q(db, `insert into public.quiz_answer_keys (question_id, correct, explanation_md) values ($1,'{1}','basic maths')`, [qq.id]);
    await as(db, U.alice);
    assert.equal((await q(db, `select * from public.quiz_answer_keys`)).length, 0);
    const r = (await one(db, `select public.submit_quiz($1, $2::jsonb) r`, [z.id, JSON.stringify({ [qq.id]: [1] })])).r;
    assert.equal(r.score_pct, 100); assert.equal(r.passed, true);
    await as(db, 'anon');
    await fails(db, `select * from public.quiz_answer_keys`, [], '42501');
  }),

  t('articles: authors draft + submit; only editors publish; edits after publish go back to review and are versioned', async (db) => {
    await as(db, U.alice);
    const a = await one(db, `insert into public.articles (slug, title, body_md, status) values ('intro-recursion','Intro to recursion','v1','published') returning id, status`);
    assert.equal(a.status, 'draft', 'self-publish downgraded');
    await fails(db, `update public.articles set status='published' where id=$1`, [a.id], /only editors/);
    await q(db, `update public.articles set status='pending_review' where id=$1`, [a.id]);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.articles where id=$1`, [a.id])).length, 0, 'drafts private');
    await as(db, U.admin);
    await q(db, `select public.admin_review_article($1,'publish')`, [a.id]);
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.articles where id=$1`, [a.id])).length, 1);
    await as(db, U.alice);
    await q(db, `update public.articles set body_md='v2' where id=$1`, [a.id]);
    const after = await one(db, `select status, version from public.articles where id=$1`, [a.id]);
    assert.equal(after.status, 'pending_review'); assert.equal(after.version, 2);
    assert.equal((await q(db, `select 1 from public.article_versions where article_id=$1`, [a.id])).length, 1);
  }),

  t('bookmarks are private to their owner', async (db) => {
    const pid = await seedProblem(db, { slug: 'bm-p' });
    await as(db, U.alice);
    await q(db, `insert into public.bookmarks (user_id, kind, ref_id) values ($1,'problem',$2)`, [U.alice, pid]);
    await fails(db, `insert into public.bookmarks (user_id, kind, ref_id) values ($1,'problem',$2)`, [U.bob, pid]);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.bookmarks`)).length, 0);
  }),
];
