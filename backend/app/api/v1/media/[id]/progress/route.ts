import { route, preflight, body } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid, mediaProgressBody } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireMember();
  const b = await body(req, mediaProgressBody);
  return rpc(s.db, 'record_media_progress', { p_media: uuid.parse(params.id), p_position: b.position, p_delta_seconds: b.delta_seconds });
});
export const OPTIONS = preflight;
