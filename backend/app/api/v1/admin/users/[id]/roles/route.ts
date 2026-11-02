import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { roleBody, clerkId } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin({ superAdmin: true });   // super_admin only (also enforced in admin_set_role)
  const b = await body(req, roleBody);
  await rpc(s.db, 'admin_set_role', { p_user: clerkId.parse(params.id), p_role: b.role, p_grant: b.grant });
  return { ok: true };
});
export const OPTIONS = preflight;
