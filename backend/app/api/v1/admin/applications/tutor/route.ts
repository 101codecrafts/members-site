import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const p = query(req, pagination);
  return unwrap(await s.db.from('tutor_applications').select('*').eq('status', 'pending').order('created_at').range(p.offset, p.offset + p.limit - 1));
});
export const OPTIONS = preflight;
