// Round 11 admin console: request bodies reject anything a client could use to escalate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteBody, manageBody, decideBody, adminPatchBody, submitBody, pricingBody, reviewId, planBody } from '../lib/admin-validation.ts';

test('invites: real scopes only, email normalised, no extra keys (no role injection)', () => {
  assert.deepEqual(inviteBody.parse({ email: ' New.Admin@Example.com ', scopes: ['approvals'] }), { email: 'new.admin@example.com', scopes: ['approvals'] });
  assert.throws(() => inviteBody.parse({ email: 'a@b.co', scopes: ['root'] }));
  assert.throws(() => inviteBody.parse({ email: 'a@b.co', scopes: [] }));
  assert.throws(() => inviteBody.parse({ email: 'a@b.co', scopes: ['users'], role: 'root_admin' }));
});

test('people actions: admins/root can never be granted here; plan + status need a reason', () => {
  assert.throws(() => manageBody.parse({ action: 'role', role: 'admin', grant: true }));
  assert.throws(() => manageBody.parse({ action: 'role', role: 'super_admin', grant: true }));
  assert.throws(() => manageBody.parse({ action: 'plan', audience: 'learner', plan: 'pro' }));
  assert.ok(manageBody.parse({ action: 'plan', audience: 'tutor', plan: 'plus', reason: 'pilot' }));
  assert.ok(manageBody.parse({ action: 'status', status: 'suspended', reason: 'spam links' }));
});

test('decisions + admin patch + ids', () => {
  assert.ok(decideBody.parse({ decision: 'request_changes', reason: 'Fix the title', fixes: ['shorter title'] }));
  assert.throws(() => decideBody.parse({ decision: 'publish' }));
  assert.throws(() => adminPatchBody.parse({ scopes: ['users'], status: 'active' }));
  assert.ok(reviewId.parse('price:0b0f1c2d-1111-2222-3333-444455556666'));
  assert.throws(() => reviewId.parse('1; drop table'));
});

test('submissions: only reviewable kinds, http(s) URLs, capped', () => {
  assert.ok(submitBody.parse({ kind: 'video', entity_ref: 'v1', title: 'My video', urls: ['https://youtu.be/dQw4w9WgXcQ'] }));
  assert.throws(() => submitBody.parse({ kind: 'admin', entity_ref: 'x', title: 'xx' }));
  assert.throws(() => submitBody.parse({ kind: 'link', entity_ref: 'x', title: 'xx', urls: Array(51).fill('https://a.co') }));
});

test('pricing + plan edits', () => {
  assert.throws(() => pricingBody.parse({ is_free: false, price_ugx: 500 }));
  assert.deepEqual(pricingBody.parse({ is_free: true }), { is_free: true, price_ugx: 0 });
  assert.ok(planBody.parse({ limits: { 'students.max': 2, 'courses.active': null, 'lessons.preview_only': true }, monthly_ugx: 15000 }));
  assert.throws(() => planBody.parse({ monthly_ugx: 10 }));
  assert.throws(() => planBody.parse({ limits: { 'x': 'lots' } }));
});
