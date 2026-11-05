import { route, preflight } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { call } from '@/services/admin-console';
/** Real counts from the database (zeros when empty). Scope: stats (or approvals). */
export const GET = route(async () => call((await requireAdmin()).db, 'admin_console_stats'));
export const OPTIONS = preflight;
