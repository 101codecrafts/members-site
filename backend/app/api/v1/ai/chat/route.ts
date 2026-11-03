import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { runAi } from '@/services/ai';
const chat = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000) })).min(1).max(40), feature: z.string().regex(/^[a-z][a-z0-9_.:-]{1,40}$/).default('chat') });
/** Free on-site AI chat for members (quota by plan, moderated, server-side keys only). */
export const POST = route(async ({ req }) => {
  const s = await requireMember(); const b = await body(req, chat);
  return runAi(s, b.feature, b.messages);
}, { rateLimit: { name: 'ai', max: 10, windowSeconds: 60 } });
export const OPTIONS = preflight;
