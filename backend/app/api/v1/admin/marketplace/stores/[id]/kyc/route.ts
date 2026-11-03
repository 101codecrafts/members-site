import { route, preflight, body } from '@/lib/http';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ req, params }) => { const s = await requireAdmin();
  const b = await body(req, z.object({ status: z.enum(['pending', 'verified', 'rejected', 'suspended']), note: z.string().max(2000).optional() }));
  return rpc(s.db, 'admin_set_store_kyc', { p_store: uuid.parse(params.id), p_status: b.status, p_note: b.note }); });
export const OPTIONS = preflight;
