import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireMember, authorize } from '@/lib/auth';
import { unfurlBody } from '@/lib/validation';
import { createResourceFromUrl, unfurlUrl } from '@/services/resources';
import { rateLimit, LIMITS } from '@/lib/ratelimit';
import { forbidden } from '@/lib/errors';
/** Paste a link → metadata preview (save=false) or a draft catalogue entry (save=true). Tutors and admins only. */
export const POST = route(async ({ req, log }) => {
  const s = await requireMember();
  authorize(s, 'resource', 'create');
  if (!s.tutorVerified && !s.roles.includes('admin') && !s.roles.includes('super_admin')) throw forbidden('Verified tutors and admins only');
  await rateLimit(LIMITS.unfurl, s.userId);
  const b = await body(req, unfurlBody);
  if (!b.save) return unfurlUrl(b.url);
  return createResourceFromUrl(s, b.url, { learning_path_id: b.learning_path_id, course_id: b.course_id }, log);
});
export const OPTIONS = preflight;
