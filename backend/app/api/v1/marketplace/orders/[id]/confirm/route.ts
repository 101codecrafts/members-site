import { route, preflight } from '@/lib/http';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { uuid } from '@/lib/validation';
/** Buyer confirms delivery -> escrow released to the vendor minus commission. */
export const POST = route<{ id: string }>(async ({ params }) => { const s = await requireUser(); return rpc(s.db, 'mkt_confirm_delivery', { p_order: uuid.parse(params.id) }); });
export const OPTIONS = preflight;
