import { route, preflight, unwrap, unwrapMaybe } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { notFound } from '@/lib/errors';
export const GET = route<{ slug: string }>(async ({ params }) => {
  const s = await requireUser();
  const a = unwrapMaybe(await s.db.from('articles').select('id').eq('slug', params.slug).maybeSingle());
  if (!a) throw notFound('Article not found');
  return unwrap(await s.db.from('article_versions').select('version, title, body_md, editor_id, created_at').eq('article_id', a.id).order('version', { ascending: false }));
});
export const OPTIONS = preflight;
