import { route, preflight, body, unwrapMaybe } from '@/lib/http';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { notFound } from '@/lib/errors';
import { judgeSubmission } from '@/services/practice';
export const maxDuration = 60;
const submitBody = z.object({ language: z.string().regex(/^[a-z+#]{1,20}$/), code: z.string().min(1).max(65536), contest_id: z.string().uuid().optional() });
/** Creates the submission (RLS/RPC checks access, language, contest window) then judges it server-side. */
export const POST = route<{ slug: string }>(async ({ req, params, log }) => {
  const s = await requireMember();
  const b = await body(req, submitBody);
  const p = unwrapMaybe(await s.db.from('problems').select('id').eq('slug', params.slug).maybeSingle());
  if (!p) throw notFound('Problem not found');
  const sub = await rpc(s.db, 'submit_solution', { p_problem: p.id, p_language: b.language, p_code: b.code, p_contest: b.contest_id });
  const judged = await judgeSubmission(sub.id, log);
  const final = unwrapMaybe(await s.db.from('submissions').select('id, verdict, passed, total, score, runtime_ms, memory_kb, compile_output, created_at').eq('id', sub.id).maybeSingle());
  return { submission: final, judged: Boolean(judged) };
}, { rateLimit: { name: 'submit', max: 12, windowSeconds: 60 } });
export const OPTIONS = preflight;
