/**
 * Zod contracts for round-11 plans / billing endpoints. Note what is NOT here: no amount field anywhere a
 * learner pays (SR-17). `.strict()` rejects unknown keys, so a client that sends `amount_ugx` gets a 400.
 */
import { z } from 'zod';

export const audience = z.enum(['learner', 'tutor']);
export const tier = z.enum(['free', 'standard', 'plus', 'pro']);
export const paidTier = z.enum(['standard', 'plus', 'pro']);
export const payMethod = z.enum(['mtn_momo', 'airtel_money', 'card']);
const ugPhone = z.string().regex(/^(\+?256|0)7\d{8}$/, 'Ugandan mobile number like 07XX XXX XXX');

export const planCheckoutBody = z.object({
  audience,
  tier: paidTier,
  interval: z.enum(['monthly', 'yearly']),
  method: payMethod,
  phone: ugPhone.optional(),          // MoMo number to prompt; defaults to the profile phone
}).strict().refine((b) => b.method === 'card' || !!b.phone, { message: 'phone required for Mobile Money', path: ['phone'] });

const limitValue = z.union([z.number().int().min(0).max(1_000_000), z.boolean(), z.null()]);
export const adminPlanBody = z.object({
  name: z.string().min(2).max(40).optional(),
  tagline: z.string().max(160).optional(),
  limits: z.record(z.string().regex(/^[a-z_]{2,20}(\.[a-z_]{2,20})?$/), limitValue).optional(),
  features: z.array(z.string().min(1).max(120)).max(12).optional(),
  monthly_ugx: z.number().int().min(1000).max(10_000_000).optional(),
  yearly_ugx: z.number().int().min(1000).max(100_000_000).optional(),
  confirm_prices: z.boolean().optional(),
}).strict();

export const priceRequestBody = z.object({
  make_free: z.boolean().default(false),
  price_ugx: z.number().int().min(1000).max(10_000_000).optional(),
  note: z.string().max(1000).optional(),
}).strict().refine((b) => b.make_free || b.price_ugx !== undefined, { message: 'price_ugx required unless make_free', path: ['price_ugx'] });

export const priceDecisionBody = z.object({ approve: z.boolean(), note: z.string().max(1000).optional() }).strict();

export const adminCoursePricingBody = z.object({
  is_free: z.boolean(),
  price_ugx: z.number().int().min(0).max(10_000_000).default(0),
  all_lessons_free: z.boolean().optional(),
}).strict().refine((b) => b.is_free ? b.price_ugx === 0 : b.price_ugx >= 1000, { message: 'free courses cost 0; paid courses at least UGX 1,000', path: ['price_ugx'] });

export const providerSwitchBody = z.object({ enabled: z.boolean(), sort: z.number().int().min(0).max(999).optional() }).strict();

export const itemUseBody = z.object({ kind: z.enum(['resource', 'book', 'external_course', 'ai_tool']), id: z.string().min(1).max(120) }).strict();

export const ratingBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('course'), slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80), rating: z.number().int().min(1).max(5), body: z.string().max(3000).optional() }).strict(),
  z.object({ kind: z.literal('item'), item_kind: z.enum(['resource', 'book', 'external_course', 'ai_tool']), item_id: z.string().min(1).max(120), rating: z.number().int().min(1).max(5), body: z.string().max(3000).optional() }).strict(),
]);
