import { route, preflight, body } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { revalidatePath } from 'next/cache';
import { reorderBody } from '@/lib/validation';
export const POST = route(async ({ req }) => {
  const s = await requireAdmin();
  await rpc(s.db, 'admin_reorder_social_links', { p_ids: (await body(req, reorderBody)).ids });
  revalidatePath('/api/v1/social');
  return { ok: true };
});
export const OPTIONS = preflight;
