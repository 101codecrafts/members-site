import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SOCIAL_DOMAINS, uuid } from '@/lib/validation';
import { badRequest } from '@/lib/errors';
const Patch = z.object({ url: z.string().url().startsWith('https://').optional(), label: z.string().max(60).optional(), is_active: z.boolean().optional(),
  display_order: z.number().int().min(0).max(1000).optional() }).strict();
export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireAdmin();
  const id = uuid.parse(params.id);
  const b = await body(req, Patch);
  if (b.url) {
    const cur = unwrap(await s.db.from('social_links').select('platform').eq('id', id).single());
    if (!cur || !SOCIAL_DOMAINS[cur.platform]!.test(b.url)) throw badRequest('URL does not match the platform domain');
  }
  const row = unwrap(await s.db.from('social_links').update({ ...b, updated_by: s.userId }).eq('id', id).select('*').single());
  revalidatePath('/api/v1/social');
  return row;
});
export const DELETE = route<{ id: string }>(async ({ params }) => {
  const s = await requireAdmin();
  unwrap(await s.db.from('social_links').delete().eq('id', uuid.parse(params.id)));
  revalidatePath('/api/v1/social');
  return { ok: true };
});
void rpc;
export const OPTIONS = preflight;
