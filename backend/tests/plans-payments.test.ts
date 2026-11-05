import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accessRole, can, why, limit, minPlanFor, underLimit } from '../lib/access.ts';
import { ADAPTERS, getAdapter, pickAdapter, describeProviders, normaliseUgPhone, networkOf, PaymentError, type FetchLike, type PaymentEnv } from '../lib/payments/index.ts';
import { planCheckoutBody, adminPlanBody, priceRequestBody } from '../lib/plans-validation.ts';

const policy = JSON.parse(readFileSync(new URL('../data/access-policy.json', import.meta.url), 'utf8'));
const TEST_ENV: PaymentEnv = { PAYMENTS_MODE: 'sandbox', FLW_SECRET_KEY: 'FLWSECK_TEST-abc123-X', APP_URL: 'https://example.test' };
const req = { txRef: 'sub-abc12345', amountUgx: 15000, method: 'mtn_momo' as const, customer: { email: 'a@b.co', phone: '0772123456' }, title: '101', description: 'Standard', redirectUrl: 'https://example.test/r' };

function fakeFetch(reply: unknown, sink: { url?: string; body?: unknown }[] = []): FetchLike {
  return async (url, init) => { sink.push({ url, body: init?.body ? JSON.parse(init.body) : undefined }); return { ok: true, status: 200, json: async () => reply, text: async () => JSON.stringify(reply) }; };
}

// ------------------------------------------------------------------ access ----
test('access: founder rules — visitors sign in, guests buy only, learners sell, staff bypass plans', () => {
  assert.equal(why('market.buy', { role: 'visitor' }), 'signin');
  assert.ok(can('market.buy', { role: 'guest' }));
  assert.equal(why('market.sell', { role: 'guest' }), 'role');
  assert.ok(can('market.sell', { role: 'learner' }) && can('market.sell', { role: 'tutor' }));
  assert.equal(why('market.sell', { role: 'learner', minor: true }), 'minor');
  assert.ok(can('course.take_external', { role: 'guest' }), 'external courses free for guests');
  assert.equal(why('course.enroll', { role: 'guest' }), 'role', 'guests cannot take 101 tutor courses');
  assert.equal(why('lesson.view_locked', { role: 'learner', plan: 'free' }), 'plan');
  assert.ok(can('lesson.view_locked', { role: 'learner', plan: 'standard' }));
  assert.ok(can('lesson.view_locked', { role: 'admin', plan: 'free' }), 'staff bypass plans');
  assert.equal(why('rating.create', { role: 'guest' }), 'role');
  assert.equal(why('payment.provider_manage', { role: 'admin' }), 'role', 'root only');
  assert.equal(why('no.such.key', { role: 'root_admin' }), 'role', 'unknown actions fail closed');
  assert.equal(minPlanFor('lesson.view_locked'), 'standard');
});
test('access: DB roles map to round-11 roles; root only via super_admin', () => {
  assert.equal(accessRole(false), 'visitor');
  assert.equal(accessRole(true, []), 'guest');
  assert.equal(accessRole(true, ['guest']), 'guest');
  assert.equal(accessRole(true, ['learner']), 'learner');
  assert.equal(accessRole(true, ['learner', 'tutor']), 'tutor');
  assert.equal(accessRole(true, ['admin']), 'admin');
  assert.equal(accessRole(true, ['admin', 'super_admin']), 'root_admin');
});
test('access: limits — founder anchors, null = unlimited, unknown key = 0, staff unlimited, DB overrides win', () => {
  assert.equal(limit('tutor', 'free', 'students.max'), 2);
  assert.equal(limit('learner', 'free', 'courses.active'), 1);
  assert.equal(limit('learner', 'pro', 'courses.active'), null);
  assert.equal(limit('learner', 'free', 'nope'), 0);
  assert.equal(limit('admin', 'free', 'students.max'), null);
  assert.equal(limit('tutor', 'free', 'students.max', { 'students.max': 5 }), 5);
  assert.ok(underLimit(null, 99)); assert.ok(!underLimit(2, 2)); assert.ok(underLimit(2, 1));
});
test('access: policy shape matches the owner format (roles, plans, staff, actions with roles arrays)', () => {
  assert.deepEqual(policy.roles, ['visitor', 'guest', 'learner', 'tutor', 'admin', 'root_admin']);
  assert.deepEqual(policy.plans, ['free', 'standard', 'plus', 'pro']);
  for (const [k, v] of Object.entries(policy.actions) as [string, { roles: string[]; plans?: string[] }][]) {
    assert.match(k, /^[a-z_]+\.[a-z_]+$/, k);
    assert.ok(Array.isArray(v.roles) && v.roles.every((r) => policy.roles.includes(r)), k);
    if (v.plans) assert.ok(v.plans.every((p) => policy.plans.includes(p)), k);
  }
  for (const k of ['course.enroll', 'lesson.view_locked', 'market.sell', 'market.buy', 'rating.create', 'session.book']) assert.ok(policy.actions[k], k);
});

// ---------------------------------------------------------------- payments ----
test('payments: sandbox only — live mode and live Flutterwave keys are refused before any network call', async () => {
  const sink: { url?: string }[] = [];
  const f = fakeFetch({ status: 'success', data: { link: 'x' } }, sink);
  await assert.rejects(ADAPTERS.flutterwave.createCheckout(req, { env: { ...TEST_ENV, PAYMENTS_MODE: 'live' }, fetch: f }), (e: PaymentError) => e.code === 'live_refused');
  await assert.rejects(ADAPTERS.flutterwave.createCheckout(req, { env: { ...TEST_ENV, FLW_SECRET_KEY: 'FLWSECK-live-123-X' }, fetch: f }), (e: PaymentError) => e.code === 'live_refused');
  await assert.rejects(ADAPTERS.flutterwave.createCheckout(req, { env: { PAYMENTS_MODE: 'sandbox' }, fetch: f }), (e: PaymentError) => e.code === 'not_configured');
  assert.equal(sink.length, 0, 'no request ever left');
  await assert.rejects(ADAPTERS.dpo.createCheckout(req, { env: { ...TEST_ENV, DPO_COMPANY_TOKEN: 't', DPO_SERVICE_TYPE: '1' }, fetch: f }), (e: PaymentError) => e.code === 'live_refused', 'DPO needs DPO_SANDBOX=true');
  await assert.rejects(ADAPTERS.payway.createCheckout(req, { env: TEST_ENV, fetch: f }), (e: PaymentError) => e.code === 'not_implemented');
  await assert.rejects(ADAPTERS.mtn_momo.createCheckout(req, { env: TEST_ENV, fetch: f }), (e: PaymentError) => e.code === 'not_implemented');
});
test('payments: Flutterwave sends the DB amount, UGX, the method-specific option and a normalised MSISDN', async () => {
  const sink: { url?: string; body?: Record<string, unknown> }[] = [];
  const r = await ADAPTERS.flutterwave.createCheckout(req, { env: TEST_ENV, fetch: fakeFetch({ status: 'success', data: { link: 'https://checkout-testing.flutterwave.com/v3/hosted/pay/x' } }, sink as never) });
  assert.equal(r.kind, 'redirect'); assert.equal(r.sandbox, true);
  const b = sink[0]!.body as Record<string, unknown> & { customer: Record<string, string> };
  assert.equal(sink[0]!.url, 'https://api.flutterwave.com/v3/payments');
  assert.equal(b.amount, 15000); assert.equal(b.currency, 'UGX'); assert.equal(b.tx_ref, 'sub-abc12345');
  assert.equal(b.payment_options, 'mobilemoneyuganda'); assert.equal(b.customer.phonenumber, '256772123456');
  const sink2: { body?: Record<string, unknown> }[] = [];
  await ADAPTERS.flutterwave.createCheckout({ ...req, method: 'card' }, { env: TEST_ENV, fetch: fakeFetch({ status: 'success', data: { link: 'l' } }, sink2 as never) });
  assert.equal(sink2[0]!.body!.payment_options, 'card');
  await assert.rejects(ADAPTERS.flutterwave.createCheckout({ ...req, amountUgx: 10 }, { env: TEST_ENV, fetch: fakeFetch({}) }), (e: PaymentError) => e.code === 'bad_amount');
});
test('payments: verify maps provider statuses; upstream errors surface as PaymentError', async () => {
  const v = await ADAPTERS.flutterwave.verify('sub-abc12345', { env: TEST_ENV, fetch: fakeFetch({ status: 'success', data: { id: 77, tx_ref: 'sub-abc12345', status: 'successful', amount: 15000, currency: 'UGX', payment_type: 'mobilemoneyuganda' } }) });
  assert.deepEqual([v.status, v.providerTxnId, v.amount], ['successful', '77', 15000]);
  await assert.rejects(ADAPTERS.flutterwave.verify('x', { env: TEST_ENV, fetch: fakeFetch({ status: 'error', message: 'nope' }) }), (e: PaymentError) => e.code === 'upstream');
});
test('payments: the registry picks only ENABLED + ACTIVE adapters (stubs/slots never), by admin sort', () => {
  const all = Object.keys(ADAPTERS).map((code, i) => ({ code, enabled: true, sort: i, methods: [] as string[] }));
  assert.equal(pickAdapter('mtn_momo', all).code, 'flutterwave');
  assert.throws(() => pickAdapter('card', all.map((p) => ({ ...p, enabled: p.code !== 'flutterwave' }))), (e: PaymentError) => e.code === 'unsupported_method');
  assert.throws(() => getAdapter('stripe'), PaymentError);
  const d = describeProviders([{ code: 'flutterwave', enabled: true, sort: 10, methods: [] }, { code: 'payway', enabled: true, sort: 5, methods: [] }]);
  assert.equal(d.find((p) => p.code === 'payway')!.enabled, false, 'a planned slot never shows as enabled');
  assert.ok(d.every((p) => p.mode === 'sandbox'));
});
test('payments: Uganda phone helpers', () => {
  assert.equal(normaliseUgPhone('+256 772 123 456'), '256772123456');
  assert.equal(normaliseUgPhone('0752123456'), '256752123456');
  assert.throws(() => normaliseUgPhone('0412123456'));
  assert.equal(networkOf('0772123456'), 'MTN'); assert.equal(networkOf('0702123456'), 'AIRTEL');
});

// -------------------------------------------------------------- validation ----
test('validation: plan checkout has NO amount (SR-17) — unknown keys like amount_ugx are rejected', () => {
  assert.ok(planCheckoutBody.safeParse({ audience: 'learner', tier: 'standard', interval: 'monthly', method: 'card' }).success);
  assert.ok(!planCheckoutBody.safeParse({ audience: 'learner', tier: 'standard', interval: 'monthly', method: 'card', amount_ugx: 1 }).success);
  assert.ok(!planCheckoutBody.safeParse({ audience: 'learner', tier: 'free', interval: 'monthly', method: 'card' }).success, 'free needs no checkout');
  assert.ok(!planCheckoutBody.safeParse({ audience: 'learner', tier: 'plus', interval: 'monthly', method: 'mtn_momo' }).success, 'MoMo needs a phone');
  assert.ok(planCheckoutBody.safeParse({ audience: 'tutor', tier: 'pro', interval: 'yearly', method: 'airtel_money', phone: '0752123456' }).success);
  assert.ok(adminPlanBody.safeParse({ limits: { 'students.max': 3, 'courses.active': null, certificates: true } }).success);
  assert.ok(!adminPlanBody.safeParse({ limits: { 'Bad Key': 1 } }).success);
  assert.ok(!priceRequestBody.safeParse({ make_free: false }).success);
  assert.ok(priceRequestBody.safeParse({ make_free: true }).success);
});
