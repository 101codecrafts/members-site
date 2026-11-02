import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { newsManualBody } from '@/lib/validation';
import { addManualNews } from '@/services/admin';
export const POST = route(async ({ req }) => {
  const s = await requireAdmin();
  return addManualNews(s, await body(req, newsManualBody));
});
void rpc;
export const OPTIONS = preflight;
