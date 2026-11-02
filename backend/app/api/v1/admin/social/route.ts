import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { revalidatePath } from 'next/cache';
import { socialLinkBody } from '@/lib/validation';
export const GET = route(async () => unwrap(await (await requireAdmin()).db.from('social_links').select('*').order('display_order')));
export const POST = route(async ({ req }) => {
  const s = await requireAdmin();
  const b = await body(req, socialLinkBody);
  const row = unwrap(await s.db.from('social_links').insert({ ...b, updated_by: s.userId }).select('*').single());
  revalidatePath('/api/v1/social');
  return row;
});
void rpc;
export const OPTIONS = preflight;
