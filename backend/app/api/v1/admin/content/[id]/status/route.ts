import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { contentStatusBody, uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, contentStatusBody);
  await rpc(s.db, 'admin_set_content_status', { p_entity: b.entity, p_id: uuid.parse(params.id), p_status: b.status, p_note: b.note });
  return { ok: true };
});
export const OPTIONS = preflight;
