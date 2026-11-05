import { route, preflight, query } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { call } from '@/services/admin-console';
import { auditQuery } from '@/lib/admin-validation';
/** Scope: audit. Who, what, before → after, newest first. The log itself is append-only in SQL. */
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const p = query(req, auditQuery);
  return call(s.db, 'admin_audit_search', { p_actor: p.actor ?? null, p_action: p.action ?? null, p_table: p.table ?? null,
    p_from: p.from ?? null, p_to: p.to ?? null, p_limit: p.limit, p_offset: p.offset });
});
export const OPTIONS = preflight;
