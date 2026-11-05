import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { AppError } from '@/lib/errors';
import { SubmissionDecision } from '@/lib/lesson-input';
import { loose, run, rpcLoose } from '@/repositories/course-builder';
/** GET: one submission with its snapshot (preview of exactly what was submitted). */
export const GET = route<{ id: string }>(async ({ params }) => {
  const s = await requireAdmin();
  const row = await run(loose(s.db).from('course_submissions').select('*').eq('id', uuid.parse(params.id)).maybeSingle());
  if (!row) throw new AppError('not_found', 'Submission not found');
  return row;
});
/** POST {decision:'approved'|'rejected', reason?, price_ugx?}: approve (optionally at another price) or reject with a reason. Audited. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, SubmissionDecision);
  return rpcLoose(s.db, 'admin_review_course_submission', { p_submission: uuid.parse(params.id), p_decision: b.decision, p_reason: b.reason ?? null, p_price_ugx: b.price_ugx ?? null });
});
export const OPTIONS = preflight;
