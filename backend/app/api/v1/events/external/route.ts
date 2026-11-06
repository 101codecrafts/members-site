import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { NextResponse } from 'next/server';
import { optionalSession, requireMemberCan } from '@/lib/auth';
import { rateLimit } from '@/lib/ratelimit';
import { AppError } from '@/lib/errors';
import { eventSubmitSchema, isBot, toInsert, toExtended, contactOf, EVENT_SUBMIT_LIMIT, EVENT_SUBMIT_LIMIT_MSG } from '@/lib/event-submit';
import { isSchemaOutdated } from '@/lib/event-review';
import type { SupabaseClient } from '@supabase/supabase-js';
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
/** Member submission (r12 QA fix 3): sign-in required, honeypot, 5 per user per day + the per-IP write limit. */
export const POST = route(async ({ req, log }) => {
  const s = await requireMemberCan('community.post');
  const b = await body(req, eventSubmitSchema);
  if (isBot(b)) { log.info('event_submit_honeypot', {}); return NextResponse.json({ data: { status: 'pending_review' } }, { status: 202 }); }
  try { await rateLimit(EVENT_SUBMIT_LIMIT, s.userId); }
  catch (e) { if (e instanceof AppError && e.code === 'rate_limited') throw new AppError('rate_limited', EVENT_SUBMIT_LIMIT_MSG); throw e; }
  // r12 event review: type/price/currency/description go into the columns 20261106030000 adds; while that migration is
  // unapplied the insert falls back to the round-11 columns (price still lands in price_text) and says details_stored: false.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = s.db as unknown as SupabaseClient<any, 'public', any>;
  const base = toInsert(b), ext = toExtended(b);
  let detailsStored = true;
  let r = await db.from('external_events').insert({ ...base, ...ext }).select('id, status').single();
  if (r.error && isSchemaOutdated(r.error) && Object.keys(ext).length) {
    detailsStored = false; log.warn('event_submit_details_degraded', { code: r.error.code });
    r = await db.from('external_events').insert(base).select('id, status').single();
  }
  const row = unwrap(r) as { id: string; status: string };
  const email = contactOf(b);
  if (email) {   // private table (admins + the submitter only); never a column on the public events table
    const c = await db.from('external_event_contacts').insert({ event_id: row.id, user_id: s.userId, contact_email: email });
    if (c.error) { detailsStored = false; log.warn('event_submit_contact_not_stored', { code: c.error.code }); }
  }
  return NextResponse.json({ data: { ...row, details_stored: detailsStored } }, { status: 201 });
}, { rateLimit: { name: 'write', max: 10, windowSeconds: 600 } });
export const OPTIONS = preflight;
