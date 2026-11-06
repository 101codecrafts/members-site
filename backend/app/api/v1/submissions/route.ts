import { route, preflight, body, unwrap } from '@/lib/http';
import { requireMemberCan } from '@/lib/auth';
import { call } from '@/services/admin-console';
import { checkSubmission } from '@/services/link-check';
import { submitBody } from '@/lib/admin-validation';
import type { Json } from '@/types/database';
/** My submissions (RLS: own rows). */
export const GET = route(async () => {
  const s = await requireMemberCan('review.submit');
  return unwrap(await s.db.from('review_submissions').select('*').eq('submitter_id', s.userId).order('created_at', { ascending: false }).limit(100));
});
/** Learners/tutors send something for review. Nothing is public until an admin approves it. Links are checked right away. */
export const POST = route(async ({ req }) => {
  const s = await requireMemberCan('review.submit');
  const b = await body(req, submitBody);
  const row = await call<{ id: string }>(s.db, 'submit_for_review', { p_kind: b.kind, p_entity_ref: b.entity_ref, p_title: b.title, p_summary: b.summary ?? null, p_payload: b.payload as Json /* parsed from the JSON body, so it is JSON */, p_urls: b.urls });
  const risk = await checkSubmission(row.id);
  return { ...row, risk };
}, { rateLimit: { name: 'submit-review', max: 30, windowSeconds: 3600 } });
export const OPTIONS = preflight;
