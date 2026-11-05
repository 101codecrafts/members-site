import { PaymentError, type PaymentEnv } from './types.ts';

/** Global switch: this build only runs payments in sandbox mode. */
export function assertSandboxMode(env: PaymentEnv): void {
  const mode = (env.PAYMENTS_MODE ?? 'sandbox').toLowerCase();
  if (mode !== 'sandbox') throw new PaymentError('live_refused', 'Live payments are disabled in this build (PAYMENTS_MODE must be "sandbox")');
}

/** Flutterwave test secret keys start FLWSECK_TEST-; live ones FLWSECK-. */
export function isFlutterwaveTestKey(k: string | undefined): boolean { return !!k && /^FLWSECK_TEST-/.test(k); }

/** Fixed sandbox hosts per provider. Adapters may ONLY call these. */
export const SANDBOX_HOSTS = {
  flutterwave: 'https://api.flutterwave.com/v3',            // same host for test + live; the key decides → test key required
  pesapal: 'https://cybqa.pesapal.com/pesapalv3',
  dpo: 'https://secure.3gdirectpay.com/API/v6/',             // same host for test + live; the company token decides → explicit DPO_SANDBOX=true
  mtn_momo: 'https://sandbox.momodeveloper.mtn.com',
  airtel_money: 'https://openapiuat.airtel.africa',
} as const;
