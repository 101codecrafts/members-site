import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession, requireMember } from '@/lib/auth';
import { pagination } from '@/lib/validation';
/** Scholarships, internships, jobs, hackathons, grants… (minors see age-appropriate types only, via RLS). */
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  const p = query(req, pagination.extend({ type: z.enum(['scholarship', 'internship', 'job', 'hackathon', 'grant', 'fellowship', 'competition', 'bootcamp', 'volunteer']).optional(), remote: z.coerce.boolean().optional() }));
  let q = db.from('opportunities').select('id, type, title, org, summary, location, country, remote, levels, deadline_at, deadline_tz, source, tags, verified_by_admin', { count: 'exact' })
    .eq('status', 'published').order('deadline_at', { ascending: true, nullsFirst: false }).range(p.offset, p.offset + p.limit - 1);
  if (p.type) q = q.eq('type', p.type);
  if (p.remote != null) q = q.eq('remote', p.remote);
  const r = await q;
  return { rows: unwrap(r), total: r.count ?? 0 };
}, { cacheSeconds: 120 });
const o0 = z.object({ type: z.enum(['scholarship', 'internship', 'job', 'hackathon', 'grant', 'fellowship', 'competition', 'bootcamp', 'volunteer']), title: z.string().min(5).max(200), org: z.string().min(2).max(120),
  summary: z.string().max(2000).optional(), location: z.string().max(120).optional(), remote: z.boolean().default(false), deadline_at: z.string().datetime().optional(), url: z.string().url().startsWith('https://') });
export const POST = route(async ({ req }) => { const s = await requireMember(); const b = await body(req, o0);
  const canonical = new URL(b.url); canonical.hash = ''; ['utm_source', 'utm_medium', 'utm_campaign'].forEach((k) => canonical.searchParams.delete(k));
  return unwrap(await s.db.from('opportunities').insert({ ...b, canonical_url: canonical.toString().toLowerCase() }).select().single()); },
  { rateLimit: { name: 'write', max: 10, windowSeconds: 600 } });
export const OPTIONS = preflight;
