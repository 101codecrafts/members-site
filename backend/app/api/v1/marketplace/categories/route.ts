import { route, preflight, unwrap } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
export const GET = route(async () => unwrap(await anonClient().from('mkt_categories').select('id, parent_id, slug, name, sort').order('sort')), { cacheSeconds: 600 });
export const OPTIONS = preflight;
