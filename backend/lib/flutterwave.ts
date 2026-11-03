import 'server-only';
import { AppError } from '@/lib/errors';
import { hmacSha256, safeEqual } from '@/lib/crypto';

/**
 * Minimal typed Flutterwave v3 client (UGX). Docs: https://developer.flutterwave.com/docs
 * Never trust webhook bodies: always re-verify with /transactions/:id/verify.
 */
const BASE = 'https://api.flutterwave.com/v3';

interface FlwEnvelope<T> { status: 'success' | 'error'; message: string; data: T }

async function call<T>(secret: string, path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', ...(init.idempotencyKey ? { 'x-idempotency-key': init.idempotencyKey } : {}) },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as FlwEnvelope<T>;
  if (!res.ok || json.status !== 'success') throw new AppError('upstream_error', `Flutterwave: ${json.message ?? res.statusText}`);
  return json.data;
}

export interface Subaccount { id: string; transaction_charge_type: 'flat_subaccount'; transaction_charge: number }
export interface InitPaymentInput {
  tx_ref: string; amount: number; customer: { email: string; name?: string; phonenumber?: string };
  redirect_url: string; title: string; description: string; payment_plan?: number | null; subaccounts?: Subaccount[];
  meta?: Record<string, string>;
}

export function flutterwave(secret: string | undefined) {
  if (!secret) throw new AppError('upstream_error', 'Payments are not configured');
  return {
    /** Hosted checkout (Mobile Money MTN/Airtel Uganda + cards). Returns the link. */
    async initPayment(i: InitPaymentInput): Promise<string> {
      const data = await call<{ link: string }>(secret, '/payments', {
        method: 'POST', idempotencyKey: i.tx_ref,
        body: JSON.stringify({
          tx_ref: i.tx_ref, amount: i.amount, currency: 'UGX', redirect_url: i.redirect_url,
          payment_options: 'mobilemoneyuganda,card', customer: i.customer, meta: i.meta,
          customizations: { title: i.title, description: i.description.slice(0, 120), logo: 'https://101codecrafts.com/assets/logo.png' },
          ...(i.payment_plan ? { payment_plan: i.payment_plan } : {}),
          ...(i.subaccounts?.length ? { subaccounts: i.subaccounts } : {}),
        }),
      });
      return data.link;
    },
    async verify(id: number) {
      return call<{ id: number; tx_ref: string; status: string; amount: number; charged_amount: number; currency: string; payment_type: string;
        customer: { email: string }; plan?: number | null }>(secret, `/transactions/${id}/verify`);
    },
    async verifyByRef(txRef: string) {
      return call<{ id: number; tx_ref: string; status: string; amount: number; currency: string; payment_type: string }>(secret, `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`);
    },
    async refund(id: number, amount: number) {
      return call<{ id: number; status: string; amount_refunded: number }>(secret, `/transactions/${id}/refund`, { method: 'POST', body: JSON.stringify({ amount }) });
    },
    /** Transfers: mobile money (account_bank 'MPS') or bank. */
    async transfer(t: { reference: string; amount: number; account_bank: string; account_number: string; beneficiary_name: string; narration: string; callback_url?: string }) {
      return call<{ id: number; status: string; reference: string }>(secret, '/transfers', {
        method: 'POST', idempotencyKey: t.reference,
        body: JSON.stringify({ ...t, currency: 'UGX', debit_currency: 'UGX' }),
      });
    },
    async createSubaccount(s: { account_bank: string; account_number: string; business_name: string; business_email: string; business_mobile: string; split_type: 'percentage'; split_value: number }) {
      return call<{ subaccount_id: string }>(secret, '/subaccounts', { method: 'POST', body: JSON.stringify({ ...s, country: 'UG' }) });
    },
    async createPaymentPlan(p: { name: string; amount: number; interval: 'monthly' | 'quarterly' | 'yearly' }) {
      return call<{ id: number }>(secret, '/payment-plans', { method: 'POST', body: JSON.stringify({ ...p, currency: 'UGX' }) });
    },
    async cancelSubscription(id: number) {
      return call<unknown>(secret, `/subscriptions/${id}/cancel`, { method: 'PUT' });
    },
  };
}

/**
 * Webhook signature: legacy `verif-hash` header equals the secret hash set in
 * the dashboard; newer `flutterwave-signature` is base64 HMAC-SHA256 of the
 * raw body with the same secret. Accept either, constant-time.
 */
export function verifyFlutterwaveSignature(headers: Headers, rawBody: string, secretHash: string | undefined): boolean {
  if (!secretHash) return false;
  const hmacSig = headers.get('flutterwave-signature');
  if (hmacSig) return safeEqual(hmacSig, hmacSha256(secretHash, rawBody, 'base64'));
  const legacy = headers.get('verif-hash');
  return !!legacy && safeEqual(legacy, secretHash);
}
