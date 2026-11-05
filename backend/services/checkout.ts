import 'server-only';
import type { z } from 'zod';
import type { Session } from '@/lib/auth';
import type { checkoutBody } from '@/lib/validation';
import { rpc } from '@/repositories/rpc';
import { serviceClient } from '@/lib/supabase/admin';
import { flutterwave, type Subaccount } from '@/lib/flutterwave';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { rateLimit, LIMITS } from '@/lib/ratelimit';
import { assertFlutterwaveSandbox } from '@/services/billing';

interface CheckoutRow {
  payment_id: string; tx_ref: string; amount_ugx: number; list_price_ugx: number; discount_ugx: number; description: string;
  purpose: string; reference_id: string | null; free: boolean; payment_plan: number | null; subaccounts: Subaccount[];
}

/**
 * ONE checkout for every product (courses, subscriptions, tickets, orders,
 * sessions, donations). The DB function computes price, coupon, commission
 * and split from server data (SR-17); this service only opens Flutterwave's
 * hosted checkout with THOSE values. Fulfilment happens exclusively in the
 * verified webhook — never from the client redirect.
 */
export async function createCheckout(s: Session, input: z.infer<typeof checkoutBody>) {
  await rateLimit(LIMITS.checkout, s.userId);
  assertFlutterwaveSandbox();   // r11: sandbox-only build — refuse live keys before anything is created
  if (input.purpose === 'course' && input.reference_id) {   // r11: tutor capacity / guest rules, readable before paying
    const { data: v } = await (s.db.rpc as unknown as (n: string, a: object) => Promise<{ data: { ok?: boolean; reason?: string } | null }>)('can_enroll', { p_course: input.reference_id });
    if (v && v.ok === false && v.reason !== 'plan_limit') {
      throw new AppError(v.reason === 'tutor_full' ? 'unprocessable' : 'forbidden', v.reason === 'tutor_full' ? 'This tutor has no free student places on their plan right now' : 'Become a learner to buy courses', v);
    }
  }
  const row = (await rpc(s.db, 'create_checkout', {
    p_purpose: input.purpose, p_reference_id: input.reference_id, p_coupon_code: input.coupon_code,
    p_quantity: input.quantity, p_note: input.note, p_amount_ugx: input.amount_ugx,
  })) as unknown as CheckoutRow;

  if (row.free) return { status: 'fulfilled' as const, payment_id: row.payment_id, tx_ref: row.tx_ref, amount_ugx: 0 };

  const e = env();
  const contact = (await s.db.from('profile_private').select('email, phone').eq('user_id', s.userId).maybeSingle()).data;
  if (!contact?.email) throw new AppError('unprocessable', 'Add an email address to your account before paying');
  const profile = (await s.db.from('profiles').select('display_name').eq('id', s.userId).maybeSingle()).data;

  const link = await flutterwave(e.FLW_SECRET_KEY).initPayment({
    tx_ref: row.tx_ref,
    amount: row.amount_ugx,
    customer: { email: contact.email, name: profile?.display_name || undefined, phonenumber: contact.phone ?? undefined },
    redirect_url: `${e.APP_URL}/api/v1/payments/return`,
    title: '101 Codecrafts',
    description: row.description,
    payment_plan: row.payment_plan,
    subaccounts: row.subaccounts,
    meta: { payment_id: row.payment_id, purpose: row.purpose },
  });
  await rpc(serviceClient(), 'set_payment_checkout_link', { p_tx_ref: row.tx_ref, p_link: link });
  return { status: 'pending' as const, payment_id: row.payment_id, tx_ref: row.tx_ref, amount_ugx: row.amount_ugx, checkout_url: link };
}

/** Marketplace v2: server-priced multi-vendor cart checkout -> Flutterwave hosted link (funds held in escrow). */
export async function createMarketplaceCheckout(s: Session, shipping: Record<string, unknown>, coupon?: string) {
  await rateLimit(LIMITS.checkout, s.userId);
  assertFlutterwaveSandbox();
  const row = (await rpc(s.db, 'mkt_checkout', { p_shipping: shipping as never, p_coupon: coupon })) as unknown as CheckoutRow & { group_id: string };
  if (row.free) return { status: 'fulfilled' as const, payment_id: row.payment_id, tx_ref: row.tx_ref, amount_ugx: 0, group_id: row.group_id };
  const e = env();
  const contact = (await s.db.from('profile_private').select('email, phone').eq('user_id', s.userId).maybeSingle()).data;
  if (!contact?.email) throw new AppError('unprocessable', 'Add an email address to your account before paying');
  const link = await flutterwave(e.FLW_SECRET_KEY).initPayment({
    tx_ref: row.tx_ref, amount: row.amount_ugx, customer: { email: contact.email, phonenumber: contact.phone ?? undefined },
    redirect_url: `${e.APP_URL}/api/v1/payments/return`, title: '101 Codecrafts Marketplace', description: row.description,
    payment_plan: null, subaccounts: [], meta: { payment_id: row.payment_id, purpose: 'marketplace_order' },
  });
  await rpc(serviceClient(), 'set_payment_checkout_link', { p_tx_ref: row.tx_ref, p_link: link });
  return { status: 'pending' as const, payment_id: row.payment_id, tx_ref: row.tx_ref, amount_ugx: row.amount_ugx, checkout_url: link, group_id: row.group_id };
}
