import { route, preflight, unwrap } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { uuid } from '@/lib/validation';
export const POST = route<{ id: string }>(async ({ params }) => { const s = await requireUser();
  unwrap(await s.db.from('announcement_reads').upsert({ announcement_id: uuid.parse(params.id), user_id: s.userId }, { ignoreDuplicates: true }).select()); return { read: true }; });
export const OPTIONS = preflight;
