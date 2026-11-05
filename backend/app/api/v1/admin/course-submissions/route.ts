import { z } from 'zod';
import { route, preflight } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { loose, run } from '@/repositories/course-builder';
/** GET ?status=pending|approved|rejected|withdrawn: the course approval queue (oldest first for pending). */
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const status = z.enum(['pending', 'approved', 'rejected', 'withdrawn']).catch('pending').parse(req.nextUrl.searchParams.get('status'));
  return run(loose(s.db).from('course_submissions')
    .select('id, course_id, submitted_by, kind, status, requested_price_ugx, approved_price_ugx, note, checklist, link_report, reason, created_at, reviewed_at, courses(title, slug, status, price_ugx, is_free), profiles!course_submissions_submitted_by_fkey(display_name, username)')
    .eq('status', status).order('created_at', { ascending: status === 'pending' }).limit(100));
});
export const OPTIONS = preflight;
