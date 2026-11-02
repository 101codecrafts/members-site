import { route, preflight, body, unwrap } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { consentBody } from '@/lib/validation';
import { sha256 } from '@/lib/crypto';
import { env } from '@/lib/env';
export const POST = route(async ({ req, ip }) => {
  const s = await requireUser();
  const c = await body(req, consentBody);
  unwrap(await s.db.from('consent_records').insert({ user_id: s.userId, ...c, ip_hash: sha256(ip + env().HASH_SALT), user_agent: req.headers.get('user-agent')?.slice(0, 400) ?? null }));
  return { ok: true };
});
export const OPTIONS = preflight;
