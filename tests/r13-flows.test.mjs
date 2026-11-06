// r13 flows: first-steps task list, guest DOB step, recovery help, ?next honesty, tutor/seller dead ends.
// node --test tests/r13-flows.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

function loadFirstSteps(href = 'https://x.test/dashboard.html') {
  const store = {};
  const window = { CCAccess: { user: { id: 'u1' } } };
  const ctx = vm.createContext({ window, location: new URL(href), URL, history: { replaceState() {}, state: null }, setTimeout: () => 0,
    document: { addEventListener() {} }, CustomEvent: class {},
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } });
  vm.runInContext(rd('js/first-steps.js'), ctx);
  return { F: window.CCFirstSteps, store };
}
const items = [{ label: 'Create your account', status: 'done' }, { label: 'Enrol in your first course', status: 'todo', href: 'courses.html', hint: 'Free courses' },
  { label: 'Save something', status: 'optional', href: 'learn.html', hint: 'hidden hint' }, { label: 'Finish a course', status: 'blocked', hint: 'Opens later' }];

test('first steps: real statuses, the first To do is the loud one, hints only where they help', () => {
  const { F } = loadFirstSteps();
  const h = F.html({ key: 'learner', label: 'First steps', items });
  assert.match(h, /1 of 4 done/);
  assert.match(h, /is-todo is-next/);
  assert.match(h, /Cannot start yet/);
  assert.match(h, /Free courses/); assert.match(h, /Opens later/);
  assert.doesNotMatch(h, /hidden hint/, 'optional task hint is not shown');
  assert.doesNotMatch(h, /<a href="[^"]*"[^>]*>Create your account/, 'a done task is not a link');
  assert.doesNotMatch(h, /<a href="[^"]*"[^>]*>Finish a course/, 'a blocked task is not a link');
});
test('first steps: nothing left to do -> no list; dismissed -> no list (except the welcome visit)', () => {
  const { F, store } = loadFirstSteps();
  assert.equal(F.html({ key: 'k', items: [{ label: 'a', status: 'done' }, { label: 'b', status: 'optional' }] }), '');
  store['cc_fs_hide_k_u1'] = '1';
  assert.equal(F.html({ key: 'k', items }), '');
  assert.notEqual(F.html({ key: 'k', items, welcome: true }), '');
});
test('first steps: ?static=1 renders nothing; ?welcome=1 is read once', () => {
  assert.equal(loadFirstSteps('https://x.test/dashboard.html?static=1').F.html({ key: 'x', items }), '');
  assert.equal(loadFirstSteps('https://x.test/dashboard.html?welcome=1').F.welcome(), true);
  assert.equal(loadFirstSteps('https://x.test/dashboard.html').F.welcome(), false);
});

test('auth-flow: guests give a DOB (L31/LG4); under 18 is offered the learner path; payload carries dob', () => {
  const src = rd('js/auth-flow.js');
  assert.match(src, /guest: \["age", "consent"\]/);
  assert.match(src, /STEP\["guest\.age"\]/);
  assert.match(src, /data-to-learner/);
  assert.match(src, /path: "guest", dob: d\.dob/);
  assert.match(src, /err\.details && err\.details\.path === "learner"/, 'server refusal routes to the learner path');
});
test('auth-flow: recovery help on the email and code steps, live resend countdown, retry when Clerk is down', () => {
  const src = rd('js/auth-flow.js');
  assert.match(src, /Can\\'t sign in\?/); assert.match(src, /Didn\\'t get the code\?/);
  assert.match(src, /function tickResend/); assert.match(src, /Send a new code \(" \+ w \+ " s\)/);
  assert.match(src, /function showUnavailable/); assert.doesNotMatch(src, /then reload the page/);
});
test('auth-flow: a ?next page this role cannot open is explained, not silently dropped', () => {
  const src = rd('js/auth-flow.js');
  assert.match(src, /function showNotForRole/);
  assert.match(src, /if \(asked && !allowedNext\(s\.role\) && !LANDED_NEW\) return showNotForRole/);
  assert.match(src, /welcome=1/);
});
test('tutor: unverified tutors get a status list and locked builder links (no 403 dead end)', () => {
  const t = rd('js/tutor.js'), b = rd('js/builder.js');
  assert.match(t, /tStatus && tStatus !== "verified"/);
  assert.match(t, /removeAttribute\("data-can"\)/, 'CCAccess.refresh must not re-enable a locked link');
  assert.match(t, /status: "blocked"/);
  assert.match(b, /The builder opens when you're verified/);
  assert.doesNotMatch(b, /Sign in again, or ask an admin to verify your tutor profile/);
});
test('seller readiness: only from the r13 session fields, never in ?static, payout form locked when withdrawals are closed', () => {
  const s = rd('js/seller-ready.js');
  assert.match(s, /if \(\/\[\?&\]static\/\.test\(location\.search\)\) return;/);
  assert.match(s, /!\("store" in sess\)/, 'old API (no store field) -> claims nothing');
  assert.match(s, /\/api\/v1\/marketplace\/stores/);
  assert.match(s, /el\.disabled = true/);
});
test('pages load the new scripts in order (first-steps before the page script)', () => {
  for (const [page, after] of [['dashboard.html', 'learner.js'], ['tutor.html', 'tutor.js'], ['seller.html', 'seller-ready.js']]) {
    const h = rd(page);
    assert.ok(h.indexOf('js/first-steps.js') > 0 && h.indexOf('js/first-steps.js') < h.indexOf('js/' + after), page);
    assert.match(h, /css\/flows\.css/);
  }
});
