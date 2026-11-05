import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { clerkId } from '@/lib/validation';
import { call } from '@/services/admin-console';
import { adminPatchBody, adminRemoveBody } from '@/lib/admin-validation';
/** Root only: change scopes or suspend/reinstate. Root itself can never be changed (DB guard). */
export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const id = clerkId.parse(params.id);
  const b = await body(req, adminPatchBody);
  if ('scopes' in b) return call(s.db, 'admin_set_scopes', { p_user: id, p_scopes: b.scopes });
  return call(s.db, 'admin_set_admin_status', { p_user: id, p_status: b.status, p_reason: b.reason ?? null });
});
export const DELETE = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, adminRemoveBody);
  await call(s.db, 'admin_remove_admin', { p_user: clerkId.parse(params.id), p_reason: b.reason ?? null });
  return { ok: true };
});
export const OPTIONS = preflight;
