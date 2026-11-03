import { route, preflight, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
const B = z.object({ bio: z.string().min(50).max(5000), expertise: z.array(z.string().max(40)).min(1).max(20), years_experience: z.number().int().min(0).max(60).optional(),
  sample_url: z.string().url().startsWith('https://').optional(), linkedin_url: z.string().url().startsWith('https://').optional(), id_document_path: z.string().max(300).optional() });
export const POST = route(async ({ req }) => {
  const s = await requireMember();
  const b = await body(req, B);
  if (b.id_document_path && !b.id_document_path.startsWith(`${s.userId}/`)) throw new Error('invalid document path');
  return unwrap(await s.db.from('tutor_applications').insert({ user_id: s.userId, ...b }).select('id, status, created_at').single());
});
export const OPTIONS = preflight;
