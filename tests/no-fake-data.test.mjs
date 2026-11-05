// Founder rule: no demo/fake data for real accounts. Loads the REAL data + API modules (marketplace, practice, sessions, feed)
// with the backend unreachable or answering empty, calls every read and every write a page can trigger, and asserts that
// nothing from the bundled placeholder files and no fake success comes back. node --test tests/no-fake-data.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const rd = (f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');

function sandbox(fetchImpl, href = 'https://x.test/marketplace.html') {
  const store = {};
  const window = { CC_CONFIG: { apiBase: '/api' }, addEventListener() {}, dispatchEvent() {} };
  const ctx = vm.createContext({ window, console, URLSearchParams, URL, AbortController, setTimeout, clearTimeout, Date, JSON, Math, Promise, Uint8Array,
    crypto: globalThis.crypto, location: new URL(href), document: { querySelector: () => null, addEventListener() {} }, CustomEvent: class {},
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    fetch: fetchImpl });
  ctx.window.window = ctx.window; ctx.self = ctx.window;
  return { ctx, window };
}
const down = async () => { throw new TypeError('Failed to fetch'); };
const empty = async (url) => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ data: /\/(overview|potd|progress)/.test(url) ? null : [] }) });
const s = (v) => JSON.stringify(v ?? null);
// markers that only exist in the placeholder files
const SEED = /Kato Builds|s-kato|Amooti|Nakato|Okello|Achieng|Mugisha|101-DEMO|weekly-48|Cavendish University Uganda|Maximum Subarray|"mock":true|"stub":true|demo session/i;

for (const [name, impl] of [['backend down', down], ['backend empty', empty]]) {
  test(`marketplace (${name}): no seed listings, orders, seller numbers, RFQs; mutations never fake success`, async () => {
    const { ctx, window } = sandbox(impl);
    vm.runInContext(rd('market-data.js'), ctx);
    window.CC_V1 = { toV1: (p) => '/v1' + p, unwrap: (j) => (j && j.data !== undefined ? j.data : j) };
    vm.runInContext(rd('market-api.js'), ctx);
    const M = window.MarketAPI; await M.ready;
    const reads = [await M.fetchProducts({}), await M.fetchOrders(), await M.fetchSellerOverview(), await M.fetchRFQ(), await M.fetchReviews('x'), await M.fetchQA('x')];
    for (const r of reads) assert.doesNotMatch(s(r), SEED);
    for (const w of [await M.updateOrderStatus('o', 2), await M.requestSellerPayout(1000, 'mtn'), await M.replyReview(0, 'hi'), await M.acceptQuote('r', 's'),
      await M.sendQuote('r', { unit: 1 }), await M.confirmDelivery('o', 't'), await M.openDispute('o', { reason: 'x' })]) {
      if (name === 'backend down') assert.notEqual(w && w.ok, true, 'a write that never reached a server reported ok: ' + s(w));
    }
  });

  test(`practice (${name}): no mock problems, contests, streaks or verdicts`, async () => {
    const { ctx, window } = sandbox(impl, 'https://x.test/practice.html');
    vm.runInContext(rd('practice-data.js'), ctx); vm.runInContext(rd('practice-api.js'), ctx);
    const P = window.CC_PAPI;
    for (const r of [await P.problems({}), await P.contests(), await P.potd(), await P.progress(), await P.articles({}), await P.leaderboard('x')]) assert.doesNotMatch(s(r), SEED);
    const v = await P.submit('x', 'python', 'print(1)'); assert.notEqual(v && v.verdict, 'Accepted');
  });

  test(`sessions (${name}): no demo session, no fake attendance or connected providers`, async () => {
    const { ctx, window } = sandbox(impl, 'https://x.test/sessions.html');
    vm.runInContext(rd('sessions-api.js'), ctx);
    const S = window.SessionsAPI;
    const list = await S.list().catch((e) => e); assert.doesNotMatch(s(list), SEED);
    const ints = await S.integrations().catch((e) => e);
    for (const i of (ints && ints.integrations) || []) if (i.provider !== 'jitsi') assert.notEqual(i.connected, true, s(i));
  });

  test(`feed (${name}): no placeholder announcements, opportunities, events or attendees`, async () => {
    const { ctx, window } = sandbox(impl, 'https://x.test/news.html');
    vm.runInContext(rd('feed-data.js'), ctx); vm.runInContext(rd('events-data.js'), ctx); vm.runInContext(rd('feed-api.js'), ctx);
    const F = window.CC_FEED_API;
    for (const r of [await F.fetchAnnouncements(), await F.fetchOpportunities(), await F.fetchEvents(), await F.attendees('e1')]) assert.doesNotMatch(s(r), SEED);
    const t = await F.rsvp('e1', { name: 'A', email: 'a@b.c' }).catch((e) => ({ refused: e.message }));
    if (name === 'backend down') assert.ok(t.refused, 'RSVP with no server must not mint a ticket');
  });
}
