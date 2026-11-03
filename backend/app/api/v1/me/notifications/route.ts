import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { pagination, uuid } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const s = await requireUser();
  const p = query(req, pagination.extend({ unread: z.coerce.boolean().optional() }));
  let q = s.db.from('notifications').select('id, type, title, body, link, data, read_at, created_at').order('created_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
  if (p.unread) q = q.is('read_at', null);
  return unwrap(await q);
});
export const PATCH = route(async ({ req }) => {
  const s = await requireUser();
  const { ids } = await body(req, z.object({ ids: z.array(uuid).max(200).optional() }));
  return { updated: await rpc(s.db, 'mark_notifications_read', { p_ids: ids }) };
});
export const OPTIONS = preflight;
