import { NextResponse } from 'next/server';
import { route, preflight } from '@/lib/http';
import { reconcileTransaction } from '@/services/payments';
/**
 * Flutterwave redirect target. We never trust its query string: if a
 * transaction id is present we re-verify server-side (same idempotent path as
 * the webhook), then send the user back to the dashboard.
 */
export const GET = route(async ({ req, log }) => {
  const id = Number(req.nextUrl.searchParams.get('transaction_id'));
  let state = 'pending';
  if (Number.isSafeInteger(id) && id > 0) state = await reconcileTransaction(id, log).catch(() => 'pending');
  return NextResponse.redirect(new URL(`/dashboard.html#payments?status=${encodeURIComponent(state)}`, req.url), 302);
});
export const OPTIONS = preflight;
