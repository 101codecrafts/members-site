import { route } from '@/lib/http';
import { assertCron } from '@/lib/cron';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
export const runtime = 'nodejs';
/** Auto-releases escrow 7 days after delivery when there is no open dispute. */
export const GET = route(async ({ req }) => { assertCron(req); return { released: await rpc(serviceClient(), 'mkt_release_due') }; });
