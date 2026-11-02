import { route, preflight, unwrap, unwrapMaybe } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
import { notFound } from '@/lib/errors';
export const GET = route<{ slug: string }>(async ({ params }) => {
  const { db, session } = await optionalSession();
  const c = unwrapMaybe(await db.from('contests').select('*').eq('slug', params.slug).maybeSingle());
  if (!c) throw notFound('Contest not found');
  const problems = unwrap(await db.from('contest_problems').select('label, points, problems(id, slug, title, difficulty)').eq('contest_id', c.id).order('label'));
  const reg = session ? (await db.from('contest_registrations').select('registered_at').eq('contest_id', c.id).maybeSingle()).data : null;
  return { ...c, problems, registered: Boolean(reg) };
});
export const OPTIONS = preflight;
