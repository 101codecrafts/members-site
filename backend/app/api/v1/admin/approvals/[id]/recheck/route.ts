import { route, preflight } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { z } from 'zod';
import { requireScope } from '@/services/admin-console';
import { checkSubmission } from '@/services/link-check';
/** Re-run the link checks for one submission (scope: approvals). */
export const POST = route<{ id: string }>(async ({ params }) => {
  const s = await requireAdmin();
  await requireScope(s, 'approvals');
  return (await checkSubmission(z.string().uuid().parse(params.id))) ?? { level: 'unchecked', flags: [] };
}, { rateLimit: { name: 'admin-recheck', max: 60, windowSeconds: 600 } });
export const OPTIONS = preflight;
