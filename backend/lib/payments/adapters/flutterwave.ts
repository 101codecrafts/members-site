import { PaymentError, assertAmount, normaliseUgPhone, type AdapterDeps, type CheckoutRequest, type CheckoutResult, type PaymentAdapter, type PaymentEnv, type VerifyResult } from '../types.ts';
import { assertSandboxMode, isFlutterwaveTestKey, SANDBOX_HOSTS } from '../sandbox.ts';

/**
 * Flutterwave v3 hosted checkout — the DEFAULT adapter (MTN + Airtel Mobile Money Uganda, Visa/Mastercard).
 * Test mode: any MoMo number + OTP 123456; Flutterwave test cards. Collections are not settled in test mode.
 * Docs: developer.flutterwave.com/docs/uganda · /docs/testing.
 */
const BASE = SANDBOX_HOSTS.flutterwave;
const OPTIONS: Record<string, string> = { mtn_momo: 'mobilemoneyuganda', airtel_money: 'mobilemoneyuganda', card: 'card' };

interface Envelope<T> { status?: string; message?: string; data?: T }

async function call<T>(deps: AdapterDeps, path: string, init: { method?: string; body?: unknown; idem?: string } = {}): Promise<T> {
  const res = await deps.fetch(`${BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: { authorization: `Bearer ${deps.env.FLW_SECRET_KEY}`, 'content-type': 'application/json', ...(init.idem ? { 'x-idempotency-key': init.idem } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || json.status !== 'success' || !json.data) throw new PaymentError('upstream', `Flutterwave: ${json.message ?? res.status}`);
  return json.data;
}

export const flutterwaveAdapter: PaymentAdapter = {
  code: 'flutterwave',
  displayName: 'Flutterwave',
  methods: ['mtn_momo', 'airtel_money', 'card'],
  status: 'active',
  assertSandbox(env: PaymentEnv) {
    assertSandboxMode(env);
    if (!env.FLW_SECRET_KEY) throw new PaymentError('not_configured', 'Flutterwave is not configured');
    if (!isFlutterwaveTestKey(env.FLW_SECRET_KEY)) throw new PaymentError('live_refused', 'Refusing a live Flutterwave key: sandbox (FLWSECK_TEST-) keys only');
  },
  async createCheckout(req: CheckoutRequest, deps: AdapterDeps): Promise<CheckoutResult> {
    this.assertSandbox(deps.env);
    assertAmount(req.amountUgx);
    const opt = OPTIONS[req.method];
    if (!opt) throw new PaymentError('unsupported_method', `Flutterwave does not take ${req.method} here`);
    const phone = req.customer.phone ? normaliseUgPhone(req.customer.phone) : undefined;
    const data = await call<{ link: string }>(deps, '/payments', {
      method: 'POST', idem: req.txRef,
      body: {
        tx_ref: req.txRef, amount: req.amountUgx, currency: 'UGX', redirect_url: req.redirectUrl,
        payment_options: opt, customer: { email: req.customer.email, name: req.customer.name, phonenumber: phone },
        meta: { ...req.meta, method: req.method },
        customizations: { title: req.title, description: req.description.slice(0, 120) },
      },
    });
    return { kind: 'redirect', url: data.link, providerRef: req.txRef, sandbox: true };
  },
  async verify(txRef: string, deps: AdapterDeps): Promise<VerifyResult> {
    this.assertSandbox(deps.env);
    const v = await call<{ id: number; tx_ref: string; status: string; amount: number; currency: string; payment_type: string }>(
      deps, `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
    const status = v.status === 'successful' ? 'successful' : v.status === 'failed' ? 'failed' : v.status === 'cancelled' ? 'cancelled' : 'pending';
    return { status, txRef: v.tx_ref, providerTxnId: String(v.id), amount: v.amount, currency: v.currency, method: v.payment_type };
  },
};
