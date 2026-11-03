import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
const B = z.object({ motivation: z.string().min(20).max(4000), skills: z.array(z.string().max(40)).max(30).default([]),
  experience_level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'), github_url: z.string().url().startsWith('https://').optional(),
  portfolio_url: z.string().url().optional(), referral: z.string().max(200).optional() });
export const POST = route(async ({ req }) => {
  const s = await requireUser();
  const b = await body(req, B);
  return unwrap(await s.db.from('membership_applications').insert({ user_id: s.userId, ...b }).select('id, status, created_at').single());
});
export const OPTIONS = preflight;
