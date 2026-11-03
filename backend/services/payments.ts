import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';
import { flutterwave, verifyFlutterwaveSignature } from '@/lib/flutterwave';
import { decryptSecret } from '@/lib/crypto';
import { env } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { rpc } from '@/repositories/rpc';
import { sendEmails, templates } from '@/lib/email';
import type { Logger } from '@/lib/logger';

/**
 * Applies a Flutterwave transaction by id, using ONLY data returned by the
 * /verify endpoint (SR-16). Idempotent end to end.
 */
export async function reconcileTransaction(flwId: number, log: Logger): Promise<string> {
  const e = env();
  const v = await flutterwave(e.FLW_SECRET_KEY).verify(flwId);
  const db = serviceClient();
  const known = (await db.from('payments').select('id').eq('tx_ref', v.tx_ref).maybeSingle()).data;
  let paymentStatus: string;
  if (!known && v.plan) {
    const p = await rpc(db, 'record_subscription_renewal', { p_flw_plan_id: v.plan, p_customer_email: v.customer.email, p_flw_id: v.id,
      p_tx_ref: v.tx_ref, p_amount: v.amount, p_currency: v.currency, p_raw: { status: v.status, payment_type: v.payment_type } });
    paymentStatus = p.status;
  } else {
    const status = v.status === 'successful' ? 'successful' : v.status === 'failed' ? 'failed' : 'pending';
    if (status === 'pending') return 'pending';
    const p = await rpc(db, 'apply_flutterwave_payment', { p_tx_ref: v.tx_ref, p_flw_id: v.id, p_status: status, p_amount: v.amount,
      p_currency: v.currency, p_payment_type: v.payment_type, p_raw: { status: v.status, payment_type: v.payment_type, amount: v.amount, charged_amount: v.charged_amount } });
    paymentStatus = p.status;
  }
  if (paymentStatus === 'successful') await sendReceipt(v.tx_ref, log);
  return paymentStatus;
}

async function sendReceipt(txRef: string, log: Logger): Promise<void> {
  const e = env();
  const db = serviceClient();
  const p = (await db.from('payments').select('id, user_id, amount_ugx, purpose, verified_at').eq('tx_ref', txRef).single()).data;
  if (!p?.user_id) return;
  const inv = (await db.from('invoices').select('id, number, emailed_at').eq('payment_id', p.id).maybeSingle()).data;
  if (!inv || inv.emailed_at) return;          // idempotent: one receipt per invoice
  const contact = (await db.from('profile_private').select('email').eq('user_id', p.user_id).maybeSingle()).data;
  const prof = (await db.from('profiles').select('display_name').eq('id', p.user_id).maybeSingle()).data;
  if (!contact?.email) return;
  const sent = await sendEmails(e.RESEND_API_KEY, e.RESEND_FROM, [{ to: contact.email, ...templates.receipt({ name: prof?.display_name || 'there', invoice: inv.number,
    amount: p.amount_ugx, item: p.purpose.replace('_', ' '), date: (p.verified_at ?? new Date().toISOString()).slice(0, 10) }, e.APP_URL) }]);
  if (sent) await db.from('invoices').update({ emailed_at: new Date().toISOString() }).eq('id', inv.id);
  log.info('receipt_sent', { invoice: inv.number, sent });
}

/** Records an inbound webhook once; returns false when it is a duplicate. */
export async function recordWebhook(provider: 'clerk' | 'flutterwave', eventId: string, type: string | null, valid: boolean, payload: unknown): Promise<boolean> {
  const { error } = await serviceClient().from('webhook_events').insert({ provider, event_id: eventId, event_type: type, signature_valid: valid, payload: payload as never });
  if (error?.code === '23505') return false;
  if (error) throw error;
  return true;
}
export async function markWebhook(provider: 'clerk' | 'flutterwave', eventId: string, err?: string): Promise<void> {
  await serviceClient().from('webhook_events').update({ processed_at: err ? null : new Date().toISOString(), error: err ?? null }).eq('provider', provider).eq('event_id', eventId);
}

interface FlwEvent { event?: string; 'event.type'?: string; data?: { id?: number; tx_ref?: string; reference?: string; status?: string } }

export async function handleFlutterwaveWebhook(rawBody: string, headers: Headers, log: Logger): Promise<{ ok: boolean; duplicate?: boolean }> {
  const e = env();
  if (!verifyFlutterwaveSignature(headers, rawBody, e.FLW_SECRET_HASH)) throw new AppError('unauthenticated', 'Invalid signature');
  let evt: FlwEvent;
  try { evt = JSON.parse(rawBody) as FlwEvent; } catch { throw new AppError('bad_request', 'Invalid JSON'); }
  const type = evt.event ?? evt['event.type'] ?? 'unknown';
  const id = Number(evt.data?.id);
  const eventId = `${type}:${evt.data?.id ?? evt.data?.reference ?? evt.data?.tx_ref ?? 'na'}:${evt.data?.status ?? ''}`;
  const fresh = await recordWebhook('flutterwave', eventId, type, true, { event: type, id: evt.data?.id, tx_ref: evt.data?.tx_ref, reference: evt.data?.reference, status: evt.data?.status });
  if (!fresh) return { ok: true, duplicate: true };
  try {
    if (type.startsWith('transfer')) {
      const ref = evt.data?.reference;
      if (!ref) throw new AppError('bad_request', 'missing transfer reference');
      // verify the transfer server-side
      const t = await fetch(`https://api.flutterwave.com/v3/transfers/${id}`, { headers: { authorization: `Bearer ${e.FLW_SECRET_KEY}` }, cache: 'no-store' })
        .then((r) => r.json() as Promise<{ data?: { status?: string; reference?: string; complete_message?: string } }>);
      const ok = t.data?.status === 'SUCCESSFUL' && t.data.reference === ref;
      const failed = t.data?.status === 'FAILED';
      if (ok || failed) await rpc(serviceClient(), 'complete_payout', { p_reference: ref, p_success: ok, p_failure: failed ? t.data?.complete_message ?? 'failed' : undefined, p_raw: { status: t.data?.status } });
    } else if (Number.isSafeInteger(id) && id > 0) {
      await reconcileTransaction(id, log);
    }
    await markWebhook('flutterwave', eventId);
    return { ok: true };
  } catch (err) {
    await markWebhook('flutterwave', eventId, err instanceof Error ? err.message.slice(0, 500) : 'error');
    throw err;
  }
}

/** Runs an admin-approved payout: decrypt destination → Flutterwave Transfer. */
export async function executePayout(payoutId: string, log: Logger) {
  const e = env();
  if (!e.PAYOUT_ENCRYPTION_KEY) throw new AppError('upstream_error', 'Payout encryption key not configured');
  const db = serviceClient();
  const po = (await db.from('payouts').select('id, tutor_id, amount_ugx, status, reference, method_id').eq('id', payoutId).single()).data;
  if (!po || po.status !== 'approved') throw new AppError('unprocessable', 'Payout is not approved');
  const m = (await db.from('payout_methods').select('kind, provider_code, network, account_name, account_ciphertext').eq('id', po.method_id).single()).data;
  if (!m) throw new AppError('not_found', 'Payout method missing');
  const account = decryptSecret(m.account_ciphertext, { [e.PAYOUT_ENCRYPTION_KEY_ID]: e.PAYOUT_ENCRYPTION_KEY });
  const t = await flutterwave(e.FLW_SECRET_KEY).transfer({
    reference: po.reference, amount: po.amount_ugx, account_bank: m.kind === 'mobile_money' ? 'MPS' : m.provider_code,
    account_number: account, beneficiary_name: m.account_name, narration: '101 Codecrafts tutor payout', callback_url: e.FLW_PAYOUT_CALLBACK_URL,
  });
  await rpc(db, 'mark_payout_processing', { p_payout_id: po.id, p_flw_transfer_id: t.id });
  log.info('payout_initiated', { payout_id: po.id, transfer_id: t.id });
  return { transfer_id: t.id, status: t.status };
}

/** Runs an admin-approved refund at Flutterwave and posts the ledger. */
export async function executeRefund(refundId: string, log: Logger) {
  const e = env();
  const db = serviceClient();
  const r = (await db.from('refunds').select('id, payment_id, amount_ugx, status').eq('id', refundId).single()).data;
  if (!r || r.status !== 'processing') throw new AppError('unprocessable', 'Refund is not approved');
  const p = (await db.from('payments').select('flw_transaction_id, provider').eq('id', r.payment_id).single()).data;
  if (p?.provider === 'coupon' || !p?.flw_transaction_id) {
    return rpc(db, 'complete_refund', { p_refund_id: r.id, p_success: true, p_raw: { note: 'no gateway charge' } });
  }
  try {
    const res = await flutterwave(e.FLW_SECRET_KEY).refund(p.flw_transaction_id, r.amount_ugx);
    log.info('refund_executed', { refund_id: r.id, flw_refund_id: res.id });
    return rpc(db, 'complete_refund', { p_refund_id: r.id, p_success: true, p_flw_refund_id: res.id, p_raw: { status: res.status } });
  } catch (err) {
    return rpc(db, 'complete_refund', { p_refund_id: r.id, p_success: false, p_failure: err instanceof Error ? err.message.slice(0, 300) : 'failed' });
  }
}
