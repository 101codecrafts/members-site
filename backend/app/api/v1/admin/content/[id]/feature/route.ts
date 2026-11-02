import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { featureBody, uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const b = await body(req, featureBody);
  await rpc(s.db, 'admin_feature', { p_entity: b.entity, p_id: uuid.parse(params.id), p_featured: b.featured });
  return { ok: true };
});
export const OPTIONS = preflight;
