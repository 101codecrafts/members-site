import { route, preflight } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { syllabus } from '@/services/billing';
/** Lesson list with lock state for the caller (titles only for locked lessons) + can_enroll verdict. Signed-in only. */
export const GET = route<{ slug: string }>(async ({ params }) => { const s = await requireUser(); return syllabus(s.db, params.slug); });
export const OPTIONS = preflight;
