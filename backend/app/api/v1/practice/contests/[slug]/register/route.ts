import { route, preflight, unwrapMaybe } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { notFound } from '@/lib/errors';
export const POST = route<{ slug: string }>(async ({ params }) => {
  const s = await requireMember();
  const c = unwrapMaybe(await s.db.from('contests').select('id').eq('slug', params.slug).maybeSingle());
  if (!c) throw notFound('Contest not found');
  await rpc(s.db, 'register_contest', { p_contest: c.id });
  return { registered: true };
});
export const OPTIONS = preflight;
