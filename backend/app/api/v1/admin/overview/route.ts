import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
export const GET = route(async () => rpc((await requireAdmin()).db, 'admin_overview'));
export const OPTIONS = preflight;
