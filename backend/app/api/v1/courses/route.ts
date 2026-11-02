import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { optionalSession } from '@/lib/auth';
import { catalogRepo } from '@/repositories/catalog';
import { pagination, educationLevel } from '@/lib/validation';
import { LIMITS } from '@/lib/ratelimit';
const Q = pagination.extend({ level: educationLevel.optional(), featured: z.coerce.boolean().optional() });
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  return catalogRepo.courses(db, query(req, Q));
}, { rateLimit: LIMITS.public });
export const OPTIONS = preflight;
