import 'server-only';
import type { z } from 'zod';
import type { Session } from '@/lib/auth';
import type { Db } from '@/lib/supabase/user';
import { rpc, type RpcArgs } from '@/repositories/rpc';
import type { Database } from '@/types/database';
type Fns = Database['public']['Functions'];
import { serviceClient } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { rateLimit, LIMITS } from '@/lib/ratelimit';
import { accessRole, POLICY_VERSION } from '@/lib/access';
import { getAdapter, describeProviders, PaymentError, type FetchLike, type PaymentEnv, type PaymentMethod, type EnabledProvider } from '@/lib/payments/index.ts';
import type { adminCoursePricingBody, adminPlanBody, planCheckoutBody, priceRequestBody, ratingBody } from '@/lib/plans-validation';

/**
 * Round 11: plans, entitlements, plan checkout and pricing approvals.
 * The database owns every rule (RLS + security-definer functions in 20261105001100_plans_access.sql);
 * this service calls them, opens the provider's hosted checkout with the DB-computed amount (SR-17),
 * and never fulfils anything (SR-16: only verified webhooks do).
 */

/** Typed RPC call (names + args checked against types/database.ts, regenerated from staging in round 12); T = the jsonb shape. */
async function call<T, N extends keyof Fns = keyof Fns>(db: Db, name: N, args: RpcArgs<N> = {} as RpcArgs<N>): Promise<T> {
  return (await rpc(db, name, args)) as T;
}

export function paymentEnv(): PaymentEnv {
  const e = env();
  return {
    PAYMENTS_MODE: e.PAYMENTS_MODE, APP_URL: e.APP_URL, FLW_SECRET_KEY: e.FLW_SECRET_KEY,
    PESAPAL_CONSUMER_KEY: e.PESAPAL_CONSUMER_KEY, PESAPAL_CONSUMER_SECRET: e.PESAPAL_CONSUMER_SECRET, PESAPAL_IPN_ID: e.PESAPAL_IPN_ID,
    DPO_COMPANY_TOKEN: e.DPO_COMPANY_TOKEN, DPO_SERVICE_TYPE: e.DPO_SERVICE_TYPE, DPO_SANDBOX: e.DPO_SANDBOX,
    MTN_MOMO_SUBSCRIPTION_KEY: e.MTN_MOMO_SUBSCRIPTION_KEY, MTN_MOMO_API_USER: e.MTN_MOMO_API_USER, MTN_MOMO_API_KEY: e.MTN_MOMO_API_KEY,
    AIRTEL_CLIENT_ID: e.AIRTEL_CLIENT_ID, AIRTEL_CLIENT_SECRET: e.AIRTEL_CLIENT_SECRET,
  };
}
const fetchImpl: FetchLike = (url, init) => fetch(url, { ...init, cache: 'no-store' });

export function paymentError(e: unknown): never {
  if (e instanceof PaymentError) {
    const map = { live_refused: 'forbidden', not_configured: 'upstream_error', not_implemented: 'upstream_error', unsupported_method: 'bad_request', upstream: 'upstream_error', bad_amount: 'unprocessable' } as const;
    throw new AppError(map[e.code], e.message, { payment_error: e.code });
  }
  throw e;
}

/** Refuses live mode / live Flutterwave keys before ANY existing checkout path calls Flutterwave. */
export function assertFlutterwaveSandbox(): void {
  try { getAdapter('flutterwave').assertSandbox(paymentEnv()); } catch (e) { paymentError(e); }
}

async function enabledProviders(): Promise<EnabledProvider[]> {
  const { data, error } = await serviceClient().from('payment_providers').select('code, enabled, sort, methods');
  if (error) throw error;
  return (data ?? []) as unknown as EnabledProvider[];
}

/** Public: plan catalogue (admin-edited prices + limits) and which providers/methods are on. */
export async function getCatalogue() {
  const [catalogue, providers] = await Promise.all([call<Record<string, unknown>>(serviceClient(), 'plans_catalogue'), enabledProviders()]);
  const list = describeProviders(providers);
  const methods = [...new Set(list.filter((p) => p.enabled).flatMap((p) => p.methods))];
  return { ...catalogue, providers: list, methods, mode: 'sandbox' as const, policy_version: POLICY_VERSION };
}
export async function listProviders() { return describeProviders(await enabledProviders()); }

export async function getEntitlements(s: Session) {
  const e = await call<Record<string, unknown>>(s.db, 'my_entitlements');
  const role = accessRole(true, s.roles);
  return { role, plan: role === 'tutor' ? e.tutor_plan : e.learner_plan, ...e };
}

interface PlanCheckoutRow { payment_id: string; tx_ref: string; amount_ugx: number; currency: 'UGX'; provider: string; method: PaymentMethod; mode: 'sandbox';
  subscription_id: string; audience: string; tier: string; interval: string; description: string }

/** POST /api/v1/billing/checkout — the DB prices it; we only open the provider's sandbox checkout with THAT amount. */
export async function createPlanCheckout(s: Session, input: z.infer<typeof planCheckoutBody>) {
  await rateLimit(LIMITS.checkout, s.userId);
  const penv = paymentEnv();
  const row = await call<PlanCheckoutRow>(s.db, 'create_plan_checkout', { p_audience: input.audience, p_tier: input.tier, p_interval: input.interval, p_method: input.method });
  const adapter = getAdapter(row.provider);
  try { adapter.assertSandbox(penv); } catch (e) { paymentError(e); }
  const contact = (await s.db.from('profile_private').select('email, phone').eq('user_id', s.userId).maybeSingle()).data;
  if (!contact?.email) throw new AppError('unprocessable', 'Add an email address to your account before paying');
  const profile = (await s.db.from('profiles').select('display_name').eq('id', s.userId).maybeSingle()).data;
  let result;
  try {
    result = await adapter.createCheckout({
      txRef: row.tx_ref, amountUgx: row.amount_ugx, method: row.method,
      customer: { email: contact.email, name: profile?.display_name || undefined, phone: input.phone ?? contact.phone ?? undefined },
      title: '101 Codecrafts', description: row.description, redirectUrl: `${penv.APP_URL}/api/v1/payments/return`,
      meta: { payment_id: row.payment_id, purpose: 'subscription', audience: row.audience, tier: row.tier },
    }, { env: penv, fetch: fetchImpl });
  } catch (e) { paymentError(e); }
  const svc = serviceClient();
  if (result.url) await call(svc, 'set_payment_checkout_link', { p_tx_ref: row.tx_ref, p_link: result.url });
  if (result.providerRef) await svc.from('payments').update({ provider_ref: result.providerRef }).eq('tx_ref', row.tx_ref);
  return { status: 'pending' as const, tx_ref: row.tx_ref, payment_id: row.payment_id, amount_ugx: row.amount_ugx, currency: 'UGX' as const,
    provider: row.provider, method: row.method, plan: { audience: row.audience, tier: row.tier, interval: row.interval },
    kind: result.kind, checkout_url: result.url ?? null, instructions: result.instructions ?? null, sandbox: true as const };
}

export const syllabus = async (db: Db, slug: string) => {
  const c = (await db.from('courses').select('id, is_free, price_ugx').eq('slug', slug).maybeSingle()).data;
  if (!c) throw new AppError('not_found', 'Course not found');
  const [lessons, can] = await Promise.all([call<unknown[]>(db, 'course_syllabus', { p_course: c.id }), call<Record<string, unknown>>(db, 'can_enroll', { p_course: c.id })]);
  return { course_id: c.id, is_free: c.is_free, price_ugx: c.price_ugx, can_enroll: can, lessons };
};

export const requestCoursePrice = (s: Session, courseId: string, b: z.infer<typeof priceRequestBody>) =>
  call<string>(s.db, 'request_course_price', { p_course: courseId, p_price_ugx: b.make_free ? null : b.price_ugx, p_make_free: b.make_free, p_note: b.note ?? null })
    .then((id) => ({ id, status: 'pending' as const }));
export const decideCoursePrice = (s: Session, id: string, approve: boolean, note?: string) => call(s.db, 'decide_course_price', { p_request: id, p_approve: approve, p_note: note ?? null });
export const priceRequestQueue = async (s: Session, status: Database['public']['Enums']['review_status'] = 'pending') => {
  const { data, error } = await s.db.from('course_price_requests').select('id, course_id, tutor_id, make_free, price_ugx, note, status, created_at, decided_at, decision_note')
    .eq('status', status).order('created_at', { ascending: true }).limit(100);
  if (error) throw error;   // was swallowed into [] (an outage looked like an empty queue)
  return data ?? [];
};
// Admin console routes for these two live on r11/admin-api (PUT /admin/plans/{audience}/{tier}, POST /admin/courses/{id}/pricing,
// with scope checks); they call the same RPCs. Kept here for callers on this branch.
export const setCoursePricing = (s: Session, id: string, b: z.infer<typeof adminCoursePricingBody>) =>
  call(s.db, 'admin_set_course_pricing', { p_course: id, p_is_free: b.is_free, p_price_ugx: b.price_ugx, p_all_lessons_free: b.all_lessons_free ?? null });
export const updatePlan = (s: Session, aud: string, t: Database['public']['Enums']['member_plan'], b: z.infer<typeof adminPlanBody>) =>
  call(s.db, 'admin_update_plan', { p_audience: aud, p_tier: t, p_name: b.name ?? null, p_tagline: b.tagline ?? null, p_limits: b.limits ?? null,
    p_features: b.features ?? null, p_monthly_ugx: b.monthly_ugx ?? null, p_yearly_ugx: b.yearly_ugx ?? null, p_confirm_prices: b.confirm_prices ?? null });
export const setProvider = (s: Session, code: string, enabled: boolean, sort?: number) =>
  call(s.db, 'admin_set_payment_provider', { p_code: code, p_enabled: enabled, p_sort: sort ?? null });
export const recordItemUse = (s: Session, kind: string, id: string) => call(s.db, 'record_item_use', { p_kind: kind, p_item: id }).then(() => ({ ok: true }));

/** Verified-only ratings: the DB triggers/RLS refuse anyone who did not enrol / use the item (42501 → 403). */
export async function createRating(s: Session, b: z.infer<typeof ratingBody>) {
  if (b.kind === 'course') {
    const c = (await s.db.from('courses').select('id, tutor_id').eq('slug', b.slug).maybeSingle()).data;
    if (!c?.tutor_id) throw new AppError('not_found', 'Course not found');
    // the unique index is on an expression (coalesce(course_id, …)), so no ON CONFLICT: update-or-insert
    const mine = (await s.db.from('tutor_reviews').select('id').eq('learner_id', s.userId).eq('tutor_id', c.tutor_id).eq('course_id', c.id).maybeSingle()).data;
    const { error } = mine
      ? await s.db.from('tutor_reviews').update({ rating: b.rating, body: b.body ?? null }).eq('id', mine.id)
      : await s.db.from('tutor_reviews').insert({ tutor_id: c.tutor_id, learner_id: s.userId, course_id: c.id, rating: b.rating, body: b.body ?? null });
    if (error) throw error;
    return { ok: true, kind: 'course' as const };
  }
  const { error } = await s.db.from('item_ratings').upsert({ user_id: s.userId, item_kind: b.item_kind, item_id: b.item_id, rating: b.rating, body: b.body ?? null },
    { onConflict: 'user_id,item_kind,item_id' });
  if (error) throw error;
  return { ok: true, kind: 'item' as const };
}
