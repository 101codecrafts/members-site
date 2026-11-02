import { route, preflight, query, body, unwrap } from '@/lib/http';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
/** Admin allow/deny list (e.g. allow students.cavendish.ac.ug). */
export const GET = route(async () => { const s = await requireAdmin(); return unwrap(await s.db.from('email_domain_rules').select('*').order('domain')); });
export const POST = route(async ({ req }) => { const s = await requireAdmin();
  const b = await body(req, z.object({ domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/), rule: z.enum(['allow', 'deny']), note: z.string().max(200).optional() }));
  return unwrap(await s.db.from('email_domain_rules').upsert({ ...b, created_by: s.userId }).select().single()); });
export const DELETE = route(async ({ req }) => { const s = await requireAdmin(); const b = query(req, z.object({ domain: z.string().max(253) }));
  unwrap(await s.db.from('email_domain_rules').delete().eq('domain', b.domain).select()); return { removed: true }; });
export const OPTIONS = preflight;
