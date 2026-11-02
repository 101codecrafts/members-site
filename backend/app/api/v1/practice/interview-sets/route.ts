import { route, preflight, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { anonClient } from '@/lib/supabase/user';
/** Company-wise interview prep lists. */
export const GET = route(async ({ req }) => {
  const p = query(req, z.object({ company: z.string().max(60).optional() }));
  let q = anonClient().from('interview_sets').select('id, slug, title, company, description_md, interview_set_items(ord, problems(slug, title, difficulty), articles(slug, title))').order('company');
  if (p.company) q = q.ilike('company', p.company);
  return unwrap(await q);
}, { cacheSeconds: 300 });
export const OPTIONS = preflight;
