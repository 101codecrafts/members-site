import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { moderateBody, uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, moderateBody);
  return rpc(s.db, 'admin_moderate', { p_flag_id: uuid.parse(params.id), p_action: b.action, p_note: b.note });
});
export const OPTIONS = preflight;
