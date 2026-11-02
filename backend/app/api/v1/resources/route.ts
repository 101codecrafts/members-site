import { route, preflight, query } from '@/lib/http';
import { z } from 'zod';
import { optionalSession } from '@/lib/auth';
import { catalogRepo } from '@/repositories/catalog';
import { pagination, educationLevel, uuid } from '@/lib/validation';
const Q = pagination.extend({ type: z.enum(['course', 'book', 'video', 'article', 'tool', 'repo']).optional(), level: educationLevel.optional(), path: uuid.optional() });
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  return catalogRepo.resources(db, query(req, Q));
});
export const OPTIONS = preflight;
