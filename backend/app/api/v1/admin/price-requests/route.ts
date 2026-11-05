import { route, preflight } from '@/lib/http';
import { requireAdmin } from '@/lib/auth';
import { priceRequestQueue } from '@/services/billing';
/** Tutor price requests waiting for review (?status=pending|approved|rejected). */
export const GET = route(async ({ req }) => {
  const s = await requireAdmin();
  const st = req.nextUrl.searchParams.get('status') ?? 'pending';
  return priceRequestQueue(s, ['pending', 'approved', 'rejected'].includes(st) ? st : 'pending');
});
export const OPTIONS = preflight;
