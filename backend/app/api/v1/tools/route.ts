import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { anonClient } from '@/lib/supabase/user';
import { catalogRepo } from '@/repositories/catalog';
export const GET = route(async ({ req }) => catalogRepo.tools(anonClient(), query(req, z.object({ featured: z.coerce.boolean().default(false) })).featured), { cacheSeconds: 300 });
export const OPTIONS = preflight;
