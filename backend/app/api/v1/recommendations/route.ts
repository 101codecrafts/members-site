import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
export const GET = route(async () => {
  const s = await requireMember();
  const rows = await rpc(s.db, 'recommend_courses', { max_results: 10 });
  return rows.map(({ search_tsv: _s, ...c }) => c);
});
export const OPTIONS = preflight;
