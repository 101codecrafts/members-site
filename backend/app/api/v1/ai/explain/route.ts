import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { runAi } from '@/services/ai';
import { notFound, forbidden } from '@/lib/errors';
const b0 = z.object({ problem_id: z.string().uuid(), code: z.string().max(65536).optional(), language: z.string().max(20).optional(), question: z.string().max(2000).optional() });
/** Practice AI helper. Never reveals a full solution while the problem is in an upcoming/live contest. */
export const POST = route(async ({ req }) => {
  const s = await requireMember(); const b = await body(req, b0);
  const pol = (await rpc(s.db, 'practice_ai_policy', { p_problem: b.problem_id })) as unknown as { can_view: boolean; contest_locked: boolean; may_reveal_solution: boolean };
  if (!pol.can_view) throw notFound('Problem not found');
  if (pol.contest_locked) throw forbidden('AI explanations are disabled during the contest.');
  const p = (await s.db.from('problems').select('title, statement_md, constraints_md').eq('id', b.problem_id).single()).data;
  const rules = pol.may_reveal_solution ? '' : 'STRICT: a contest is running. Do NOT write the solution or code that solves it; give at most one conceptual nudge.';
  const sys = `Explain the approach and complexity clearly, step by step, like a tutor. ${rules}\nProblem: ${p?.title}\n${(p?.statement_md ?? '').slice(0, 6000)}\nConstraints: ${p?.constraints_md ?? ''}`;
  const user = [b.question, b.code ? `My ${b.language ?? ''} code:\n${b.code.slice(0, 12000)}` : ''].filter(Boolean).join('\n\n') || 'Help me get started.';
  return { ...(await runAi(s, 'practice.explain', [{ role: 'user', content: user }], { system: sys, maxTokens: 600 })), contest_locked: pol.contest_locked };
}, { rateLimit: { name: 'ai', max: 10, windowSeconds: 60 } });
export const OPTIONS = preflight;
