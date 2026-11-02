import { route, preflight } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
export const GET = route(async () => { const s = await requireUser(); return rpc(s.db, 'my_ai_quota'); });
export const OPTIONS = preflight;
