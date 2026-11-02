import { route, preflight } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
import { catalogRepo } from '@/repositories/catalog';
export const revalidate = 300;
export const GET = route(async () => catalogRepo.socialLinks(anonClient()), { cacheSeconds: 300 });
export const OPTIONS = preflight;
