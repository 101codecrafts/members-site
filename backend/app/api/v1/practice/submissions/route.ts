import { route, preflight, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const s = await requireUser();
  const p = query(req, pagination.extend({ problem_id: z.string().uuid().optional(), include_code: z.coerce.boolean().default(false) }));
  let q = s.db.from('submissions').select(p.include_code ? '*' : 'id, problem_id, contest_id, language, verdict, passed, total, score, runtime_ms, memory_kb, created_at')
    .order('created_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
  if (p.problem_id) q = q.eq('problem_id', p.problem_id);
  return unwrap(await q);
});
export const OPTIONS = preflight;
