// js/feed-api.js against the REAL backend envelopes (BUS Q1). node --test tests/feed-api.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../js/feed-api.js', import.meta.url), 'utf8');
function load(routes) {
  const store = {}; const calls = [];
  const window = { CC_CONFIG: { apiBase: '/api' } };
  const ctx = vm.createContext({
    window, console, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, JSON,
    location: new URL('https://x.test/news.html'),
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    fetch: async (url) => { calls.push(url); const hit = Object.entries(routes).find(([p]) => url.startsWith('/api/v1' + p));
      if (!hit) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => hit[1] }; },
  });
  vm.runInContext(src, ctx);
  return { F: window.CC_FEED_API, calls };
}
const future = new Date(Date.now() + 5 * 864e5).toISOString(), past = new Date(Date.now() - 864e5).toISOString();

test('unwrap: {data:[…]}, {data:{rows,total}}, {data:{items}} -> array; non-list data passes through', () => {
  const { F } = load({});
  assert.deepEqual(F._unwrap({ data: [1, 2] }), [1, 2]);
  assert.deepEqual(F._unwrap({ data: { rows: [1], total: 1 } }), [1]);
  assert.deepEqual(F._unwrap({ data: { items: [3] } }), [3]);
  assert.deepEqual(F._unwrap({ data: { ok: true } }), { ok: true });
});

test('announcements: real envelope, snake_case mapped, pinned first, no "list.filter is not a function"', async () => {
  const { F } = load({ '/announcements': { data: [
    { id: 'a', title: 'Old', body: 'x', is_pinned: false, published_at: past, expires_at: null },
    { id: 'b', title: 'Pinned', body: 'y', is_pinned: true, published_at: past, expires_at: future },
    { id: 'c', title: 'Expired', body: 'z', is_pinned: false, published_at: past, expires_at: past }] } });
  const r = await F.fetchAnnouncements();
  assert.deepEqual(r.map((a) => a.id), ['b', 'a']);
  assert.equal(r[0].pinned, true); assert.equal(r[0].publishedAt, past);
});

test('news: real /v1/news rows are SHOWN (no silent HN fallback), category -> tab, tab -> ?category=', async () => {
  const { F, calls } = load({ '/news': { data: [{ id: 'n1', source: 'TechCabal', title: 'T', category: 'africa_tech', published_at: past, ai_summary: 's' }] } });
  const r = await F.fetchNews('africa');
  assert.equal(r.length, 1); assert.equal(r[0].tab, 'africa'); assert.equal(r[0].at, past); assert.equal(r[0].summary, 's');
  assert.match(calls[0], /\/api\/v1\/news\?category=africa_tech$/);
  await F.fetchNews('all'); assert.equal(calls[1], '/api/v1/news');
});

test('opportunities {rows,total} and events arrays map to the page shape', async () => {
  const { F } = load({
    '/opportunities': { data: { rows: [{ id: 'o1', type: 'grant', title: 'G', org: 'O', deadline_at: future, levels: ['university', 'professional'] }], total: 1 } },
    '/events': { data: [{ id: 'e1', title: 'Meetup', starts_at: future, ends_at: future, location: 'Kampala', is_online: false, city: 'Kampala', price_ugx: 0, registrations_count: 4, cal_com_url: null, description: 'd' }] },
  });
  const o = await F.fetchOpportunities();
  assert.equal(o[0].deadline, future); assert.equal(o[0].level, 'university, professional');
  const e = await F.fetchEvents();
  assert.equal(e[0].start, future); assert.equal(e[0].venue, 'Kampala'); assert.equal(e[0].region, 'kampala'); assert.equal(e[0].going, 4); assert.equal(e[0].host101, true);
});

test('backend down on a real visit -> honest empty lists (no bundled placeholders)', async () => {
  const { F } = load({});
  for (const v of [await F.fetchAnnouncements(), await F.fetchOpportunities(), await F.fetchEvents(), await F.attendees('e1')]) assert.equal(JSON.stringify(v), '[]');
});
