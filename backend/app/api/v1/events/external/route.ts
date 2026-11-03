import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession, requireMember } from '@/lib/auth';
import { pagination } from '@/lib/validation';
/** Tech events & meetups from GDG/Bevy, Luma, Meetup, Eventbrite, MLH, Devpost (link out only) + member submissions (moderated). */
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  const p = query(req, pagination.extend({ organiser: z.string().max(20).optional(), mode: z.enum(['physical', 'online', 'hybrid']).optional(), city: z.string().max(60).optional() }));
  let q = db.from('external_events').select('id, title, organiser, organiser_name, mode, venue, city, country, lat, lng, starts_at, ends_at, timezone, price_text, source, verified')
    .gte('starts_at', new Date().toISOString()).order('starts_at').range(p.offset, p.offset + p.limit - 1);
  if (p.organiser) q = q.eq('organiser', p.organiser as 'other');
  if (p.mode) q = q.eq('mode', p.mode);
  if (p.city) q = q.ilike('city', p.city);
  return unwrap(await q);   // outbound link: /api/v1/go/<id>?k=external_event (TODO register_click kind)
}, { cacheSeconds: 300 });
const x0 = z.object({ title: z.string().min(3).max(200), organiser: z.enum(['google_gdg', 'microsoft', 'openai', 'anthropic', 'hugging_face', 'alibaba_cloud', 'aws', 'mlh', '101', 'other']).default('other'),
  mode: z.enum(['physical', 'online', 'hybrid']).default('physical'), venue: z.string().max(200).optional(), city: z.string().max(60).optional(),
  starts_at: z.string().datetime(), ends_at: z.string().datetime().optional(), source_url: z.string().url().startsWith('https://') });
export const POST = route(async ({ req }) => { const s = await requireMember(); const b = await body(req, x0);
  return unwrap(await s.db.from('external_events').insert({ ...b, dedupe_key: `member:${b.source_url.toLowerCase()}` }).select().single()); },
  { rateLimit: { name: 'write', max: 10, windowSeconds: 600 } });
export const OPTIONS = preflight;
