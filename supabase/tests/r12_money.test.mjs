// Round 12 money: L1 (a buyer refund of a v2 marketplace payment cancels the vendor's escrow credit) and
// L2 (marketplace vendor earnings sit under the same payout hold as course earnings).
// Migration: 20261106010000_r12_money_l1_l2.sql
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;
let flw = 7100000;

const bal = async (db, where, p) => Number((await one(db, `select coalesce(sum(case when e.direction='credit' then e.amount_ugx else -e.amount_ugx end),0) b
  from public.ledger_entries e join public.ledger_accounts a on a.id=e.account_id where ${where}`, p)).b);
const vendorBal = (db) => bal(db, `a.owner_id=$1`, [U.tutorA]);
const acct = (db, code) => bal(db, `a.code=$1`, [code]);
const avail = async (db, u) => Number((await one(db, `select app.available_balance($1) v`, [u])).v);

async function shop(db, slug = 'r12m') {
  await as(db, U.tutorA);
  const st = await one(db, `insert into public.mkt_stores (slug, name) values ($1,'R12 Money Shop') returning id`, [slug + '-shop']);
  await as(db, U.admin); await q(db, `select public.admin_set_store_kyc($1,'verified')`, [st.id]);
  await as(db, U.tutorA);
  const p = await one(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx, status) values ($1,$2,'R12 kit','digital',40000,'pending_review') returning id`, [st.id, slug + '-kit']);
  await as(db, U.admin); await q(db, `update public.mkt_products set status='published' where id=$1`, [p.id]);
  return { store: st.id, product: p.id };
}
// alice buys the digital kit and pays; digital orders are 'delivered' at once (7-day auto-release clock)
async function buy(db) {
  const s = await shop(db);
  await as(db, U.alice);
  await q(db, `insert into public.mkt_cart_items (user_id, product_id, qty) values ($1,$2,1)`, [U.alice, s.product]);
  const co = (await one(db, `select public.mkt_checkout('{}'::jsonb) c`)).c;
  await as(db, 'service');
  await q(db, `select public.apply_flutterwave_payment($1,$2,'successful',$3,'UGX','mobilemoneyug')`, [co.tx_ref, ++flw, co.amount_ugx]);
  await as(db, 'postgres');
  co.order = (await one(db, `select id from public.mkt_orders where group_id=$1`, [co.group_id])).id;
  return co;
}
async function dueNow(db, co) {
  await as(db, 'postgres'); await q(db, `update public.mkt_orders set auto_release_at = now() - interval '1 second' where group_id=$1`, [co.group_id]);
  await as(db, 'service'); await q(db, `select public.mkt_release_due()`);
  await as(db, 'postgres');
}
async function refundFull(db, co) {
  await as(db, U.alice);
  const r = await one(db, `select * from public.request_refund($1, 'not as described')`, [co.payment_id]);
  await as(db, U.admin); await q(db, `select public.admin_issue_refund($1, null, 'ok', $2)`, [co.payment_id, r.id]);
  await as(db, 'service'); await q(db, `select public.complete_refund($1, true, $2)`, [r.id, ++flw]);
  await as(db, 'postgres');
  return r;
}

export const tests = [
  t('r12 L1: buyer refund before release takes the money out of escrow; auto-release never pays the vendor', async (db) => {
    const co = await buy(db);
    assert.equal(await acct(db, 'platform:escrow_marketplace'), 40000);
    await refundFull(db, co);
    await dueNow(db, co);
    const o = await one(db, `select status, released_at from public.mkt_orders where id=$1`, [co.order]);
    const p = await one(db, `select status, refunded_ugx::int r from public.payments where id=$1`, [co.payment_id]);
    assert.equal(o.status, 'refunded'); assert.ok(o.released_at);
    assert.deepEqual([p.status, p.r], ['refunded', 40000]);
    assert.equal(await vendorBal(db), 0, 'vendor credited nothing');
    assert.equal(await acct(db, 'platform:escrow_marketplace'), 0, 'escrow emptied by the refund');
    assert.equal(await acct(db, 'platform:refunds'), 0, 'platform revenue not charged for a marketplace refund');
    const lt = await one(db, `select sum(case when e.direction='debit' then e.amount_ugx else 0 end)::int d, sum(case when e.direction='credit' then e.amount_ugx else 0 end)::int c
      from public.ledger_entries e join public.ledger_transactions t on t.id=e.transaction_id where t.payment_id=$1 and t.kind='refund'`, [co.payment_id]);
    assert.deepEqual([lt.d, lt.c], [40000, 40000], 'refund transaction balanced');
  }),

  t('r12 L1: a pending refund freezes escrow (no auto-release, no buyer release, no dispute)', async (db) => {
    const co = await buy(db);
    await as(db, U.alice);
    await q(db, `select * from public.request_refund($1, 'changed my mind')`, [co.payment_id]);
    await dueNow(db, co);
    assert.equal((await one(db, `select status from public.mkt_orders where id=$1`, [co.order])).status, 'delivered', 'cron skipped it');
    await as(db, U.alice);
    await fails(db, `select public.mkt_confirm_delivery($1)`, [co.order], /pending refund/);
    await fails(db, `select public.mkt_open_dispute($1, 'refund', 'not what I ordered')`, [co.order], /refund of this purchase is already in progress/);
    await as(db, 'postgres');
    assert.equal(await vendorBal(db), 0);
  }),

  t('r12 L1: a failed refund lifts the freeze; escrow then releases normally', async (db) => {
    const co = await buy(db);
    await as(db, U.alice);
    const r = await one(db, `select * from public.request_refund($1, 'changed my mind')`, [co.payment_id]);
    await as(db, U.admin); await q(db, `select public.admin_issue_refund($1, null, 'ok', $2)`, [co.payment_id, r.id]);
    await as(db, 'service'); await q(db, `select public.complete_refund($1, false, null, 'provider error')`, [r.id]);
    await dueNow(db, co);
    assert.equal((await one(db, `select status from public.mkt_orders where id=$1`, [co.order])).status, 'completed');
    assert.equal(await vendorBal(db), 36000);
  }),

  t('r12 L1: refund after release (inside the window) claws back the vendor share and reverses the commission', async (db) => {
    const co = await buy(db);
    await dueNow(db, co);
    assert.equal(await vendorBal(db), 36000);
    assert.equal(await avail(db, U.tutorA), 0, 'L2: still held');
    const comm0 = await acct(db, 'platform:revenue_commission');
    await refundFull(db, co);
    assert.equal(await vendorBal(db), 0, 'vendor share clawed back');
    assert.equal(await acct(db, 'platform:refunds'), -4000, 'commission reversed via contra revenue');
    assert.equal(comm0, 4000);
    assert.equal((await one(db, `select status from public.mkt_orders where id=$1`, [co.order])).status, 'refunded');
    assert.equal(await avail(db, U.tutorA), 0);
  }),

  t('r12 L1: partial refunds and refunds of disputed orders are refused on the /refunds path', async (db) => {
    const co = await buy(db);
    await as(db, U.admin);
    await fails(db, `select public.admin_issue_refund($1, 10000, 'partial')`, [co.payment_id], /refunded in full here/);
    await as(db, U.alice);
    await q(db, `select public.mkt_open_dispute($1, 'refund', 'not what I ordered')`, [co.order]);
    await fails(db, `select public.request_refund($1, 'double dip')`, [co.payment_id], /has a dispute/);
    await as(db, U.admin);
    await fails(db, `select public.admin_issue_refund($1, null, 'double dip')`, [co.payment_id], /has a dispute/);
    // dispute settled as a refund: still no second refund through /refunds
    const d = await one(db, `select id from public.mkt_disputes where order_id=$1`, [co.order]);
    await q(db, `select public.admin_resolve_dispute($1, 'refund', null, 'ok')`, [d.id]);
    await as(db, U.alice);
    await fails(db, `select public.request_refund($1, 'double dip')`, [co.payment_id], /has a dispute/);
  }),

  t('r12 L1: course refunds keep the old path (payee share debited, platform part to contra revenue)', async (db) => {
    await as(db, U.alice);
    const c = await one(db, `select id from public.courses where slug='fullstack-nextjs-supabase'`);
    const co = (await one(db, `select public.create_checkout('course', $1) c`, [c.id])).c;
    await as(db, 'service'); await q(db, `select public.apply_flutterwave_payment($1,$2,'successful',$3,'UGX','mobilemoneyug')`, [co.tx_ref, ++flw, co.amount_ugx]);
    await as(db, 'postgres');
    const before = await vendorBal(db);
    assert.ok(before > 0);
    await refundFull(db, co);
    assert.equal(await vendorBal(db), 0);
    assert.equal((await one(db, `select status from public.enrollments where payment_id=$1`, [co.payment_id])).status, 'refunded');
  }),

  t('r12 L2: released marketplace earnings are held for the payout hold, then become withdrawable', async (db) => {
    const co = await buy(db);
    await dueNow(db, co);
    assert.equal(await vendorBal(db), 36000);
    assert.equal(await avail(db, U.tutorA), 0, 'inside the 14-day hold');
    await as(db, U.tutorA);
    await fails(db, `select public.request_payout(20000)`, [], /insufficient available balance|add a payout method/);
    await as(db, 'postgres');
    await q(db, `update public.payments set verified_at = now() - interval '15 days' where id=$1`, [co.payment_id]);
    assert.equal(await avail(db, U.tutorA), 36000, 'hold over');
  }),

  t('r12 L2: hold covers the vendor remainder of a partial dispute refund too', async (db) => {
    const co = await buy(db);
    await as(db, U.alice);
    await q(db, `select public.mkt_open_dispute($1, 'refund', 'half broken')`, [co.order]);
    await as(db, U.admin);
    const d = await one(db, `select id from public.mkt_disputes where order_id=$1`, [co.order]);
    await q(db, `select public.admin_resolve_dispute($1, 'refund', 20000, 'half')`, [d.id]);
    await as(db, 'postgres');
    assert.equal(await vendorBal(db), 18000);
    assert.equal(await avail(db, U.tutorA), 0);
  }),

  t('r12 money helpers are not callable by API roles', async (db) => {
    await as(db, 'postgres');
    const r = await q(db, `select p.proname, r.rolname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join (values ('anon'),('authenticated')) r(rolname)
      where n.nspname='app' and p.proname in ('mkt_group_of_payment','mkt_group_refund_pending','mkt_refund_guard')
        and has_function_privilege(r.rolname, p.oid, 'execute')`);
    assert.deepEqual(r, []);
  }),
];
