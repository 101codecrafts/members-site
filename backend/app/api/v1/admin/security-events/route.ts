import { route, preflight, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => { const s = await requireAdmin(); const p = query(req, pagination.extend({ kind: z.string().max(60).optional() }));
  let q = s.db.from('security_events').select('*').order('created_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
  if (p.kind) q = q.eq('kind', p.kind);
  return unwrap(await q); });
export const OPTIONS = preflight;
