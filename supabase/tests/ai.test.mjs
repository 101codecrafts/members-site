// AI tools catalogue + on-site AI quotas/usage.
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;

export const tests = [
  t('ai_tools: public sees approved only; members suggest (unapproved); only admins approve', async (db) => {
    await as(db, 'anon');
    const n = (await q(db, `select 1 from public.ai_tools`)).length;
    assert.ok(n >= 5);
    await as(db, U.alice);
    await q(db, `insert into public.ai_tools (name, slug, category, suggested_by) values ('Cool AI','cool-ai','chat',$1)`, [U.alice]);
    await fails(db, `insert into public.ai_tools (name, slug, category, suggested_by, approved) values ('Spam','spam-ai','chat',$1,true)`, [U.alice]);
    assert.equal((await q(db, `update public.ai_tools set approved=true where slug='cool-ai' returning 1`)).length, 0);
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.ai_tools`)).length, n, 'suggestion hidden until approved');
    await as(db, U.admin);
    await q(db, `update public.ai_tools set approved=true, verified_at=now() where slug='cool-ai'`);
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.ai_tools`)).length, n + 1);
    await as(db, 'postgres');
    const cols = (await q(db, `select column_name from information_schema.columns where table_schema='public' and column_name ~ '(api_key|secret)'`)).map((r) => r.column_name);
    assert.deepEqual(cols.filter((c) => /api_key/.test(c)), [], 'no table stores users\' API keys');
  }),

  t('ai quotas: service-only reserve/commit, per-plan daily limits, launch promo = pro, users read own usage only', async (db) => {
    await as(db, U.alice);
    await fails(db, `select public.ai_reserve($1,'chat',100)`, [U.alice], '42501');
    await as(db, 'postgres');
    await q(db, `update public.site_settings set value='{"free":{"requests":2,"tokens":1000},"pro":{"requests":5,"tokens":5000},"minor":{"requests":1,"tokens":500}}' where key='ai.quotas'`);
    await q(db, `update public.site_settings set value='false' where key='promo.active'`).catch(() => {});
    await as(db, 'service');
    const plan = (await one(db, `select app.ai_limits($1) l`, [U.alice])).l.plan;
    const lim = plan === 'pro' ? 5 : 2;
    for (let i = 0; i < lim; i++) {
      const r = (await one(db, `select public.ai_reserve($1,'chat',100) r`, [U.alice])).r;
      assert.equal(r.allowed, true, `call ${i + 1}`);
      await q(db, `select public.ai_commit($1,'ok','groq','llama',50,40)`, [r.usage_id]);
    }
    const denied = (await one(db, `select public.ai_reserve($1,'chat',100) r`, [U.alice])).r;
    assert.equal(denied.allowed, false); assert.equal(denied.reason, 'quota');
    const sys = (await one(db, `select public.ai_reserve(null,'news.summary',500) r`)).r;
    assert.equal(sys.allowed, true, 'system jobs are quota-free');
    await as(db, U.alice);
    const mine = (await one(db, `select public.my_ai_quota() m`)).m;
    assert.equal(mine.used_requests, lim);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.ai_usage where user_id=$1`, [U.alice])).length, 0);
    await fails(db, `insert into public.ai_usage (user_id, feature) values ($1,'chat')`, [U.bob], '42501');
  }),
];
