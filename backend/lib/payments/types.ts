/**
 * Payment provider abstraction (round 11). Pure module: no Next/Supabase imports, so it unit-tests with
 * `node --test --experimental-strip-types`. The service layer (services/billing.ts) supplies env + fetch.
 *
 * Invariants every adapter keeps:
 *  - SR-17: the amount comes from the DATABASE (create_checkout / create_plan_checkout), never the client.
 *  - SR-16: an adapter never fulfils; it only opens a checkout and verifies. Fulfilment is the verified
 *           webhook / verify call → apply_flutterwave_payment / apply_provider_payment (service role).
 *  - Sandbox only this round: assertSandbox() refuses live keys/URLs before any network call.
 */
export const METHODS = ['mtn_momo', 'airtel_money', 'card', 'bank', 'wallet'] as const;
export type PaymentMethod = (typeof METHODS)[number];

export const PROVIDERS = ['flutterwave', 'pesapal', 'dpo', 'mtn_momo', 'airtel_money', 'payway'] as const;
export type ProviderCode = (typeof PROVIDERS)[number];

/** active = wired + tested in sandbox · stub = code path written, untested, off by default · planned = slot only */
export type AdapterStatus = 'active' | 'stub' | 'planned';

export interface Customer { email: string; name?: string; phone?: string }

export interface CheckoutRequest {
  txRef: string;            // from the DB row (unique, server-generated)
  amountUgx: number;        // from the DB row — NEVER from the request body
  method: PaymentMethod;
  customer: Customer;
  title: string;
  description: string;
  redirectUrl: string;
  meta?: Record<string, string>;
}

export interface CheckoutResult {
  kind: 'redirect' | 'push';  // redirect: open url (hosted page) · push: USSD/STK prompt sent to the phone
  url?: string;
  providerRef?: string;
  instructions?: string;
  sandbox: true;              // this build can only ever return sandbox checkouts
}

export type VerifiedStatus = 'successful' | 'failed' | 'pending' | 'cancelled';
export interface VerifyResult {
  status: VerifiedStatus;
  txRef: string;
  providerTxnId: string;
  amount: number;
  currency: string;
  method?: string;
}

export interface PaymentEnv {
  PAYMENTS_MODE?: string;               // 'sandbox' (default). 'live' is refused by this build.
  APP_URL?: string;
  FLW_SECRET_KEY?: string;
  PESAPAL_CONSUMER_KEY?: string; PESAPAL_CONSUMER_SECRET?: string; PESAPAL_IPN_ID?: string;
  DPO_COMPANY_TOKEN?: string; DPO_SERVICE_TYPE?: string; DPO_SANDBOX?: string;
  MTN_MOMO_SUBSCRIPTION_KEY?: string; MTN_MOMO_API_USER?: string; MTN_MOMO_API_KEY?: string;
  AIRTEL_CLIENT_ID?: string; AIRTEL_CLIENT_SECRET?: string;
}

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface AdapterDeps { env: PaymentEnv; fetch: FetchLike }

export interface PaymentAdapter {
  readonly code: ProviderCode;
  readonly displayName: string;
  readonly methods: readonly PaymentMethod[];
  readonly status: AdapterStatus;
  /** Throws PaymentError('live_refused' | 'not_configured') when the environment is not a sandbox. */
  assertSandbox(env: PaymentEnv): void;
  createCheckout(req: CheckoutRequest, deps: AdapterDeps): Promise<CheckoutResult>;
  verify(txRef: string, deps: AdapterDeps): Promise<VerifyResult>;
}

export type PaymentErrorCode = 'live_refused' | 'not_configured' | 'not_implemented' | 'unsupported_method' | 'upstream' | 'bad_amount';
export class PaymentError extends Error {
  readonly code: PaymentErrorCode;
  constructor(code: PaymentErrorCode, message: string) { super(message); this.code = code; this.name = 'PaymentError'; }
}

/** Ugandan MSISDN → 2567XXXXXXXX. Throws on anything else. */
export function normaliseUgPhone(input: string): string {
  const d = input.replace(/[\s-]/g, '');
  const m = /^(?:\+?256|0)(7\d{8})$/.exec(d);
  if (!m) throw new PaymentError('unsupported_method', 'Use a Ugandan mobile number like 07XX XXX XXX');
  return '256' + m[1];
}

/** Uganda mobile prefixes: MTN 076/077/078, Airtel 070/074/075. Only used to WARN about a mismatched network; never blocks. */
export function networkOf(msisdn: string): 'MTN' | 'AIRTEL' | null {
  const p = normaliseUgPhone(msisdn).slice(3, 5);
  if (['76', '77', '78'].includes(p)) return 'MTN';
  if (['70', '74', '75'].includes(p)) return 'AIRTEL';
  return null;
}

export function assertAmount(amountUgx: number): void {
  if (!Number.isSafeInteger(amountUgx) || amountUgx < 500 || amountUgx > 10_000_000) throw new PaymentError('bad_amount', 'Amount out of range');
}
