// r11 shared access contract: policy decisions, role resolution, and forged-role rejection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { POLICY } from '../lib/access-policy.ts';
import { ROLES, ageOn, can, decide, homeFor, isRootEmail, limit, redirectFor, resolveRole, type Role } from '../lib/access.ts';
import { onboardingSubmit, onboardingDraft, stripForMinor, CONSENT_VERSION } from '../lib/onboarding.ts';

const json = JSON.parse(readFileSync(new URL('../data/access-policy.json', import.meta.url), 'utf8'));

test('lib/access-policy.ts is generated from data/access-policy.json (no drift)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(POLICY)), json);
});

test('contract shape: six roles, four plans, every action names known roles/plans and a <area>.<verb> key', () => {
  assert.deepEqual(ROLES, ['visitor', 'guest', 'learner', 'tutor', 'admin', 'root_admin']);
  assert.deepEqual(POLICY.plans, ['free', 'standard', 'plus', 'pro']);
  for (const [k, v] of Object.entries(POLICY.actions as Record<string, unknown>)) {
    if (k === '$comment') continue;
    assert.match(k, /^[a-z]+\.[a-z_]+$/, k);
    const r = v as { roles: string[]; plans?: string[]; minor?: string };
    assert.ok(r.roles.length > 0 && r.roles.every((x) => (ROLES as readonly string[]).includes(x)), `${k} roles`);
    if (r.plans) assert.ok(r.plans.every((p) => (POLICY.plans as readonly string[]).includes(p)), `${k} plans`);
    if (r.minor) assert.ok(['deny', 'consent'].includes(r.minor), `${k} minor`);
  }
  for (const role of ROLES) assert.match(homeFor(role), /^\/[a-z-]+\.html$/);
  for (const [page, act] of Object.entries(POLICY.pages as Record<string, string>)) {
    if (page === '$comment') continue;
    assert.ok(Object.prototype.hasOwnProperty.call(POLICY.actions, act), `page ${page} -> unknown action ${act}`);
  }
});

const C = (role: Role, extra: object = {}) => ({ role, plan: 'free' as const, ...extra });

test('visitor: marketing only — no shell, no courses, no buying/selling, gated taps ask to sign in', () => {
  assert.ok(can(C('visitor'), 'news.read'));
  assert.ok(can(C('visitor'), 'page.public'));
  for (const a of ['shell.app', 'course.browse', 'resource.open', 'market.buy', 'market.sell', 'course.rate', 'dashboard.learner'])
    assert.equal(decide(C('visitor'), a), 'signin', a);
});

test('guest: limited shell, external + free courses, can buy; cannot sell, create, rate, take 1:1s or tutor/premium courses; no dashboard', () => {
  for (const a of ['shell.app', 'course.take_external', 'course.take_free', 'market.buy', 'news.read', 'guest.home', 'account.upgrade'])
    assert.ok(can(C('guest'), a), a);
  for (const a of ['shell.full', 'market.sell', 'project.create', 'course.create', 'course.take_tutor', 'course.take_premium', 'session.book', 'course.rate', 'resource.rate',
    'dashboard.learner', 'dashboard.tutor', 'dashboard.admin'])
    assert.equal(decide(C('guest'), a), 'role', a);
});

test('learner / tutor: different dashboards; both sell; premium needs a paid plan; tutors create courses', () => {
  assert.ok(can(C('learner'), 'dashboard.learner')); assert.ok(!can(C('learner'), 'dashboard.tutor'));
  assert.ok(can(C('tutor'), 'dashboard.tutor')); assert.ok(!can(C('tutor'), 'dashboard.learner'));
  assert.ok(can(C('learner'), 'market.sell')); assert.ok(can(C('tutor'), 'market.sell'));
  assert.ok(!can(C('learner'), 'course.create')); assert.ok(can(C('tutor'), 'course.create'));
  assert.equal(decide(C('learner'), 'course.take_premium'), 'plan');
  assert.ok(can({ role: 'learner', plan: 'standard' }, 'course.take_premium'));
  assert.ok(can(C('admin'), 'course.take_premium'), 'staff bypass plans');
});

test('admin vs root_admin: only root adds/removes admins', () => {
  assert.ok(can(C('admin'), 'dashboard.admin')); assert.ok(can(C('admin'), 'approvals.review'));
  assert.equal(decide(C('admin'), 'admin.add'), 'role'); assert.equal(decide(C('admin'), 'admin.remove'), 'role');
  assert.ok(can(C('root_admin'), 'admin.add')); assert.ok(can(C('root_admin'), 'admin.remove'));
});

test('minors: no selling ever; consent-gated actions blocked until a guardian verifies', () => {
  assert.equal(decide(C('learner', { minor: true, consent: true }), 'market.sell'), 'minor');
  assert.equal(decide(C('learner', { minor: true, consent: false }), 'market.buy'), 'consent');
  assert.equal(decide(C('learner', { minor: true, consent: false }), 'community.post'), 'consent');
  assert.ok(can(C('learner', { minor: true, consent: true }), 'community.post'));
  assert.ok(can(C('learner', { minor: true, consent: false }), 'course.take_external'), 'free learning stays open');
});

test('unknown actions fail closed; limits default from the policy and admin overrides win', () => {
  assert.equal(decide(C('root_admin'), 'nope.nope'), 'role');
  assert.equal(decide(C('root_admin'), '$comment'), 'role');
  assert.equal(limit(C('tutor'), 'students.max'), 2);
  assert.equal(limit(C('learner'), 'courses.active'), 1);
  assert.equal(limit({ role: 'learner', plan: 'pro' }, 'courses.active'), null);
  assert.equal(limit(C('tutor'), 'students.max', { 'students.max': 5 }), 5);
});

test('root_admin only for the VERIFIED 101codecrafts@gmail.com; dots, +tags, look-alikes and unverified never qualify', () => {
  assert.ok(isRootEmail('101codecrafts@gmail.com', true));
  assert.ok(isRootEmail(' 101CodeCrafts@Gmail.com ', true));
  for (const e of ['101codecrafts@gmail.com.evil.io', '101.codecrafts@gmail.com', '101codecrafts+x@gmail.com', '101codecrafts@googlemail.com', 'x101codecrafts@gmail.com', null, ''])
    assert.ok(!isRootEmail(e as string, true), String(e));
  assert.ok(!isRootEmail('101codecrafts@gmail.com', false), 'unverified');
});

test('SECURITY: a forged role is rejected — role comes from DB rows + verified email only', () => {
  // A non-root user who somehow got a super_admin row (or forged metadata) is never root_admin.
  assert.equal(resolveRole({ dbRoles: ['super_admin'], email: 'attacker@gmail.com', emailVerified: true, onboarded: true }), 'admin');
  // No DB role: guest, whatever the client claims elsewhere.
  assert.equal(resolveRole({ dbRoles: [], email: 'attacker@gmail.com', emailVerified: true, onboarded: false }), 'guest');
  // Unverified root address: not root.
  assert.equal(resolveRole({ dbRoles: [], email: '101codecrafts@gmail.com', emailVerified: false, onboarded: false }), 'guest');
  // Verified root address: root even before the row exists.
  assert.equal(resolveRole({ dbRoles: [], email: '101codecrafts@gmail.com', emailVerified: true, onboarded: false }), 'root_admin');
  // Onboarding bodies are strict: smuggling a role/plan/status key is a validation error, on every path.
  const consent = { terms: true, version: CONSENT_VERSION };
  for (const extra of [{ role: 'root_admin' }, { roles: ['admin'] }, { plan: 'pro' }, { status: 'active' }, { is_admin: true }, { email: '101codecrafts@gmail.com' }]) {
    assert.equal(onboardingSubmit.safeParse({ path: 'guest', consent, ...extra }).success, false, JSON.stringify(extra));
  }
  // An invented path is rejected (no "admin" path exists).
  assert.equal(onboardingSubmit.safeParse({ path: 'admin', consent }).success, false);
  assert.equal(onboardingSubmit.safeParse({ path: 'root_admin', consent }).success, false);
});

test('redirect after sign-in by role; unfinished onboarding goes back to /auth (staff never)', () => {
  assert.equal(redirectFor('root_admin', true), '/admin.html');
  assert.equal(redirectFor('admin', false), '/admin.html');
  assert.equal(redirectFor('tutor', true), '/tutor.html');
  assert.equal(redirectFor('learner', true), '/dashboard.html');
  assert.equal(redirectFor('guest', true), '/guest.html');
  assert.equal(redirectFor('guest', false), '/auth.html?step=path');
});

test('age gate: whole years in UTC, invalid dates rejected, the 18th birthday counts as adult', () => {
  const d = new Date(Date.UTC(2026, 10, 5));
  assert.equal(ageOn('2008-11-05', d), 18);
  assert.equal(ageOn('2008-11-06', d), 17);
  assert.equal(ageOn('2010-02-31', d), null);
  assert.equal(ageOn('05/11/2008', d), null);
});

test('onboarding schemas per path: learner and tutor fields, consent required, minor drafts keep the minimum', () => {
  const consent = { terms: true, version: CONSENT_VERSION };
  const learner = { path: 'learner', name: 'Amina N', dob: '2001-04-02', gender: 'female', level: 'university', interests: ['web'], goals: ['job'], heard_from: 'friend', consent };
  assert.ok(onboardingSubmit.safeParse(learner).success);
  assert.equal(onboardingSubmit.safeParse({ ...learner, consent: { terms: false, version: CONSENT_VERSION } }).success, false);
  assert.equal(onboardingSubmit.safeParse({ ...learner, interests: [] }).success, false);
  const tutor = { path: 'tutor', name: 'Okello P', dob: '1990-01-01', gender: 'male', phone: '+256700000000', levels: ['a_level'], subjects: ['Python'],
    years_experience: 4, bio: 'x'.repeat(60), payout_phone: '0770000000', payout_network: 'MTN', credentials: [{ title: 'BSc CS', url: 'https://example.org/c' }], heard_from: 'tutor', consent };
  assert.ok(onboardingSubmit.safeParse(tutor).success);
  assert.equal(onboardingSubmit.safeParse({ ...tutor, bio: 'short' }).success, false);
  assert.equal(onboardingSubmit.safeParse({ ...tutor, credentials: [{ title: 'x', url: 'http://plain.example' }] }).success, false, 'https only');
  const d = onboardingDraft.parse({ path: 'learner', step: 'about', data: { name: 'K', dob: '2012-01-01', gender: 'male', phone: '+256700000000', guardian_email: 'p@x.ug' } });
  assert.deepEqual(Object.keys(stripForMinor(d).data ?? {}).sort(), ['dob', 'guardian_email', 'name']);
});
