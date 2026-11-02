import { route, preflight, body, query, unwrap } from '@/lib/http';
import { recordClientError } from '@/services/tracking';
import { errorIngestBody } from '@/lib/validation';
import { optionalSession } from '@/lib/auth';
import { LIMITS } from '@/lib/ratelimit';
export const POST = route(async ({ req }) => {
  const { session } = await optionalSession();
  await recordClientError(await body(req, errorIngestBody), session?.userId ?? null);
  return { ok: true };
}, { rateLimit: LIMITS.errors });
export const OPTIONS = preflight;
