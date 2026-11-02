import { route, preflight, body, query, unwrap } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { z } from 'zod';
import { pagination } from '@/lib/validation';
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const p = query(req, pagination.extend({ status: z.enum(['pending', 'active', 'suspended', 'banned']).optional(), q: z.string().max(80).optional(),
    level: z.enum(['primary', 'o_level', 'a_level', 'university', 'professional']).optional() }));
  let q = s.db.from('profiles').select('id, username, display_name, account_status, education_level, is_minor, joined_at, last_seen_at, created_at, user_roles(role)', { count: 'exact' })
    .order('created_at', { ascending: false }).range(p.offset, p.offset + p.limit - 1);
  if (p.status) q = q.eq('account_status', p.status);
  if (p.level) q = q.eq('education_level', p.level);
  if (p.q) q = q.ilike('display_name', `%${p.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const r = await q;
  return { rows: unwrap(r), total: r.count ?? 0 };
});
export const OPTIONS = preflight;
