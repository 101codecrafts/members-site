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

export const EVENT_TYPES = ['hackathon', 'meetup', 'conference', 'workshop', 'webinar', 'study jam'] as const;

export const eventSubmitSchema = z.object({
  title: z.string().trim().min(3).max(200),
  organiser: z.enum(['google_gdg', 'microsoft', 'openai', 'anthropic', 'hugging_face', 'alibaba_cloud', 'aws', 'mlh', '101', 'other']).default('other'),
  mode: z.enum(['physical', 'online', 'hybrid']).default('physical'),
  venue: z.string().max(200).optional(), city: z.string().max(60).optional(),
  starts_at: z.string().datetime(), ends_at: z.string().datetime().optional(),
  source_url: z.string().url().startsWith('https://'),
  // r12 event review: the form fields that used to be dropped. Stored only once migration 20261106030000 is applied
  // (price/currency also go into the existing price_text column, so the card shows the price either way).
  event_type: z.enum(EVENT_TYPES).optional(),
  price: z.number().min(0).max(1_000_000_000).optional(),
  currency: z.enum(['UGX', 'USD', 'KES']).optional(),
  description: z.string().trim().max(400).optional(),
  contact_email: z.union([z.string().trim().toLowerCase().email().max(254), z.literal('')]).optional(),
  [HONEYPOT]: z.string().max(500).optional(),
});
export type EventSubmit = z.infer<typeof eventSubmitSchema>;

/** true when the hidden honeypot field was filled (a bot) */
export const isBot = (b: Record<string, unknown>): boolean => typeof b[HONEYPOT] === 'string' && (b[HONEYPOT] as string).trim() !== '';

/** price_text (existing column, shown on the card): "Free" for 0, "UGX 20,000" otherwise; omitted when no price was sent */
export function priceText(price?: number, currency?: string): string | undefined {
  if (price === undefined) return undefined;
  return price === 0 ? 'Free' : `${currency || 'UGX'} ${price.toLocaleString('en-US')}`;
}

/** the row to insert with the round-11 columns only: honeypot removed, dedupe key per source URL */
export function toInsert(b: EventSubmit) {
  const row: Record<string, unknown> = { title: b.title, organiser: b.organiser, mode: b.mode, starts_at: b.starts_at, source_url: b.source_url,
    dedupe_key: `member:${b.source_url.toLowerCase()}` };
  for (const k of ['venue', 'city', 'ends_at'] as const) if (b[k] !== undefined) row[k] = b[k];
  const pt = priceText(b.price, b.currency); if (pt) row.price_text = pt;
  return row as { title: string; organiser: EventSubmit['organiser']; mode: EventSubmit['mode']; starts_at: string; source_url: string; dedupe_key: string;
                  venue?: string; city?: string; ends_at?: string; price_text?: string };
}

/** the columns migration 20261106030000 adds (empty object when the form sent none of them) */
export function toExtended(b: EventSubmit) {
  const x: { event_type?: string; price?: number; currency?: string; description?: string } = {};
  if (b.event_type) x.event_type = b.event_type;
  if (b.price !== undefined) { x.price = b.price; x.currency = b.currency || 'UGX'; } else if (b.currency) x.currency = b.currency;
  if (b.description) x.description = b.description;
  return x;
}

/** the private contact email (its own admin-only table), or null */
export const contactOf = (b: EventSubmit): string | null => (b.contact_email ? b.contact_email : null);
