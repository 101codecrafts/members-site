import { route, preflight, body, unwrap } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { resourcePatchBody, uuid } from '@/lib/validation';
export const PATCH = route<{ id: string }>(async ({ req, params }) => {
  const s = await requireMember();
  const b = await body(req, resourcePatchBody);
  return unwrap(await s.db.from('external_resources').update(b).eq('id', uuid.parse(params.id)).select('id, status, title').single());
});
export const OPTIONS = preflight;
