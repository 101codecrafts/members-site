import { route, preflight, body, query, unwrap } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
import { catalogRepo } from '@/repositories/catalog';
import { pagination, educationLevel } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const { db } = await optionalSession();
  return catalogRepo.events(db, query(req, pagination.extend({ level: educationLevel.optional() })));
});
export const OPTIONS = preflight;
