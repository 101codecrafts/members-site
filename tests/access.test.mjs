// CCAccess (js/access.js) unit tests: node --test tests/access.test.mjs
// Loads the real file in a VM with a minimal DOM stub. Optional parity check against the backend: set
// BACKEND_ACCESS=/path/to/backend/lib/access.ts (run with --experimental-strip-types) to compare every decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../js/access.js', import.meta.url), 'utf8');
const policy = JSON.parse(readFileSync(new URL('../src/data/access-policy.json', import.meta.url), 'utf8'));

function load(href = 'https://x.test/index.html') {
  const cls = new Set(), listeners = {};
  const document = {
    readyState: 'complete', body: { dataset: { page: (new URL(href).pathname.match(/([a-z0-9-]+)\.html$/) || [, 'index'])[1] } },
    documentElement: { classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) }, dataset: {} },
    querySelector: () => null, querySelectorAll: () => [], addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    dispatchEvent: () => true, createElement: () => ({}),
  };
  const replaced = [];
  const location = Object.assign(new URL(href), { replace: (u) => replaced.push(u) });
  const window = {};
  const ctx = vm.createContext({ window, document, location, URL, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, Promise, console });
  vm.runInContext(src, ctx);
  return { A: window.CCAccess, cls, replaced, listeners };
}

test('the embedded policy equals src/data/access-policy.json (run tools/build.py after editing the JSON)', () => {
  const { A } = load();
  assert.deepEqual(JSON.parse(JSON.stringify(A.policy)), policy);
});

test('starts as visitor; can() follows the policy; unknown actions fail closed', () => {
  const { A } = load();
  assert.equal(A.role, 'visitor');
  assert.equal(A.can('news.read'), true);
  assert.equal(A.why('course.browse'), 'signin');
  assert.equal(A.why('nope.nope'), 'role');
  assert.equal(A.why('$comment'), 'role');
});

test('role/plan only from set() (the server answer); bogus values fall back to least privilege', () => {
  const { A, cls } = load();
  A.set({ role: 'root_admin_pls', user: { id: 'u1' } });
  assert.equal(A.role, 'guest', 'unknown role from anywhere -> guest when signed in');
  A.set({ role: 'learner', plan: 'platinum', user: { id: 'u1' } });
  assert.equal(A.plan, 'free');
  assert.ok(cls.has('role-learner') && !cls.has('role-guest'));
  A.set({ role: 'visitor' });
  assert.equal(A.role, 'visitor');
});

test('limits: defaults from policy, server overrides win', () => {
  const { A } = load();
  A.set({ role: 'tutor', plan: 'free', user: { id: 't' } });
  assert.equal(A.limit('students.max'), 2);
  A.set({ role: 'tutor', plan: 'free', user: { id: 't' }, limits: { 'students.max': 4 } });
  assert.equal(A.limit('students.max'), 4);
  A.set({ role: 'learner', plan: 'pro', user: { id: 'l' } });
  assert.equal(A.limit('courses.active'), null);
});

test('authUrl / safeNext: same-origin paths only, never back to /auth', () => {
  const { A } = load();
  assert.equal(A.authUrl('/courses.html?x=1'), '/auth.html?next=%2Fcourses.html%3Fx%3D1');
  for (const bad of ['https://evil.io/', '//evil.io/x', '/\\evil.io', 'javascript:alert(1)', '/auth.html?next=/x', '/auth'])
    assert.equal(A.safeNext(bad), '', bad);
});

test('page guard: visitor on an app page goes to /auth?next=; wrong role goes home; never a loop', () => {
  let r = load('https://x.test/dashboard.html'); r.A.set({ role: 'visitor' });
  assert.deepEqual(r.replaced, ['/auth.html?next=%2Fdashboard.html']);
  r = load('https://x.test/admin.html'); r.A.set({ role: 'learner', user: { id: 'l' } });
  assert.deepEqual(r.replaced, ['/dashboard.html']);
  r = load('https://x.test/dashboard.html'); r.A.set({ role: 'learner', user: { id: 'l' } });
  assert.deepEqual(r.replaced, [], 'allowed page stays');
  r = load('https://x.test/seller.html'); r.A.set({ role: 'guest', user: { id: 'g' } });
  assert.deepEqual(r.replaced, ['/auth.html?next=%2Fseller.html&upgrade=1'], 'guest -> upgrade path');
  r = load('https://x.test/news.html'); r.A.set({ role: 'visitor' });
  assert.deepEqual(r.replaced, [], 'public page stays public');
});

test('gate modes: hide / lock / tease (BUS F1: guests never see member-only links)', () => {
  const mk = (href) => { const a = { hidden: false, dataset: {}, attrs: { href } };
    a.getAttribute = (k) => (k in a.attrs ? a.attrs[k] : null); a.setAttribute = (k, v) => { a.attrs[k] = String(v); }; a.removeAttribute = (k) => { delete a.attrs[k]; }; return a; };
  const { A } = load();
  const run = (role, mode, action, href) => { A.set(role === 'visitor' ? { role } : { role, user: { id: 'u' } }); const el = mk(href); A.gate(el, action, mode); return el; };
  let el = run('visitor', 'tease', 'shell.full', 'projects.html');
  assert.equal(el.hidden, false, 'visitor sees the teaser'); assert.match(el.dataset.canTo, /^\/auth\.html\?next=%2Fprojects\.html/);
  el = run('guest', 'tease', 'shell.full', 'projects.html'); assert.equal(el.hidden, true, 'guest: projects teaser hidden');
  el = run('guest', 'tease', 'market.sell', 'seller.html'); assert.equal(el.hidden, true, 'guest: Sell on 101 hidden');
  el = run('learner', 'tease', 'market.sell', 'seller.html'); assert.equal(el.hidden, false); assert.equal(el.dataset.canTo, undefined);
  el = run('admin', 'tease', 'market.sell', 'seller.html'); assert.equal(el.hidden, true, 'staff cannot sell -> hidden');
  el = run('guest', 'lock', 'market.sell', 'seller.html'); assert.equal(el.hidden, false, 'lock still shows + routes to upgrade'); assert.match(el.dataset.canTo, /upgrade=1/);
  el = run('visitor', 'hide', 'shell.full', 'projects.html'); assert.equal(el.hidden, true);
});

test('guest-visible source pages gate every link to a member-only page (no F1 regressions)', () => {
  const pages = ['index', 'about', 'community', 'marketplace', 'news', 'courses', 'guest', 'events', 'resources', 'practice', 'ai-tools', 'opportunities', 'pricing'];
  const guestDenied = Object.entries(policy.pages).filter(([p, a]) => p !== '$comment' && !policy.actions[a].roles.includes('guest')).map(([p]) => p);
  const leaks = [];
  for (const pg of pages) {
    let html; try { html = readFileSync(new URL(`../src/${pg}.html`, import.meta.url), 'utf8'); } catch { continue; }
    const body = html.replace(/\{\{[^}]*\}\}/g, '');
    for (const m of body.matchAll(/<a\b[^>]*href="([a-z0-9-]+)\.html[^"]*"[^>]*>/gi)) {
      if (!guestDenied.includes(m[1].toLowerCase())) continue;
      // gated if the anchor or an ancestor opened before it (within 600 chars) carries data-can
      const before = body.slice(Math.max(0, m.index - 600), m.index + m[0].length);
      if (!/data-can="/.test(before)) leaks.push(`${pg}.html -> ${m[1]}.html`);
    }
  }
  // Guest scope for sessions / groups / competitions / testing / card is founder question Q9 (round 11 report): these links
  // still route guests to "become a learner" (lock behaviour). Remove an entry here once the founder decides.
  const PENDING_Q9 = ['index.html -> card.html', 'index.html -> sessions.html', 'index.html -> groups.html', 'about.html -> sessions.html',
    'about.html -> groups.html', 'community.html -> groups.html', 'community.html -> competitions.html', 'community.html -> testing.html'];
  assert.deepEqual(leaks.filter((l) => !PENDING_Q9.includes(l)), []);
});

test('every page in the policy maps to a real action and every role has a home page', () => {
  for (const [p, a] of Object.entries(policy.pages)) { if (p === '$comment') continue; assert.ok(policy.actions[a], `${p} -> ${a}`); }
  for (const r of policy.roles) assert.ok(policy.home[r], r);
});

const backend = process.env.BACKEND_ACCESS;
test('parity with backend lib/access.ts decide() for every role x action x minor/consent x plan', { skip: !backend }, async () => {
  const B = await import(backend);
  const { A } = load();
  let n = 0;
  for (const role of policy.roles) for (const plan of policy.plans) for (const minor of [false, true]) for (const consent of [false, true, undefined])
    for (const action of Object.keys(policy.actions)) {
      const ctx = { role, plan, minor, consent };
      assert.equal(A.why(action, ctx), B.decide(ctx, action), `${action} ${JSON.stringify(ctx)}`); n++;
    }
  assert.ok(n > 1000);
});
