import { route, preflight, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { anonClient } from '@/lib/supabase/user';
export const GET = route(async ({ req }) => {
  const p = query(req, z.object({ when: z.enum(['upcoming', 'live', 'past', 'all']).default('all') }));
  const now = new Date().toISOString();
  let q = anonClient().from('contests').select('id, slug, title, starts_at, ends_at, scoring, level').order('starts_at', { ascending: false }).limit(100);
  if (p.when === 'upcoming') q = q.gt('starts_at', now);
  if (p.when === 'live') q = q.lte('starts_at', now).gt('ends_at', now);
  if (p.when === 'past') q = q.lte('ends_at', now);
  return unwrap(await q);
}, { cacheSeconds: 60 });
export const OPTIONS = preflight;
