import { PaymentError, assertAmount, type AdapterDeps, type CheckoutRequest, type CheckoutResult, type PaymentAdapter, type PaymentEnv, type VerifyResult } from '../types.ts';
import { assertSandboxMode, SANDBOX_HOSTS } from '../sandbox.ts';

/**
 * Pesapal API 3.0 (JSON) — STUB alternate: RequestToken → SubmitOrderRequest (hosted page, MoMo + cards) →
 * GetTransactionStatus. Base URL is hard-wired to the demo host cybqa.pesapal.com, so this adapter cannot
 * reach production. Needs PESAPAL_CONSUMER_KEY/SECRET (demo credentials) + PESAPAL_IPN_ID (RegisterIPN once).
 * Untested against the live sandbox this round (no demo credentials in the vault).
 * Docs: developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/*
 */
const BASE = SANDBOX_HOSTS.pesapal;

async function token(deps: AdapterDeps): Promise<string> {
  const r = await deps.fetch(`${BASE}/api/Auth/RequestToken`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ consumer_key: deps.env.PESAPAL_CONSUMER_KEY, consumer_secret: deps.env.PESAPAL_CONSUMER_SECRET }) });
  const j = (await r.json().catch(() => ({}))) as { token?: string; error?: { message?: string } };
  if (!r.ok || !j.token) throw new PaymentError('upstream', `Pesapal auth failed: ${j.error?.message ?? r.status}`);
  return j.token;
}

export const pesapalAdapter: PaymentAdapter = {
  code: 'pesapal',
  displayName: 'Pesapal',
  methods: ['mtn_momo', 'airtel_money', 'card'],
  status: 'stub',
  assertSandbox(env: PaymentEnv) {
    assertSandboxMode(env);
    if (!env.PESAPAL_CONSUMER_KEY || !env.PESAPAL_CONSUMER_SECRET || !env.PESAPAL_IPN_ID) throw new PaymentError('not_configured', 'Pesapal demo credentials are not configured');
  },
  async createCheckout(req: CheckoutRequest, deps: AdapterDeps): Promise<CheckoutResult> {
    this.assertSandbox(deps.env); assertAmount(req.amountUgx);
    const t = await token(deps);
    const r = await deps.fetch(`${BASE}/api/Transactions/SubmitOrderRequest`, {
      method: 'POST', headers: { authorization: `Bearer ${t}`, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ id: req.txRef, currency: 'UGX', amount: req.amountUgx, description: req.description.slice(0, 100),
        callback_url: req.redirectUrl, notification_id: deps.env.PESAPAL_IPN_ID,
        billing_address: { email_address: req.customer.email, phone_number: req.customer.phone ?? '', country_code: 'UG', first_name: req.customer.name ?? '' } }),
    });
    const j = (await r.json().catch(() => ({}))) as { redirect_url?: string; order_tracking_id?: string; error?: { message?: string } };
    if (!r.ok || !j.redirect_url) throw new PaymentError('upstream', `Pesapal: ${j.error?.message ?? r.status}`);
    return { kind: 'redirect', url: j.redirect_url, providerRef: j.order_tracking_id, sandbox: true };
  },
  async verify(_txRef: string, deps: AdapterDeps): Promise<VerifyResult> {
    this.assertSandbox(deps.env);
    // GetTransactionStatus needs the order_tracking_id stored at checkout (payments.provider_ref). Wire when enabled.
    throw new PaymentError('not_implemented', 'Pesapal verify: pass order_tracking_id (stub)');
  },
};
