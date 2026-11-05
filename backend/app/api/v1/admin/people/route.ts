import { route, preflight, query } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { call } from '@/services/admin-console';
import { peopleQuery } from '@/lib/admin-validation';
/** Scope: users. Search by name / username / email / id; filter role (incl. guest, root_admin), status, minors. */
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const p = query(req, peopleQuery);
  return call(s.db, 'admin_search_users', { p_q: p.q ?? null, p_role: p.role ?? null, p_status: p.status ?? null, p_minor: p.minor ?? null, p_limit: p.limit, p_offset: p.offset });
});
export const OPTIONS = preflight;
