import { route, preflight } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
import { catalogRepo } from '@/repositories/catalog';
import { notFound } from '@/lib/errors';
import { slug } from '@/lib/validation';
export const GET = route<{ slug: string }>(async ({ params }) => {
  const { db } = await optionalSession();
  const c = await catalogRepo.course(db, slug.parse(params.slug));
  if (!c) throw notFound('Course not found');
  return c;
});
export const OPTIONS = preflight;
