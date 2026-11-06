// r13/architecture-api: durable job queue + storage purge on erase (migration 20261107013000_r13_jobs_queue.sql).
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';
const { as, q, one, fails, t } = helpers;

export const tests = [
  t('JOBS-1: queue functions are service-role only (anon and members get 42501 / no grant)', async (db) => {
    for (const who of ['anon', U.alice]) {
      await as(db, who);
      await fails(db, `select public.job_enqueue('email.send', '{}'::jsonb)`, [], '42501');
      await fails(db, `select * from public.job_claim('w1')`, [], '42501');
      await fails(db, `select public.job_stats()`, [], '42501');
    }
    await as(db, U.alice);
    await fails(db, `select * from app.jobs`, [], '42501');
  }),

  t('JOBS-2: enqueue -> claim -> complete; a dedupe key returns the open job instead of a second row', async (db) => {
    await as(db, 'service');
    const a = (await one(db, `select public.job_enqueue('email.send', '{"to":"x"}'::jsonb, now(), 'k1') id`)).id;
    const b = (await one(db, `select public.job_enqueue('email.send', '{"to":"y"}'::jsonb, now(), 'k1') id`)).id;
    assert.equal(a, b, 'same open job');
    const claimed = await q(db, `select * from public.job_claim('w1', 10, array['email.send'])`);
    assert.equal(claimed.length, 1); assert.equal(claimed[0].status, 'running'); assert.equal(claimed[0].attempts, 1); assert.equal(claimed[0].locked_by, 'w1');
    assert.equal((await q(db, `select * from public.job_claim('w2', 10, array['email.send'])`)).length, 0, 'a leased job is not claimed twice');
    await db.query(`select public.job_complete($1, '{"sent":1}'::jsonb)`, [a]);
    await as(db, 'postgres');
    const row = await one(db, `select status, result, finished_at, locked_by from app.jobs where id = $1`, [a]);
    assert.equal(row.status, 'done'); assert.deepEqual(row.result, { sent: 1 }); assert.ok(row.finished_at); assert.equal(row.locked_by, null);
    await as(db, 'service');
    const c = (await one(db, `select public.job_enqueue('email.send', '{}'::jsonb, now(), 'k1') id`)).id;
    assert.notEqual(c, a, 'after completion the same dedupe key can be queued again');
  }),

  t('JOBS-3: failure backs off exponentially and goes dead after max_attempts', async (db) => {
    await as(db, 'service');
    const id = (await one(db, `select public.job_enqueue('payout.disburse', '{}'::jsonb, now(), null, 2) id`)).id;
    await q(db, `select * from public.job_claim('w1')`);
    assert.equal((await one(db, `select public.job_fail($1, 'provider timeout') s`, [id])).s, 'failed');
    await as(db, 'postgres');
    const f = await one(db, `select status, run_after > now() + interval '20 seconds' later, last_error from app.jobs where id = $1`, [id]);
    assert.equal(f.status, 'failed'); assert.equal(f.later, true, 'retry is scheduled in the future'); assert.equal(f.last_error, 'provider timeout');
    await as(db, 'service');
    assert.equal((await q(db, `select * from public.job_claim('w1')`)).length, 0, 'not due yet');
    await as(db, 'postgres');
    await db.query(`update app.jobs set run_after = now() - interval '1 second' where id = $1`, [id]);
    await as(db, 'service');
    assert.equal((await q(db, `select * from public.job_claim('w1')`)).length, 1);
    assert.equal((await one(db, `select public.job_fail($1, 'again') s`, [id])).s, 'dead', 'attempts reached max_attempts');
    const st = (await one(db, `select public.job_stats() s`)).s;
    assert.ok(st.dead >= 1);
  }),

  t('JOBS-4: a crashed worker\'s lease expires and the job is claimed again', async (db) => {
    await as(db, 'service');
    const id = (await one(db, `select public.job_enqueue('storage.purge_user', '{}'::jsonb) id`)).id;
    await q(db, `select * from public.job_claim('w-crashed', 10, null, 30)`);
    await as(db, 'postgres');
    await db.query(`update app.jobs set locked_until = now() - interval '1 second' where id = $1`, [id]);
    await as(db, 'service');
    const again = await q(db, `select * from public.job_claim('w2')`);
    assert.equal(again.length, 1); assert.equal(again[0].attempts, 2); assert.equal(again[0].locked_by, 'w2');
  }),

  t('JOBS-5: erase_user enqueues one storage.purge_user job with the tutor ID document path captured before it is nulled', async (db) => {
    await as(db, 'postgres');
    await db.query(`delete from public.tutor_applications where user_id = $1`, [U.bob]);
    await db.query(`insert into public.tutor_applications (user_id, bio, expertise, id_document_path)
                    values ($1, repeat('I teach Python and data science to beginners in Kampala. ', 2), '{python}', $1 || '/id-front.jpg')`, [U.bob]);
    await as(db, 'service');
    await db.query(`select public.erase_user($1, 'privacy-job')`, [U.bob]);
    await as(db, 'postgres');
    const jobs = await q(db, `select kind, payload, status, dedupe_key from app.jobs where kind = 'storage.purge_user' and payload->>'user_id' = $1`, [U.bob]);
    assert.equal(jobs.length, 1);
    const p = jobs[0].payload;
    assert.equal(jobs[0].status, 'queued'); assert.equal(jobs[0].dedupe_key, `storage.purge_user:${U.bob}`);
    assert.ok(p.prefixes.some((x) => x.bucket === 'avatars' && x.prefix === `${U.bob}/`));
    assert.ok(!p.prefixes.some((x) => ['course-media', 'listing-files', 'marketplace-private'].includes(x.bucket)), 'paid content is not purged');
    assert.deepEqual(p.paths, [{ bucket: 'tutor-docs', path: `${U.bob}/id-front.jpg` }]);
    const ta = await one(db, `select id_document_path from public.tutor_applications where user_id = $1`, [U.bob]);
    assert.equal(ta.id_document_path, null, 'the r12 AFTER trigger still nulls the column');
  }),

  t('JOBS-6: a profile update that is not an erase enqueues nothing', async (db) => {
    await as(db, 'postgres');
    await db.query(`update public.profiles set headline = 'hello' where id = $1`, [U.alice]);
    assert.equal((await q(db, `select 1 from app.jobs where payload->>'user_id' = $1`, [U.alice])).length, 0);
  }),
];
