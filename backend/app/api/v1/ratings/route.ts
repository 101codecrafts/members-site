import { route, preflight, body } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { ratingBody } from '@/lib/plans-validation';
import { createRating } from '@/services/billing';
/** Rate a course (enrolled learners only) or a book/resource/external course (recorded use only). One per user per item, editable. */
export const POST = route(async ({ req }) => createRating(await requireMember(), await body(req, ratingBody)));
export const OPTIONS = preflight;
