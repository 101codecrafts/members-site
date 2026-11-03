import { route, preflight, body } from '@/lib/http';
import { optionalSession } from '@/lib/auth';
import { recordEvents } from '@/services/tracking';
import { trackBody } from '@/lib/validation';
import { LIMITS } from '@/lib/ratelimit';
export const POST = route(async ({ req, ip }) => {
  const { session } = await optionalSession();
  const input = await body(req, trackBody);
  return { accepted: await recordEvents(input.events, session?.userId ?? null, req.headers.get('x-vercel-ip-country'), ip) };
}, { rateLimit: LIMITS.track });
export const OPTIONS = preflight;
