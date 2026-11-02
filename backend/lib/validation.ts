/**
 * Zod contracts for every request body / query (typed API contracts).
 * Money is always whole UGX integers; ids are UUIDs or Clerk ids.
 */
import { z } from 'zod';

export const uuid = z.string().uuid();
export const clerkId = z.string().regex(/^[A-Za-z0-9_\-]{3,64}$/);
export const ugx = z.number().int().nonnegative().max(100_000_000);
export const httpsUrl = z.string().url().max(2048).refine((u) => u.startsWith('https://'), 'https URL required');
export const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
export const educationLevel = z.enum(['primary', 'o_level', 'a_level', 'university', 'professional']);
export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

// ------------------------------------------------------------ payments ----
export const checkoutBody = z.object({
  purpose: z.enum(['course', 'subscription', 'event_ticket', 'marketplace_order', 'tutor_session', 'donation']),
  reference_id: uuid.optional(),
  coupon_code: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).optional(),
  quantity: z.number().int().min(1).max(100).default(1),
  note: z.string().max(1000).optional(),
  amount_ugx: ugx.optional(), // donations only; ignored otherwise by the DB
}).refine((b) => b.purpose === 'donation' || !!b.reference_id, { message: 'reference_id required', path: ['reference_id'] });

export const refundRequestBody = z.object({ payment_id: uuid, reason: z.string().min(3).max(1000) });
export const payoutRequestBody = z.object({ amount_ugx: z.number().int().min(1000).max(100_000_000), method_id: uuid.optional() });
export const payoutMethodBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mobile_money'), network: z.enum(['MTN', 'AIRTEL']), account_name: z.string().min(2).max(120),
             msisdn: z.string().regex(/^(\+?256|0)7\d{8}$/, 'Ugandan mobile number') }),
  z.object({ kind: z.literal('bank'), bank_code: z.string().regex(/^[A-Z0-9_]{2,20}$/), account_name: z.string().min(2).max(120),
             account_number: z.string().regex(/^\d{6,20}$/) }),
]);

// --------------------------------------------------------------- admin ----
export const reviewDecision = z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().max(2000).optional() });
export const accountStatusBody = z.object({
  status: z.enum(['active', 'suspended', 'banned']), reason: z.string().min(3).max(500).optional(), until: z.string().datetime().optional(),
});
export const roleBody = z.object({ role: z.enum(['learner', 'tutor', 'admin', 'super_admin']), grant: z.boolean() });
export const contentStatusBody = z.object({
  entity: z.enum(['course', 'launch_product', 'job', 'resource', 'event', 'competition', 'news']),
  status: z.string().regex(/^[a-z_]{3,20}$/), note: z.string().max(2000).optional(),
});
export const featureBody = z.object({ entity: z.enum(['course', 'project', 'tool', 'event', 'resource', 'news', 'job', 'listing']), featured: z.boolean() });
export const moderateBody = z.object({ action: z.enum(['dismiss', 'hide', 'unhide', 'delete', 'ban_author']), note: z.string().max(2000).optional() });
export const payoutDecisionBody = z.object({ decision: z.enum(['approve', 'hold', 'reject']), note: z.string().max(1000).optional() });
export const adminRefundBody = z.object({ payment_id: uuid, amount_ugx: ugx.optional(), reason: z.string().min(3).max(1000).default('Admin refund'), refund_id: uuid.optional() });
export const settingBody = z.object({ key: z.string().regex(/^[a-z0-9_.]{2,64}$/), value: z.unknown(), is_public: z.boolean().optional() });
export const flagBody = z.object({ key: z.string().regex(/^[a-z0-9_.]{2,64}$/), enabled: z.boolean(), rollout_pct: z.number().int().min(0).max(100).default(100),
  roles: z.array(z.enum(['learner', 'tutor', 'admin', 'super_admin'])).optional() });
export const analyticsQuery = z.object({
  metric: z.enum(['daily_kpis', 'revenue_by_product', 'revenue_by_tutor', 'top_courses', 'top_tutors', 'event_attendance',
    'subscription_churn', 'levels', 'funnel', 'top_launches', 'events_by_name']),
  from: z.string().date().optional(), to: z.string().date().optional(), limit: z.coerce.number().int().min(1).max(200).optional(),
});
export const exportQuery = z.object({
  dataset: z.enum(['members', 'payments', 'payouts', 'refunds', 'enrollments', 'audit_log', 'event_registrations', 'ledger']),
  from: z.string().date().optional(), to: z.string().date().optional(),
});
export const announcementBody = z.object({
  title: z.string().min(3).max(200), body: z.string().min(1).max(10000),
  audience: z.enum(['public', 'members', 'learners', 'tutors', 'admins']).default('members'),
  link: z.string().max(500).regex(/^(\/|https:\/\/)/).optional(), send_email: z.boolean().default(false), publish: z.boolean().default(true),
});

// ------------------------------------------------- social links / settings ----
export const SOCIAL_DOMAINS: Record<string, RegExp> = {
  youtube: /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i,
  instagram: /^https:\/\/(www\.)?instagram\.com\//i,
  tiktok: /^https:\/\/(www\.)?tiktok\.com\//i,
  x: /^https:\/\/(www\.)?(x\.com|twitter\.com)\//i,
  linkedin: /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i,
  discord: /^https:\/\/(www\.)?(discord\.gg|discord\.com)\//i,
  facebook: /^https:\/\/(www\.|m\.)?(facebook\.com|fb\.com)\//i,
  whatsapp_channel: /^https:\/\/(www\.)?whatsapp\.com\/channel\//i,
  whatsapp_group: /^https:\/\/chat\.whatsapp\.com\//i,
  telegram: /^https:\/\/(t\.me|telegram\.me)\//i,
  github: /^https:\/\/(www\.)?github\.com\//i,
  threads: /^https:\/\/(www\.)?threads\.(net|com)\//i,
  other: /^https:\/\//i,
};
export const socialLinkBody = z.object({
  platform: z.enum(['youtube', 'instagram', 'tiktok', 'x', 'linkedin', 'discord', 'facebook', 'whatsapp_channel', 'whatsapp_group', 'telegram', 'github', 'threads', 'other']),
  url: httpsUrl, label: z.string().max(60).optional(), display_order: z.number().int().min(0).max(1000).default(0), is_active: z.boolean().default(true),
}).refine((b) => SOCIAL_DOMAINS[b.platform]!.test(b.url), { message: 'URL does not match the platform domain', path: ['url'] });
export const reorderBody = z.object({ ids: z.array(uuid).min(1).max(100) });

// ----------------------------------------------------- resources / news ----
export const unfurlBody = z.object({ url: httpsUrl, save: z.boolean().default(true), learning_path_id: uuid.optional(), course_id: uuid.optional() });
export const resourcePatchBody = z.object({
  type: z.enum(['course', 'book', 'video', 'article', 'tool', 'repo']).optional(), title: z.string().min(1).max(300).optional(),
  description: z.string().max(5000).nullable().optional(), author: z.string().max(200).nullable().optional(), price_text: z.string().max(60).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(), levels: z.array(educationLevel).max(5).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(), learning_path_id: uuid.nullable().optional(),
});
export const newsManualBody = z.object({ url: httpsUrl, category: z.enum(['ai', 'africa_tech', 'dev', 'security', 'cloud', 'startups_funding', 'jobs']), title: z.string().min(3).max(300).optional() });
export const courseMediaBody = z.object({
  course_id: uuid, lesson_id: uuid.optional(), url: httpsUrl, kind: z.enum(['youtube_video', 'youtube_playlist', 'book', 'article']).optional(),
  level: educationLevel.optional(), position: z.number().int().min(0).max(1000).default(0),
});
export const mediaProgressBody = z.object({ position: z.number().int().min(0).max(86400), delta_seconds: z.number().int().min(0).max(60) });

// ------------------------------------------------------------- tracking ----
export const trackBody = z.object({
  events: z.array(z.object({
    name: z.string().regex(/^[a-z_.]{2,60}$/), path: z.string().max(500).optional(), referrer: z.string().max(500).optional(),
    anonymous_id: z.string().max(64).optional(), session_id: z.string().max(64).optional(),
    utm_source: z.string().max(100).optional(), utm_medium: z.string().max(100).optional(), utm_campaign: z.string().max(100).optional(),
    platform: z.enum(['web', 'android', 'ios', 'windows', 'macos']).default('web'),
    properties: z.record(z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
  })).min(1).max(50),
});
export const errorIngestBody = z.object({
  source: z.enum(['web', 'android', 'ios', 'windows', 'macos']), level: z.enum(['warning', 'error', 'fatal']).default('error'),
  message: z.string().min(1).max(1000), stack: z.string().max(8000).optional(), path: z.string().max(500).optional(),
  release: z.string().max(60).optional(), fingerprint: z.string().max(128).optional(),
});
export const deviceTokenBody = z.object({
  token: z.string().min(10).max(4096), provider: z.enum(['expo', 'fcm', 'apns', 'webpush']),
  platform: z.enum(['android', 'ios', 'windows', 'macos', 'web']), app_version: z.string().max(40).optional(),
});
export const consentBody = z.object({
  purpose: z.enum(['terms', 'privacy', 'marketing_email', 'analytics', 'whatsapp', 'cookies_functional']), granted: z.boolean(), policy_version: z.string().min(1).max(20),
});
export const guardianBody = z.object({
  guardian_name: z.string().min(2).max(120), guardian_email: z.string().email().optional(), guardian_phone: z.string().regex(/^\+?[0-9]{7,15}$/).optional(),
  relationship: z.enum(['parent', 'guardian', 'teacher', 'other']), date_of_birth: z.string().date(),
}).refine((b) => b.guardian_email || b.guardian_phone, { message: 'guardian email or phone required' });
export const newsletterBody = z.object({ email: z.string().email().max(254), source: z.string().max(60).optional() });
export const onboardingBody = z.object({
  intended_role: z.enum(['learner', 'tutor']).optional(), interests: z.array(z.string().max(40)).max(20).optional(),
  experience_level: z.enum(['beginner', 'intermediate', 'advanced']).optional(), learning_path_id: uuid.optional(),
  goals: z.string().max(1000).optional(), education_level: educationLevel.optional(), steps_completed: z.array(z.string().max(40)).max(20).optional(),
  date_of_birth: z.string().date().optional(), complete: z.boolean().optional(),
});
export const searchQuery = z.object({
  q: z.string().min(1).max(100), kinds: z.string().regex(/^[a-z,]{1,80}$/).optional(), level: educationLevel.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
