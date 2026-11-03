import { route, preflight, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { anonClient } from '@/lib/supabase/user';
import { pagination, educationLevel } from '@/lib/validation';
const Q = pagination.extend({ provider: z.string().max(60).optional(), level: educationLevel.optional(),
  access: z.enum(['free', 'free_audit', 'free_trial', 'free_until', 'paid_with_aid']).optional(), certificate_free: z.coerce.boolean().optional() });
export const GET = route(async ({ req }) => {
  const p = query(req, Q);
  let q = anonClient().from('external_courses').select('id, title, description, provider, cover_image_url, access_type, free_until, certificate_free, level, skill_level, category, language, duration_text, tags, is_featured, clicks')
    .eq('approved', true).eq('status', 'active').order('is_featured', { ascending: false }).order('clicks', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
  if (p.provider) q = q.eq('provider', p.provider);
  if (p.level) q = q.eq('level', p.level);
  if (p.access) q = q.eq('access_type', p.access);
  if (p.certificate_free !== undefined) q = q.eq('certificate_free', p.certificate_free);
  // source_url is intentionally omitted: cards link to /go/{id}?k=external_course
  return unwrap(await q);
}, { cacheSeconds: 120 });
export const OPTIONS = preflight;
