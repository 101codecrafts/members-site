// Marketplace v2: vendor isolation, KYC gate, server-priced checkout, escrow ledger, disputes, downloads, reviews, /go.
import assert from 'node:assert/strict';
import { U, helpers } from './rls.test.mjs';

const { as, q, one, fails, t } = helpers;

async function shop(db) {
  await as(db, U.tutorA);
  const st = await one(db, `insert into public.mkt_stores (slug, name) values ('amina-tech','Amina Tech') returning id, kyc_status`);
  assert.equal(st.kyc_status, 'pending');
  await fails(db, `update public.mkt_stores set kyc_status='verified' where id=$1`, [st.id], '42501');
  await fails(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx, status) values ($1,'x-early','Early','digital',10000,'published')`, [st.id], /KYC|admin after review/);
  await as(db, U.admin);
  await q(db, `select public.admin_set_store_kyc($1,'verified')`, [st.id]);
  await as(db, U.tutorA);
  // r11 plans: sellers submit listings for review; only an admin publishes them
  await fails(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx, status) values ($1,'self-pub','Self','digital',20000,'published')`, [st.id], /admin after review/);
  const dig = await one(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx, status) values ($1,'react-kit','React UI kit','digital',20000,'pending_review') returning id`, [st.id]);
  await q(db, `insert into public.mkt_digital_assets (product_id, storage_path, filename) values ($1, 'mkt/react-kit.zip', 'react-kit.zip')`, [dig.id]);
  const phy = await one(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx, stock, moq, status) values ($1,'esp32','ESP32 board','physical',30000,10,2,'pending_review') returning id`, [st.id]);
  await q(db, `insert into public.mkt_price_tiers (product_id, min_qty, unit_price_ugx) values ($1, 5, 25000)`, [phy.id]);
  await as(db, U.admin);
  await q(db, `update public.mkt_products set status='published' where id = any($1::uuid[])`, [[dig.id, phy.id]]);
  await as(db, U.tutorA);
  return { store: st.id, dig: dig.id, phy: phy.id };
}
const ledgerZero = async (db) => {
  await as(db, 'postgres');
  const b = await one(db, `select coalesce(sum(case when direction='debit' then amount_ugx else -amount_ugx end),0) d from public.ledger_entries`);
  assert.equal(Number(b.d), 0, 'ledger balanced');
};

export const tests = [
  t('marketplace: KYC gate, vendor isolation, other vendors cannot edit products', async (db) => {
    const s = await shop(db);
    await as(db, U.tutorB);
    await fails(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx) values ($1,'hijack','Hijack','digital',1000)`, [s.store], /not your store|row-level/);
    const upd = await q(db, `update public.mkt_products set price_ugx=500 where id=$1 returning id`, [s.dig]);
    assert.equal(upd.length, 0);
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.mkt_products`)).length, 2);
    await fails(db, `select * from public.mkt_digital_assets`, [], '42501');
    await as(db, U.alice);
    assert.equal((await q(db, `select 1 from public.mkt_digital_assets`)).length, 0, 'buyers never read asset paths directly');
    await fails(db, `insert into public.mkt_stores (slug, name) values ('kid-shop','Kid')`, [], /row-level/).catch(() => {});
  }),

  t('marketplace: checkout is server-priced (tiers, MOQ, shipping); payment → escrow; confirm → release minus commission', async (db) => {
    const s = await shop(db);
    await as(db, U.alice);
    await q(db, `insert into public.mkt_cart_items (user_id, product_id, qty) values ($1,$2,1)`, [U.alice, s.phy]);
    await fails(db, `select public.mkt_checkout('{}'::jsonb)`, [], /minimum order quantity/);
    await q(db, `update public.mkt_cart_items set qty=5 where product_id=$1`, [s.phy]);
    await fails(db, `select public.mkt_checkout('{}'::jsonb)`, [], /shipping option/);
    const zone = await one(db, `select id from public.mkt_shipping_zones where method='boda' order by fee_ugx limit 1`);
    const co = (await one(db, `select public.mkt_checkout($1::jsonb) c`, [JSON.stringify({ [s.store]: { zone_id: zone.id, address: { area: 'Ntinda' } } })])).c;
    assert.equal(co.amount_ugx, 5 * 25000 + 5000, 'tier price + boda fee');
    assert.equal((await q(db, `select 1 from public.mkt_cart_items`)).length, 0, 'cart cleared');
    await as(db, 'service');
    await q(db, `select public.apply_flutterwave_payment($1, 7001, 'successful', $2, 'UGX', 'mobilemoneyug')`, [co.tx_ref, co.amount_ugx]);
    await ledgerZero(db);
    const esc = await one(db, `select coalesce(sum(case when e.direction='credit' then e.amount_ugx else -e.amount_ugx end),0) b
      from public.ledger_entries e join public.ledger_accounts a on a.id=e.account_id where a.code='platform:escrow_marketplace'`);
    assert.equal(Number(esc.b), 130000, 'held in escrow');
    const o = await one(db, `select id, status from public.mkt_orders where group_id=$1`, [co.group_id]);
    assert.equal(o.status, 'paid');
    assert.equal((await one(db, `select stock from public.mkt_products where id=$1`, [s.phy])).stock, 5);
    await as(db, U.alice);
    await fails(db, `select public.mkt_confirm_delivery($1)`, [o.id], /not shipped/);
    await fails(db, `select public.mkt_vendor_update_order($1,'shipped')`, [o.id], /not found/);
    await as(db, U.tutorA);
    await q(db, `select public.mkt_vendor_update_order($1,'shipped','SafeBoda','SB123')`, [o.id]);
    await as(db, U.alice);
    await q(db, `select public.mkt_confirm_delivery($1)`, [o.id]);
    await ledgerZero(db);
    const pay = await one(db, `select coalesce(sum(case when e.direction='credit' then e.amount_ugx else -e.amount_ugx end),0) b
      from public.ledger_entries e join public.ledger_accounts a on a.id=e.account_id where a.owner_id=$1`, [U.tutorA]);
    assert.equal(Number(pay.b), 130000 - 13000, 'vendor credited net of 10% commission');
    // verified purchase review
    await as(db, U.alice);
    await q(db, `insert into public.mkt_reviews (product_id, user_id, order_id, rating, body) values ($1,$2,$3,5,'Great')`, [s.phy, U.alice, o.id]);
    await as(db, U.bob);
    await fails(db, `insert into public.mkt_reviews (product_id, user_id, order_id, rating) values ($1,$2,$3,1)`, [s.phy, U.bob, o.id], /verified buyers/);
    await as(db, U.bob);
    assert.equal((await q(db, `select 1 from public.mkt_orders`)).length, 0, 'other buyers see no orders');
  }),

  t('marketplace: dispute blocks auto-release; admin refund moves escrow to refunds payable; digital downloads buyer-only + capped', async (db) => {
    const s = await shop(db);
    await as(db, U.alice);
    await q(db, `insert into public.mkt_cart_items (user_id, product_id, qty) values ($1,$2,1)`, [U.alice, s.dig]);
    const co = (await one(db, `select public.mkt_checkout('{}'::jsonb) c`)).c;
    assert.equal(co.amount_ugx, 20000);
    await as(db, 'service');
    await q(db, `select public.apply_flutterwave_payment($1, 7002, 'successful', 20000, 'UGX', 'mobilemoneyug')`, [co.tx_ref]);
    await as(db, U.alice);
    const o = await one(db, `select id, status from public.mkt_orders where group_id=$1`, [co.group_id]);
    assert.equal(o.status, 'delivered', 'digital delivered instantly');
    const item = await one(db, `select id from public.mkt_order_items where order_id=$1`, [o.id]);
    const dl = (await one(db, `select public.mkt_download($1) d`, [item.id])).d;
    assert.equal(dl.files[0].path, 'mkt/react-kit.zip');
    await as(db, U.bob);
    await fails(db, `select public.mkt_download($1)`, [item.id], /not found/);
    await as(db, U.alice);
    await q(db, `select public.mkt_open_dispute($1,'not_as_described','Files are corrupted')`, [o.id]);
    await as(db, 'postgres');
    await q(db, `update public.mkt_orders set auto_release_at = now() - interval '1 day' where id=$1`, [o.id]);
    await as(db, 'service');
    assert.equal((await one(db, `select public.mkt_release_due() n`)).n, 0, 'disputed order not released');
    await as(db, U.alice);
    await fails(db, `select public.admin_resolve_dispute(id,'refund') from public.mkt_disputes`, [], '42501');
    await as(db, U.admin);
    await q(db, `select public.admin_resolve_dispute(id,'refund') from public.mkt_disputes where order_id=$1`, [o.id]);
    await ledgerZero(db);
    const r = await one(db, `select coalesce(sum(case when e.direction='credit' then e.amount_ugx else -e.amount_ugx end),0) b
      from public.ledger_entries e join public.ledger_accounts a on a.id=e.account_id where a.code='platform:refunds_payable'`);
    assert.equal(Number(r.b), 20000);
  }),

  t('external products: only approved are public; /go click logging is service-only', async (db) => {
    await as(db, U.admin);
    const e = await one(db, `insert into public.external_products (source, title, url, approved) values ('jumia','Laptop stand','https://www.jumia.ug/x', true) returning id`);
    await q(db, `insert into public.external_products (source, title, url) values ('amazon','Hidden item','https://amazon.com/y')`);
    await as(db, 'anon');
    assert.equal((await q(db, `select 1 from public.external_products`)).length, 1);
    await fails(db, `select public.external_product_go($1)`, [e.id], '42501');
    await as(db, 'service');
    assert.equal((await one(db, `select public.external_product_go($1, null, 'iphash') u`, [e.id])).u, 'https://www.jumia.ug/x');
    assert.equal((await one(db, `select clicks from public.external_products where id=$1`, [e.id])).clicks, 1);
  }),
];
