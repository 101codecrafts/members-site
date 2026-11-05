/**
 * Provider registry. The DB table public.payment_providers decides which adapter is ENABLED and in what order
 * (admin-editable); this registry only knows which code exists. Selecting an adapter never trusts the client:
 * the service picks the provider for the requested METHOD from the enabled list.
 */
import { PaymentError, type PaymentAdapter, type PaymentMethod, type ProviderCode } from './types.ts';
import { flutterwaveAdapter } from './adapters/flutterwave.ts';
import { pesapalAdapter } from './adapters/pesapal.ts';
import { dpoAdapter } from './adapters/dpo.ts';
import { airtelMoneyAdapter, mtnMomoAdapter, paywayAdapter } from './adapters/slots.ts';

export * from './types.ts';
export { assertSandboxMode, isFlutterwaveTestKey, SANDBOX_HOSTS } from './sandbox.ts';

export const ADAPTERS: Readonly<Record<ProviderCode, PaymentAdapter>> = {
  flutterwave: flutterwaveAdapter,
  pesapal: pesapalAdapter,
  dpo: dpoAdapter,
  mtn_momo: mtnMomoAdapter,
  airtel_money: airtelMoneyAdapter,
  payway: paywayAdapter,
};

export function getAdapter(code: string): PaymentAdapter {
  const a = (ADAPTERS as Record<string, PaymentAdapter>)[code];
  if (!a) throw new PaymentError('not_implemented', `Unknown payment provider ${code}`);
  return a;
}

export interface EnabledProvider { code: string; enabled: boolean; sort: number; methods: string[] }

/** First enabled, ACTIVE adapter (by admin sort order) that takes this method. Stubs/slots are never auto-picked. */
export function pickAdapter(method: PaymentMethod, enabled: readonly EnabledProvider[]): PaymentAdapter {
  const list = [...enabled].filter((p) => p.enabled).sort((a, b) => a.sort - b.sort);
  for (const p of list) {
    const a = (ADAPTERS as Record<string, PaymentAdapter>)[p.code];
    if (a && a.status === 'active' && a.methods.includes(method) && (p.methods.length === 0 || p.methods.includes(method))) return a;
  }
  throw new PaymentError('unsupported_method', `No payment provider is enabled for ${method}`);
}

/** Public, secret-free description for GET /api/v1/payments/providers and the checkout UI. */
export function describeProviders(enabled: readonly EnabledProvider[]) {
  const on = new Map(enabled.map((p) => [p.code, p]));
  return (Object.values(ADAPTERS) as PaymentAdapter[]).map((a) => ({
    code: a.code, name: a.displayName, status: a.status, methods: a.methods,
    enabled: !!on.get(a.code)?.enabled && a.status === 'active', sort: on.get(a.code)?.sort ?? 99, mode: 'sandbox' as const,
  })).sort((x, y) => x.sort - y.sort);
}
