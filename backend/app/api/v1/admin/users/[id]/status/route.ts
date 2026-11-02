import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { accountStatusBody, clerkId } from '@/lib/validation';
import { syncClerkBan } from '@/services/identity';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, accountStatusBody);
  const id = clerkId.parse(params.id);
  const p = await rpc(s.db, 'admin_set_account_status', { p_user: id, p_status: b.status, p_reason: b.reason, p_until: b.until });
  await syncClerkBan(id, b.status);   // revoke sessions immediately
  return { id: p.id, account_status: p.account_status };
});
export const OPTIONS = preflight;
