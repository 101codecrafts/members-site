import { route, preflight, query } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
import { catalogRepo } from '@/repositories/catalog';
import { pagination, educationLevel } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const { db, session } = await optionalSession();
  return catalogRepo.events(db, query(req, pagination.extend({ level: educationLevel.optional() })), session?.userId ?? null);
});
export const OPTIONS = preflight;
