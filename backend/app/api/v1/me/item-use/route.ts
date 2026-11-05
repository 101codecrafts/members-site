import { route, preflight, body } from '@/lib/http';
import { requireMember } from '@/lib/auth';
import { itemUseBody } from '@/lib/plans-validation';
import { recordItemUse } from '@/services/billing';
/** Records that the caller opened a book/resource/external course through 101 (the evidence item ratings need). */
export const POST = route(async ({ req }) => { const s = await requireMember(); const b = await body(req, itemUseBody); return recordItemUse(s, b.kind, b.id); });
export const OPTIONS = preflight;
