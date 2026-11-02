import { route, preflight, query } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { searchQuery } from '@/lib/validation';
import { LIMITS } from '@/lib/ratelimit';
export const GET = route(async ({ req }) => {
  const p = query(req, searchQuery);
  const { db } = await optionalSession();
  return rpc(db, 'search_all', { q: p.q, kinds: p.kinds?.split(',').filter(Boolean), max_results: p.limit, p_level: p.level });
}, { rateLimit: LIMITS.public });
export const OPTIONS = preflight;
