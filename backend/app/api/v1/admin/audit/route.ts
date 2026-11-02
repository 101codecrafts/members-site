import { route, preflight, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';

import { z } from 'zod';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const p = query(req, pagination.extend({ table: z.string().regex(/^[a-z_]{2,60}$/).optional(), actor: z.string().max(64).optional() }));
  let q = s.db.from('audit_log').select('*').order('created_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
  if (p.table) q = q.eq('table_name', p.table);
  if (p.actor) q = q.eq('actor_id', p.actor);
  return unwrap(await q);
});
export const OPTIONS = preflight;
