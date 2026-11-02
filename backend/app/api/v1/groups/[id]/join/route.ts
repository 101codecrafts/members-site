import { route, preflight, body, query, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireMember } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireMember();
  const b = await body(req, z.object({ invite_code: z.string().regex(/^[A-Za-z0-9]{8,16}$/).optional(), message: z.string().max(500).optional() }));
  return { status: await rpc(s.db, 'join_group', { p_group: uuid.parse(params.id), p_invite_code: b.invite_code, p_message: b.message }) };
});
export const OPTIONS = preflight;
