import { route, preflight, body } from '@/lib/http';
import { requireTutor } from '@/lib/auth';
import { uuid } from '@/lib/validation';
import { priceRequestBody } from '@/lib/plans-validation';
import { requestCoursePrice } from '@/services/billing';
/** Tutor asks for a price (or free). Goes to the admin approval queue; the course price changes only on approval. */
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireTutor();
  return requestCoursePrice(s, uuid.parse(params.id), await body(req, priceRequestBody));
});
export const OPTIONS = preflight;
