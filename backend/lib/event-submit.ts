import { z } from 'zod';

/**
 * Member event submissions (POST /api/v1/events/external), round 12 QA fix 3.
 * - Sign-in required (requireMember in the route; the DB guard trigger forces pending_review + source 'member').
 * - Honeypot: the form carries a visually hidden "website" field that people never see or fill. A bot that fills it gets the
 *   same 202 "received" answer as a person, but nothing is stored (so it learns nothing).
 * - Per-user cap: EVENT_SUBMIT_LIMIT submissions per user per rolling day window, on top of the per-IP write limit.
 */
export const HONEYPOT = 'website';
export const EVENT_SUBMIT_LIMIT = { name: 'event_submit', max: 5, windowSeconds: 86_400 } as const;
export const EVENT_SUBMIT_LIMIT_MSG = 'You can submit up to 5 events a day. Please try again tomorrow.';

export const eventSubmitSchema = z.object({
  title: z.string().trim().min(3).max(200),
  organiser: z.enum(['google_gdg', 'microsoft', 'openai', 'anthropic', 'hugging_face', 'alibaba_cloud', 'aws', 'mlh', '101', 'other']).default('other'),
  mode: z.enum(['physical', 'online', 'hybrid']).default('physical'),
  venue: z.string().max(200).optional(), city: z.string().max(60).optional(),
  starts_at: z.string().datetime(), ends_at: z.string().datetime().optional(),
  source_url: z.string().url().startsWith('https://'),
  [HONEYPOT]: z.string().max(500).optional(),
});
export type EventSubmit = z.infer<typeof eventSubmitSchema>;

/** true when the hidden honeypot field was filled (a bot) */
export const isBot = (b: Record<string, unknown>): boolean => typeof b[HONEYPOT] === 'string' && (b[HONEYPOT] as string).trim() !== '';

/** the row to insert: honeypot removed, dedupe key per source URL */
export function toInsert(b: EventSubmit) {
  const { [HONEYPOT]: _hp, ...rest } = b; void _hp;
  return { ...rest, dedupe_key: `member:${b.source_url.toLowerCase()}` };
}
