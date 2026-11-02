import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { checkEmail } from '@/services/email-guard';
/** Pre-check before sign-up / email change / invite (rate-limited per IP). Clerk restrictions + webhook enforce it too. */
export const POST = route(async ({ req }) => {
  const b = await body(req, z.object({ email: z.string().email().max(254) }));
  const v = await checkEmail(b.email);
  return v.ok ? { ok: true } : { ok: false, reason: v.reason };
}, { rateLimit: { name: 'auth', max: 10, windowSeconds: 600 } });
export const OPTIONS = preflight;
