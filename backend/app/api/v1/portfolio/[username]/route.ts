import { route, preflight } from '@/lib/http';
import { publicPortfolio } from '@/services/portfolio';
import { notFound } from '@/lib/errors';
export const GET = route<{ username: string }>(async ({ params }) => {
  const p = await publicPortfolio(params.username.toLowerCase());
  if (!p) throw notFound('Profile not found');
  return p;
}, { cacheSeconds: 120 });
export const OPTIONS = preflight;
