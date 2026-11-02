import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession } from '@/lib/auth';
import { catalogRepo } from '@/repositories/catalog';
import { pagination } from '@/lib/validation';
const Q = pagination.extend({ sort: z.enum(['top', 'new']).default('top'), day: z.string().date().optional() });
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  return catalogRepo.launches(db, query(req, Q));
});
export const OPTIONS = preflight;
