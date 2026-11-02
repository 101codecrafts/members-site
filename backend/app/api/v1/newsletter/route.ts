import { route, preflight, body, query, unwrap } from '@/lib/http';
import { subscribeNewsletter } from '@/services/tracking';
import { newsletterBody } from '@/lib/validation';
import { LIMITS } from '@/lib/ratelimit';
export const POST = route(async ({ req }) => {
  await subscribeNewsletter(await body(req, newsletterBody));
  return { ok: true, message: 'Check your inbox to confirm.' };
}, { rateLimit: LIMITS.auth });
export const OPTIONS = preflight;
