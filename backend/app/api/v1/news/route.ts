import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { anonClient } from '@/lib/supabase/user';
import { catalogRepo } from '@/repositories/catalog';
import { pagination } from '@/lib/validation';
const Q = pagination.extend({ category: z.enum(['ai', 'africa_tech', 'dev', 'security', 'cloud', 'startups_funding', 'jobs']).optional() });
export const GET = route(async ({ req }) => catalogRepo.news(anonClient(), query(req, Q)), { cacheSeconds: 300 });
export const OPTIONS = preflight;
