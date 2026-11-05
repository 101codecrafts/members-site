// js/practice-api.js adapters against the real backend shapes (BUS Q6/Q7). node --test tests/practice-api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const src = readFileSync(new URL('../js/practice-api.js', import.meta.url), 'utf8');
function load(routes) {
  const window = { CC_CONFIG: { apiBase: '/api' } }; const calls = [];
  const ctx = vm.createContext({ window, console, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, JSON, Math, location: new URL('https://x.test/practice.html'),
    fetch: async (url) => { calls.push(url); const hit = Object.entries(routes).find(([p]) => url.split('?')[0] === '/api/v1' + p);
      return hit ? { ok: true, status: 200, json: async () => hit[1] } : { ok: false, status: 404, json: async () => ({}) }; } });
  vm.runInContext(src, ctx);
  return { A: window.CC_PAPI, calls };
}
const J = (v) => JSON.parse(JSON.stringify(v));

test('contests: bare array -> {items} with name/start/end/status (no "reading filter of undefined")', async () => {
  const soon = new Date(Date.now() + 864e5).toISOString(), later = new Date(Date.now() + 2 * 864e5).toISOString();
  const { A, calls } = load({ '/practice/contests': { data: [{ id: 'u1', slug: 'weekly-1', title: 'Weekly 1', starts_at: soon, ends_at: later }] } });
  const r = J(await A.contests('upcoming'));
  assert.equal(r.items.length, 1); assert.equal(r.items[0].id, 'weekly-1'); assert.equal(r.items[0].name, 'Weekly 1'); assert.equal(r.items[0].status, 'upcoming');
  assert.match(calls[0], /when=upcoming/);
});

test('potd: none published -> null; published -> page shape with a real end time', async () => {
  let { A } = load({ '/practice/potd': { data: { day: '2026-11-05', problems: null } } });
  assert.equal(await A.potd(), null);
  ({ A } = load({ '/practice/potd': { data: { day: '2026-11-05', problems: { id: 'p', slug: 'two-sum', title: 'Two Sum', difficulty: 'easy', tags: ['arrays'] } } } }));
  const p = J(await A.potd());
  assert.equal(p.problemId, 'two-sum'); assert.equal(p.difficulty, 'Easy'); assert.ok(Number.isFinite(Date.parse(p.endsAt)));
});

test('progress: fresh account (stats null) -> empty zeros; real stats mapped, unknown rank stays null', async () => {
  let { A } = load({ '/practice/progress': { data: { stats: null, by_topic: [], by_difficulty: {} } } });
  let g = J(await A.progress()); assert.equal(g.empty, true); assert.equal(g.streak, 0); assert.equal(g.codingScore, 0);
  ({ A } = load({ '/practice/progress': { data: { stats: { coding_score: 12, solved_total: 3, potd_streak: 2, potd_best: 5 }, by_topic: [{ topic: 'arrays', name: 'Arrays', solved: 3, total: 9 }], by_difficulty: { easy: 3 } } } }));
  g = J(await A.progress());
  assert.equal(g.solved, 3); assert.equal(g.rank, null); assert.deepEqual(g.byDifficulty, { Easy: { solved: 3, total: null } }); assert.equal(g.byTopic[0].topic, 'Arrays'); assert.equal(g.bestStreak, 5);
});

test('problems {rows,total} -> items mapped; backend down -> honest empty, never the mock', async () => {
  let { A } = load({ '/practice/problems': { data: { rows: [{ id: 'x', slug: 'pair-sum', title: 'Pair', difficulty: 'medium', tags: ['arrays'], company_tags: [], solved_count: 1, attempts_count: 4 }], total: 1 } } });
  const r = J(await A.problems({}));
  assert.equal(r.items[0].id, 'pair-sum'); assert.equal(r.items[0].accuracy, 25); assert.equal(r.total, 1);
  ({ A } = load({}));
  assert.equal(J(await A.problems({})).items.length, 0);
  assert.equal(await A.potd(), null);
});
