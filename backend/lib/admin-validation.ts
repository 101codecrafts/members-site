import { z } from 'zod';

/** Round 11 admin console request bodies (zod, strict: unknown keys are rejected). */
export const ADMIN_SCOPES = ['approvals', 'users', 'plans', 'flags', 'audit', 'stats', 'support_view', 'payments', 'moderation', 'content', 'settings'] as const;
export const REVIEW_KINDS = ['course', 'lesson', 'book', 'link', 'video', 'project', 'campaign', 'event', 'listing'] as const;
const clerkId = z.string().regex(/^[A-Za-z0-9_\-]{3,64}$/);   // same rule as lib/validation (kept local so this file is unit-testable)
const scopes = z.array(z.enum(ADMIN_SCOPES)).min(1).max(ADMIN_SCOPES.length);
const reason = z.string().trim().min(3).max(500);

export const inviteBody = z.object({ email: z.string().trim().toLowerCase().email().max(254), scopes }).strict();
export const acceptBody = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
export const adminPatchBody = z.union([
  z.object({ scopes }).strict(),
  z.object({ status: z.enum(['active', 'suspended']), reason: reason.optional() }).strict(),
]);
export const adminRemoveBody = z.object({ reason: reason.optional() }).strict();

export const queueQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'changes_requested', 'withdrawn']).default('pending'),
  kind: z.enum([...REVIEW_KINDS, 'price_change']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export const decideBody = z.object({
  decision: z.enum(['approve', 'reject', 'request_changes']),
  reason: z.string().trim().max(2000).optional().nullable(),
  fixes: z.array(z.string().trim().min(2).max(300)).max(20).optional(),
}).strict();
export const reviewId = z.string().regex(/^(price:)?[0-9a-f-]{36}$/);

export const submitBody = z.object({
  kind: z.enum(REVIEW_KINDS),
  entity_ref: z.string().trim().min(1).max(120),
  title: z.string().trim().min(2).max(200),
  summary: z.string().trim().max(2000).optional().nullable(),
  payload: z.record(z.unknown()).default({}),
  urls: z.array(z.string().trim().url().max(2048)).max(50).default([]),
}).strict();

export const peopleQuery = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(['guest', 'learner', 'tutor', 'admin', 'root_admin']).optional(),
  status: z.enum(['pending', 'active', 'suspended', 'banned']).optional(),
  minor: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export const manageBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('role'), role: z.enum(['learner', 'tutor']), grant: z.boolean(), reason: reason.optional() }).strict(),
  z.object({ action: z.literal('status'), status: z.enum(['active', 'suspended', 'banned']), reason: reason.optional(), until: z.string().datetime().optional() }).strict(),
  z.object({ action: z.literal('plan'), audience: z.enum(['learner', 'tutor']), plan: z.enum(['free', 'standard', 'plus', 'pro']), reason }).strict(),
  z.object({ action: z.literal('guardian_verify'), consent_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('guardian_revoke'), consent_id: z.string().uuid(), reason }).strict(),
]);

export const planBody = z.object({
  name: z.string().trim().min(2).max(40).optional(),
  tagline: z.string().trim().max(160).optional(),
  limits: z.record(z.union([z.number().min(0).max(1e9), z.boolean(), z.null()])).optional(),
  features: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  monthly_ugx: z.number().int().min(1000).max(10_000_000).optional(),
  yearly_ugx: z.number().int().min(1000).max(100_000_000).optional(),
  confirm_prices: z.boolean().optional(),
}).strict();
export const pricingBody = z.object({ is_free: z.boolean(), price_ugx: z.number().int().min(0).max(100_000_000).default(0), all_lessons_free: z.boolean().optional() }).strict()
  .refine((b) => b.is_free || b.price_ugx >= 1000, { message: 'Paid courses cost at least UGX 1,000', path: ['price_ugx'] });
export const flagBody = z.object({
  key: z.string().regex(/^[a-z0-9_.]{2,64}$/), enabled: z.boolean(), rollout_pct: z.number().int().min(0).max(100).default(100),
  roles: z.array(z.enum(['learner', 'tutor', 'admin', 'super_admin'])).max(4).nullable().optional(),
}).strict();
export const auditQuery = z.object({
  actor: clerkId.optional(), action: z.string().regex(/^[a-z_.]{2,60}$/).optional(), table: z.string().regex(/^[a-z_]{2,60}$/).optional(),
  from: z.string().datetime().optional(), to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0),
});
export const supportBody = z.object({ target: clerkId, reason: z.string().trim().min(5).max(500), ticket: z.string().trim().max(80).optional() }).strict();
