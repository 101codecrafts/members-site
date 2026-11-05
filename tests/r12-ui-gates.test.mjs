// r12 front-end fixes: groups CTA for signed-in members, organiser view only for organisers/admins,
// marketplace hero + "Deals of the day" only from real listings. node --test tests/r12-ui-gates.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const plain = (v) => JSON.parse(JSON.stringify(v)); // vm arrays are another realm
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

function ctxFor(href, fetchImpl = async () => { throw new TypeError('Failed to fetch'); }) {
  const store = {};
  const window = { CC_CONFIG: { apiBase: '/api' }, addEventListener() {}, dispatchEvent() {} };
  const ctx = vm.createContext({ window, console, URLSearchParams, URL, AbortController, setTimeout, clearTimeout, Date, JSON, Math, Promise,
    location: new URL(href), document: { querySelector: () => null, addEventListener() {} }, CustomEvent: class {},
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } }, fetch: fetchImpl });
  ctx.window.window = ctx.window; ctx.self = ctx.window;
  return { ctx, window };
}

/* ---------- groups: "Sign in to join a group" never shown to a signed-in learner ---------- */
test('pages.js afterAccess waits for the server role before drawing, and redraws if the answer is late', async () => {
  const src = rd('js/pages.js');
  const fn = src.match(/const afterAccess = async draw => \{[\s\S]*?\n  \};/);
  assert.ok(fn, 'afterAccess helper present');
  const groups = src.slice(src.indexOf('async groups()'), src.indexOf('/* ---------------- Projects'));
  assert.match(groups, /afterAccess\(draw\)/, 'groups() draws through afterAccess');
  assert.doesNotMatch(groups, /levelChips\([^)]*\)[^;]*\); draw\(\);/, 'groups() no longer draws before the role is known');
  const run = (A) => { const c = vm.createContext({ window: { CCAccess: A }, Promise, setTimeout }); vm.runInContext(fn[0] + '; this.afterAccess = afterAccess;', c); return c.afterAccess; };
  // role resolves after 20 ms: the single draw happens with the learner role
  let resolve; const A = { role: 'visitor', resolved: false, ready: new Promise((r) => { resolve = r; }) };
  const seen = []; const p = run(A)(async () => { seen.push(A.role); });
  setTimeout(() => { A.role = 'learner'; A.resolved = true; resolve(A); }, 20);
  await p; assert.deepEqual(seen, ['learner']);
  // already resolved: draws immediately, once
  const B = { role: 'tutor', resolved: true, ready: Promise.resolve() }; const seen2 = [];
  await run(B)(async () => { seen2.push(B.role); }); assert.deepEqual(seen2, ['tutor']);
});

/* ---------- events: organiser view ---------- */
test('organiser view: hidden for visitors/guests/ordinary members; organisers see their own hosted events; admins see all hosted', () => {
  const { ctx, window } = ctxFor('https://x.test/events.html');
  vm.runInContext(rd('js/feed-api.js'), ctx);
  const F = window.CC_FEED_API;
  const all = [{ id: 'a', host101: true, organiser: true }, { id: 'b', host101: true, organiser: false }, { id: 'c', host101: false, organiser: true }];
  for (const r of ['visitor', 'guest', undefined, null]) assert.deepEqual(plain(F.organiserEvents(all, r)), [], String(r));
  assert.deepEqual(plain(F.organiserEvents(all.filter((e) => !e.organiser), 'learner')), []);
  assert.deepEqual(F.organiserEvents(all, 'tutor').map((e) => e.id), ['a']);
  assert.deepEqual(F.organiserEvents(all, 'admin').map((e) => e.id), ['a', 'b']);
  assert.deepEqual(F.organiserEvents(all, 'root_admin').map((e) => e.id), ['a', 'b']);
  // the server flag is the only source: a truthy non-boolean never makes someone an organiser
  assert.equal(F._map.mapEvent({ id: 'x', starts_at: '2026-12-01T10:00:00Z', organiser: 'yes' }).organiser, false);
  assert.equal(F._map.mapEvent({ id: 'x', starts_at: '2026-12-01T10:00:00Z', organiser: true }).organiser, true);
});
test('events.html ships the organiser button and section hidden (src and built)', () => {
  for (const f of ['src/events.html', 'events.html']) {
    const h = rd(f);
    assert.match(h, /href="#organiser" id="org-btn" hidden/, f);
    assert.match(h, /<section class="card" id="organiser"[^>]* hidden>/, f);
  }
});

/* ---------- marketplace hero + deals ---------- */
const PROMO = /Refurbished|1\.35M|warranty|Graded A|IOT STARTER|Bulk prices|hub desk|BACK-TO-CAMPUS/i;
async function market(rows) {
  const ok = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ data: rows }) });
  const { ctx, window } = ctxFor('https://x.test/marketplace.html', ok);
  vm.runInContext(rd('js/market-data.js'), ctx);
  window.CC_V1 = { toV1: (p) => '/v1' + p, unwrap: (j) => (j && j.data !== undefined ? j.data : j) };
  vm.runInContext(rd('js/market-api.js'), ctx);
  const M = window.MarketAPI; await M.ready; return { M, products: await M.fetchProducts({}) };
}
test('marketplace hero: no listings -> no slides and no deals (band hidden)', async () => {
  const { M, products } = await market([]);
  assert.deepEqual(plain(M.heroSlides(products)), []); assert.deepEqual(plain(M.deals(products)), []);
  assert.deepEqual(plain(M.heroSlides(undefined)), []); assert.deepEqual(plain(M.deals(null)), []);
});
test('marketplace hero: slides come only from real rows (real count + lowest real price), never the old promo copy', async () => {
  const rows = [
    { id: 'u1', slug: 'p1', title: 'Arduino course bundle', type: 'course_bundle', price_ugx: 30000, images: [] },
    { id: 'u2', slug: 'p2', title: 'Logo design', type: 'service', price_ugx: 45000, images: ['https://cdn.example/x.png'] },
    { id: 'u3', slug: 'p3', title: 'Used laptop', type: 'physical', price_ugx: 900000, compare_at_ugx: 1000000, images: [] },
    { id: 'u4', slug: 'p4', title: 'Free thing', type: 'digital', price_ugx: 0 } ];
  const { M, products } = await market(rows);
  const slides = M.heroSlides(products);
  assert.ok(slides.length >= 1 && slides.length <= 3);
  assert.doesNotMatch(JSON.stringify(slides), PROMO);
  const lap = slides.find((s) => /cat=laptops/.test(s.href));
  assert.ok(lap, 'laptops slide from the real physical listing');
  assert.match(lap.t, /from UGX 900,000$/); assert.match(lap.s, /^1 listing on 101 Market/);
  assert.equal(slides.some((s) => s.quick === 'member'), false, 'no "Made by 101" slide without member listings');
  assert.deepEqual(plain(M.deals(products)), [], 'backend rows are never flagged deal -> deals band stays hidden');
});
test('marketplace.html ships the hero and deals bands hidden; market.js no longer hard-codes the promos', () => {
  for (const f of ['src/marketplace.html', 'marketplace.html']) {
    const h = rd(f);
    assert.match(h, /id="mk-hero" hidden>/, f); assert.match(h, /aria-labelledby="h-deals" hidden>/, f);
  }
  assert.doesNotMatch(rd('js/market.js'), PROMO);
});
