import { route, preflight, body, query, unwrap } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
import { catalogRepo } from '@/repositories/catalog';
export const GET = route(async () => {
  const db = anonClient();
  const [settings, flags] = await Promise.all([catalogRepo.publicSettings(db), catalogRepo.flags(db)]);
  return { settings: Object.fromEntries(settings.map((s) => [s.key, s.value])), flags };
}, { cacheSeconds: 120 });
export const OPTIONS = preflight;
