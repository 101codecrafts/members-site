// Round 12 logic — money and state-machine invariants (property-based where the input space is large).
// Each check throws a CounterExample when the promised invariant is violated. Deterministic PRNG (seed below), so every
// counterexample replays exactly. Uses the same fixtures and role impersonation as supabase/tests/rls.test.mjs.
import { U, helpers } from '../rls.test.mjs';

const { begin, as, q, one } = helpers;
const SEED = Number(process.env.LOGIC_SEED ?? 20261105);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

class CounterExample extends Error { constructor(m) { super(m); this.counterexample = true; } }
const must = (cond, msg) => { if (!cond) throw new CounterExample(msg); };
const inv = (id, name, run) => ({ id, name, run: async (db) => { await begin(db); await run(db); } });
const sp = async (db, fn) => { await db.query('savepoint p'); try { return await fn(); } finally { await db.query('rollback to savepoint p'); } };
const L3 = 'user_logic_l3', G = 'user_logic_guest';

async function extraUsers(db) {
  await as(db, 'postgres');
  await db.query(`
    insert into public.profiles (id, display_name, account_status, joined_at) values ('${L3}','Learner Three','active',now()), ('${G}','Guest Gabi','active',now()) on conflict do nothing;
    insert into public.profile_private (user_id, email, date_of_birth) values ('${L3}','l3@example.com','1999-02-02'), ('${G}','gg@example.com',null) on conflict do nothing;
    insert into public.user_roles (user_id, role) values ('${L3}','learner'), ('${G}','guest') on conflict do nothing;`);
}
const balanceOf = async (db, user) => Number((await one(db, `select coalesce(sum(case when e.direction='credit' then e.amount_ugx else -e.amount_ugx end),0) b
  from public.ledger_entries e join public.ledger_accounts a on a.id=e.account_id where a.owner_id=$1`, [user])).b);
const accountBal = async (db, code) => Number((await one(db, `select coalesce(sum(case when e.direction='credit' then e.amount_ugx else -e.amount_ugx end),0) b
  from public.ledger_entries e join public.ledger_accounts a on a.id=e.account_id where a.code=$1`, [code])).b);
async function pay(db, txRef, amount, flwId) { await as(db, 'service'); return one(db, `select * from public.apply_flutterwave_payment($1,$2,'successful',$3,'UGX','mobilemoneyug')`, [txRef, flwId, amount]); }
let flw = 900000;

async function digitalShop(db) {
  await as(db, U.tutorA);
  const st = await one(db, `insert into public.mkt_stores (slug, name) values ('logic-shop','Logic Shop') returning id`);
  await as(db, U.admin); await q(db, `select public.admin_set_store_kyc($1,'verified')`, [st.id]);
  await as(db, U.tutorA);
  const p = await one(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx, status) values ($1,'logic-kit','Logic kit','digital',40000,'pending_review') returning id`, [st.id]);
  await as(db, U.admin); await q(db, `update public.mkt_products set status='published' where id=$1`, [p.id]);
  return { store: st.id, product: p.id };
}

export const tests = [
  // ---------------------------------------------------------------- M1 -----
  inv('M1', 'marketplace v2: a refunded order is never also released to the vendor (cash out <= cash in)', async (db) => {
    const s = await digitalShop(db);
    await as(db, U.alice);
    await q(db, `insert into public.mkt_cart_items (user_id, product_id, qty) values ($1,$2,1)`, [U.alice, s.product]);
    const co = (await one(db, `select public.mkt_checkout('{}'::jsonb) c`)).c;
    await pay(db, co.tx_ref, co.amount_ugx, ++flw);
    await as(db, U.alice);
    const r = await one(db, `select * from public.request_refund($1, 'not as described')`, [co.payment_id]);
    await as(db, U.admin); await q(db, `select public.admin_issue_refund($1, null, 'ok', $2)`, [co.payment_id, r.id]);
    await as(db, 'service'); await q(db, `select public.complete_refund($1, true, 1)`, [r.id]);
    await as(db, 'postgres'); await q(db, `update public.mkt_orders set auto_release_at = now() - interval '1 second' where group_id=$1`, [co.group_id]);
    await as(db, 'service'); await q(db, `select public.mkt_release_due()`);
    await as(db, 'postgres');
    const vendor = await balanceOf(db, U.tutorA);
    const refunded = Number((await one(db, `select refunded_ugx from public.payments where id=$1`, [co.payment_id])).refunded_ugx);
    const o = await one(db, `select status from public.mkt_orders where group_id=$1`, [co.group_id]);
    must(vendor + refunded <= co.amount_ugx,
      `paid ${co.amount_ugx}; buyer refunded ${refunded} AND vendor payable credited ${vendor} (order status '${o.status}'). request_refund/complete_refund `
      + `do not know mkt_order_groups: escrow is still released by mkt_release_due.`);
  }),

  // ---------------------------------------------------------------- M2 -----
  inv('M2', 'advertised plan commission (tutor commission.pct / seller.fee_pct) is what checkout charges', async (db) => {
    await as(db, U.alice);
    const c = await one(db, `select id from public.courses where slug='fullstack-nextjs-supabase'`);
    const co = (await one(db, `select public.create_checkout('course', $1) c`, [c.id])).c;
    await as(db, 'postgres');
    const p = await one(db, `select commission_pct, platform_fee_ugx, amount_ugx from public.payments where tx_ref=$1`, [co.tx_ref]);
    const plan = await one(db, `select app.user_plan($1,'tutor')::text plan, app.plan_limit('tutor', app.user_plan($1,'tutor'), 'commission.pct') adv`, [U.tutorA]);
    must(Number(p.commission_pct) === Number(plan.adv),
      `tutor on '${plan.plan}' plan is advertised ${plan.adv}% commission; checkout charged ${p.commission_pct}% (fee ${p.platform_fee_ugx} of ${p.amount_ugx}). `
      + `create_checkout reads site_settings.commission_pct, never plan_tiers.limits.`);
  }),

  // ---------------------------------------------------------------- M3 -----
  inv('M3', 'fee split property: for random prices and commission overrides, 0<=fee<=amount, fee+share=amount, |fee-exact|<=0.5', async (db) => {
    const r = rng(SEED);
    await as(db, 'postgres');
    const c = await one(db, `select id from public.courses where slug='fullstack-nextjs-supabase'`);
    for (let i = 0; i < 60; i++) {
      const price = i < 4 ? [1000, 1001, 99999999, 33333][i] : int(r, 1000, 5_000_000);
      const pct = i < 4 ? [0, 100, 33.33, 0.01][i] : int(r, 0, 10000) / 100;
      await sp(db, async () => {
        await as(db, 'postgres');
        await q(db, `update public.courses set price_ugx=$2, is_free=false where id=$1`, [c.id, price]);
        await q(db, `update public.tutor_profiles set commission_pct_override=$2 where user_id=$1`, [U.tutorA, pct]);
        await as(db, U.alice);
        const co = (await one(db, `select public.create_checkout('course', $1) c`, [c.id])).c;
        await as(db, 'postgres');
        const p = await one(db, `select amount_ugx::bigint a, platform_fee_ugx::bigint f, payee_share_ugx::bigint s from public.payments where tx_ref=$1`, [co.tx_ref]);
        const a = Number(p.a), f = Number(p.f), s = Number(p.s), exact = a * pct / 100;
        must(f >= 0 && f <= a && f + s === a && Math.abs(f - exact) <= 0.5,
          `seed ${SEED} i=${i}: price ${price}, pct ${pct}: amount ${a}, fee ${f}, share ${s}, exact ${exact}`);
      });
    }
  }),

  // ---------------------------------------------------------------- M4 -----
  inv('M4', 'partial refunds inside the hold window: available balance stays 0 (every UGX of earnings is held)', async (db) => {
    const r = rng(SEED + 4);
    await as(db, 'postgres');
    const c = await one(db, `select id from public.courses where slug='fullstack-nextjs-supabase'`);
    let worst = null;
    for (let i = 0; i < 25; i++) {
      await sp(db, async () => {
        await as(db, 'postgres');
        const price = int(r, 1000, 300000);
        await q(db, `update public.courses set price_ugx=$2 where id=$1`, [c.id, price]);
        await q(db, `update public.tutor_profiles set commission_pct_override=$2 where user_id=$1`, [U.tutorA, int(r, 0, 5000) / 100]);
        await as(db, U.alice);
        const co = (await one(db, `select public.create_checkout('course', $1) c`, [c.id])).c;
        await pay(db, co.tx_ref, co.amount_ugx, ++flw);
        let left = co.amount_ugx; const parts = [];
        for (let k = int(r, 2, 5); k > 0 && left > 1; k--) {
          const amt = int(r, 1, Math.max(1, Math.floor(left / 2)));
          await as(db, U.root);   // root: no super-admin threshold surprises
          const rf = await one(db, `select * from public.admin_issue_refund($1, $2, 'partial')`, [co.payment_id, amt]);
          await as(db, 'service'); await q(db, `select public.complete_refund($1, true, $2)`, [rf.id, ++flw]);
          left -= amt; parts.push(amt);
        }
        await as(db, 'postgres');
        const bal = await balanceOf(db, U.tutorA);
        const avail = Number((await one(db, `select app.available_balance($1) v`, [U.tutorA])).v);
        if (bal < 0) worst = worst ?? `seed ${SEED + 4} i=${i}: negative payable ${bal} after refunds ${parts}`;
        if (avail > 0) worst = worst ?? `seed ${SEED + 4} i=${i}: price ${price}, refunds ${JSON.stringify(parts)}: payable ${bal}, available ${avail} UGX withdrawable while still inside the hold window `
          + `(available_balance uses floor(refunded*share/amount) once; complete_refund floors each part: sum of floors < floor of sum).`;
      });
    }
    must(!worst, worst);
  }),

  // ---------------------------------------------------------------- M5 -----
  inv('M5', 'marketplace vendor earnings respect payouts.hold_days like course earnings', async (db) => {
    const s = await digitalShop(db);
    await as(db, U.alice);
    await q(db, `insert into public.mkt_cart_items (user_id, product_id, qty) values ($1,$2,1)`, [U.alice, s.product]);
    const co = (await one(db, `select public.mkt_checkout('{}'::jsonb) c`)).c;
    await pay(db, co.tx_ref, co.amount_ugx, ++flw);
    await as(db, 'postgres'); await q(db, `update public.mkt_orders set auto_release_at = now() - interval '1 second' where group_id=$1`, [co.group_id]);
    await as(db, 'service'); await q(db, `select public.mkt_release_due()`);
    await as(db, 'postgres');
    const avail = Number((await one(db, `select app.available_balance($1) v`, [U.tutorA])).v);
    must(avail === 0, `payment verified seconds ago, refund window (14 d) still open, yet vendor can withdraw ${avail} UGX now: `
      + `available_balance only holds payments with payee_id = vendor; marketplace payments have payee_id NULL.`);
  }),

  // ---------------------------------------------------------------- S1 -----
  inv('S1', 'tutor students.max (Free = 2) also caps PAID enrolments', async (db) => {
    await extraUsers(db);
    await as(db, 'postgres');
    const c = await one(db, `select id from public.courses where slug='fullstack-nextjs-supabase'`);
    const cap = Number((await one(db, `select app.plan_limit('tutor', app.user_plan($1,'tutor'), 'students.max') v`, [U.tutorA])).v);
    for (const u of [U.alice, U.bob, L3]) {
      await as(db, u);
      const co = (await one(db, `select public.create_checkout('course', $1) c`, [c.id])).c;
      await pay(db, co.tx_ref, co.amount_ugx, ++flw);
    }
    await as(db, 'postgres');
    const n = Number((await one(db, `select app.tutor_student_count($1) v`, [U.tutorA])).v);
    must(n <= cap, `tutor plan cap students.max=${cap}, but ${n} students enrolled: create_checkout never calls can_enroll and guard_enrollment_plan skips rows with payment_id.`);
  }),

  // ---------------------------------------------------------------- S2 -----
  inv('S2', 'a fully refunded course leaves no certificate behind', async (db) => {
    await as(db, U.alice);
    const c = await one(db, `select id from public.courses where slug='fullstack-nextjs-supabase'`);
    const co = (await one(db, `select public.create_checkout('course', $1) c`, [c.id])).c;
    await pay(db, co.tx_ref, co.amount_ugx, ++flw);
    await as(db, 'postgres');
    await q(db, `update public.enrollments set status='completed', completed_at=now(), progress_pct=100 where user_id=$1 and course_id=$2`, [U.alice, c.id]);
    await as(db, U.alice);
    const r = await one(db, `select * from public.request_refund($1, 'changed my mind')`, [co.payment_id]);
    await as(db, U.admin); await q(db, `select public.admin_issue_refund($1, null, 'ok', $2)`, [co.payment_id, r.id]);
    await as(db, 'service'); await q(db, `select public.complete_refund($1, true, 2)`, [r.id]);
    await as(db, 'postgres');
    const cert = await one(db, `select count(*)::int n from public.certificates where user_id=$1 and course_id=$2 and revoked_at is null`, [U.alice, c.id]);
    const e = await one(db, `select status from public.enrollments where user_id=$1 and course_id=$2`, [U.alice, c.id]);
    must(cert.n === 0, `enrolment is '${e.status}' and the payment fully refunded, but ${cert.n} valid certificate(s) remain (complete_refund never revokes certificates; request_refund ignores completion).`);
  }),

  // ---------------------------------------------------------------- S3 -----
  inv('S3', 'refund state machine: every non-terminal refund can reach a terminal state by an admin decision (incl. rejected)', async (db) => {
    await as(db, 'postgres');
    const setters = await q(db, `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','app') and p.prosrc ~* 'update\\s+public\\.refunds\\s+set\\s+status\\s*=\\s*''rejected'''`);
    must(setters.length > 0, `refund_status 'rejected' is unreachable: no function sets it, so a 'requested' refund an admin declines has no exit (it also blocks a new request for that payment).`);
  }),

  // ---------------------------------------------------------------- S4 -----
  inv('S4', 'payout state machine: a payout can only be paid after approval (requested -> approved -> processing -> paid)', async (db) => {
    await as(db, 'postgres');
    const m = await one(db, `insert into public.payout_methods (tutor_id, kind, provider_code, network, account_name, account_last4, account_ciphertext, is_default)
      values ($1,'mobile_money','MPS','MTN','Tutor Amina','1234','ciphertext-ciphertext-ciphertext',true) returning id`, [U.tutorA]);
    const po = await one(db, `insert into public.payouts (tutor_id, amount_ugx, method_id) values ($1, 25000, $2) returning reference, status`, [U.tutorA, m.id]);
    await as(db, 'service');
    const after = await one(db, `select status from public.complete_payout($1, true)`, [po.reference]);
    must(after.status !== 'paid', `payout went '${po.status}' -> '${after.status}' with no admin approval: complete_payout accepts any non-terminal status (requested/held/approved).`);
  }),

  // ---------------------------------------------------------------- A1 -----
  inv('A1', 'guests cannot register for events (event.register = learner|tutor|admin|root_admin)', async (db) => {
    await extraUsers(db);
    await as(db, 'postgres');
    const ev = await one(db, `select id from public.events where slug='kampala-build-night'`);
    await as(db, G);
    let ok = true; try { await sp(db, async () => { await q(db, `insert into public.event_registrations (event_id, user_id) values ($1,$2)`, [ev.id, G]); }); } catch { ok = false; }
    must(!ok, `a guest-only account inserted an event_registrations row: no r11_no_guest_write restrictive policy on event_registrations.`);
  }),

  // ---------------------------------------------------------------- A2 -----
  inv('A2', 'guests cannot buy event tickets either (create_checkout event_ticket)', async (db) => {
    await extraUsers(db);
    await as(db, 'postgres');
    const ev = await one(db, `select id from public.events where slug='ai-bootcamp-weekend'`);
    await as(db, G);
    let ok = true; try { await sp(db, async () => { await one(db, `select public.create_checkout('event_ticket', $1) c`, [ev.id]); }); } catch { ok = false; }
    must(!ok, `guest opened a paid event checkout: guard_payment_buyer only blocks course/tutor_session/subscription.`);
  }),

  // ---------------------------------------------------------------- A3 -----
  inv('A3', 'a minor whose guardian consent was revoked cannot buy (market.buy minor=consent)', async (db) => {
    const s = await digitalShop(db);
    await as(db, 'postgres');
    const g = await one(db, `select id from public.guardian_consents where user_id=$1`, [U.kid]);
    await as(db, U.root); await q(db, `select public.admin_revoke_guardian($1, 'test revoke')`, [g.id]);
    await as(db, U.kid);
    const restricted = (await one(db, `select app.minor_restricted() v`)).v;
    await q(db, `insert into public.mkt_cart_items (user_id, product_id, qty) values ($1,$2,1)`, [U.kid, s.product]);
    let ok = true; try { await sp(db, async () => { await one(db, `select public.mkt_checkout('{}'::jsonb) c`); }); } catch { ok = false; }
    must(!(restricted && ok), `minor_restricted()=${restricted} yet mkt_checkout succeeded: the r11_minor_consent RESTRICTIVE policies are bypassed by SECURITY DEFINER checkouts owned by postgres (BYPASSRLS), and revocation leaves account_status 'active'.`);
  }),

  // ---------------------------------------------------------------- A4 -----
  inv('A4', 'guests cannot create content (articles, study groups, opportunities) — guest = browse + buy only', async (db) => {
    await extraUsers(db);
    await as(db, G);
    const tried = {
      articles: `insert into public.articles (author_id, slug, title) values ('${G}','guest-article','Guest article')`,
      study_groups: `insert into public.study_groups (owner_id, name) values ('${G}','Guest group')`,
      opportunities: `insert into public.opportunities (type, title, org, url, canonical_url) values ((enum_range(null::public.opportunity_type))[1],'Guest gig','Org','https://example.com/x','https://example.com/x')`,
    };
    const wrote = [], other = [];
    for (const [t, sql] of Object.entries(tried)) {
      try { await sp(db, async () => { await q(db, sql); }); wrote.push(t); }
      catch (e) { if (!/row-level|guest|42501/i.test(`${e.message} ${e.code}`)) other.push(`${t}: ${e.code} ${e.message.slice(0, 80)}`); }
    }
    if (other.length) throw new Error(`harness: ${other.join(' | ')}`);
    must(wrote.length === 0, `guest-only account wrote rows to: ${wrote.join(', ')} (RLS only checks app.is_member(), which is true for active guests; no r11_no_guest_write policy).`);
  }),

  // ---------------------------------------------------------------- E1 -----
  inv('E1', 'account erase is blocked (or settles first) while money is in flight: payable balance, open payout', async (db) => {
    await as(db, U.alice);
    const c = await one(db, `select id from public.courses where slug='fullstack-nextjs-supabase'`);
    const co = (await one(db, `select public.create_checkout('course', $1) c`, [c.id])).c;
    await pay(db, co.tx_ref, co.amount_ugx, ++flw);
    await as(db, 'postgres');
    const m = await one(db, `insert into public.payout_methods (tutor_id, kind, provider_code, network, account_name, account_last4, account_ciphertext, is_default)
      values ($1,'mobile_money','MPS','MTN','Tutor Amina','1234','ciphertext-ciphertext-ciphertext',true) returning id`, [U.tutorA]);
    await q(db, `insert into public.payouts (tutor_id, amount_ugx, method_id, status) values ($1, 20000, $2, 'approved')`, [U.tutorA, m.id]);
    const bal = await balanceOf(db, U.tutorA);
    await as(db, 'service');
    let erased = true; try { await sp(db, async () => { await q(db, `select public.erase_user($1, 'privacy-job')`, [U.tutorA]); }); } catch { erased = false; }
    if (erased) await q(db, `select public.erase_user($1, 'privacy-job')`, [U.tutorA]);
    await as(db, U.bob);
    let sells = true; try { await sp(db, async () => { await one(db, `select public.create_checkout('course', $1) c`, [c.id]); }); } catch { sells = false; }
    must(!erased && !sells, `erase_user(tutor) ${erased ? 'succeeded' : 'refused'} with payable balance ${bal} UGX and an 'approved' payout in flight (method ciphertext overwritten); `
      + `after erase the tutor's course is ${sells ? 'STILL purchasable (earnings accrue to an erased account)' : 'not purchasable'}.`);
  }),

  // ---------------------------------------------------------------- C1 -----
  inv('C1', 'a learner who paid keeps access when the tutor unpublishes the course (published -> draft/archived)', async (db) => {
    await as(db, U.alice);
    const c = await one(db, `select id from public.courses where slug='fullstack-nextjs-supabase'`);
    const co = (await one(db, `select public.create_checkout('course', $1) c`, [c.id])).c;
    await pay(db, co.tx_ref, co.amount_ugx, ++flw);
    await as(db, U.alice);
    const before = Number((await one(db, `select count(*) n from public.lessons where course_id=$1`, [c.id])).n);
    await as(db, U.tutorA);
    let moved = true; try { await q(db, `update public.courses set status='archived' where id=$1`, [c.id]); } catch { moved = false; }
    await as(db, U.alice);
    const after = Number((await one(db, `select count(*) n from public.lessons where course_id=$1`, [c.id])).n);
    must(!moved || after >= before, `tutor ${moved ? 'archived' : 'could not archive'} the course; the paying learner now sees ${after} of ${before} lessons (can_view_lesson and courses_select require status='published').`);
  }),

  // ---------------------------------------------------------------- V1 -----
  inv('V1', 'marketplace order lifecycle is monotone for vendors (paid -> processing -> shipped -> out_for_delivery -> delivered, never backwards, never skipping shipped)', async (db) => {
    await as(db, U.tutorA);
    const st = await one(db, `insert into public.mkt_stores (slug, name) values ('logic-phys','Logic Phys') returning id`);
    await as(db, U.admin); await q(db, `select public.admin_set_store_kyc($1,'verified')`, [st.id]);
    await as(db, U.tutorA);
    const p = await one(db, `insert into public.mkt_products (store_id, slug, title, type, price_ugx, stock, status) values ($1,'logic-board','Board','physical',30000,10,'pending_review') returning id`, [st.id]);
    await as(db, U.admin); await q(db, `update public.mkt_products set status='published' where id=$1`, [p.id]);
    await as(db, U.alice);
    await q(db, `insert into public.mkt_cart_items (user_id, product_id, qty) values ($1,$2,1)`, [U.alice, p.id]);
    const zone = await one(db, `select id from public.mkt_shipping_zones where method='boda' order by fee_ugx limit 1`);
    const co = (await one(db, `select public.mkt_checkout($1::jsonb) c`, [JSON.stringify({ [st.id]: { zone_id: zone.id, address: { area: 'Ntinda' } } })])).c;
    await pay(db, co.tx_ref, co.amount_ugx, ++flw);
    await as(db, 'postgres'); const o = await one(db, `select id from public.mkt_orders where group_id=$1`, [co.group_id]);
    await as(db, U.tutorA);
    const bad = [];
    for (const [from, to] of [['paid', 'delivered'], ['shipped', 'processing']]) {
      await sp(db, async () => {
        await as(db, 'postgres'); await q(db, `update public.mkt_orders set status=$2 where id=$1`, [o.id, from]);
        await as(db, U.tutorA);
        try { await q(db, `select public.mkt_vendor_update_order($1,$2)`, [o.id, to]); bad.push(`${from}->${to}`); } catch { /* refused: good */ }
      });
    }
    must(bad.length === 0, `vendor allowed: ${bad.join(', ')} (paid->delivered starts the 7-day auto-release clock with no shipment; shipped->processing rewinds tracking).`);
  }),
  // ---------------------------------------------------------------- M6 -----
  inv('M6', 'a late "successful" webhook after a "failed" one never leaves captured money without a live order', async (db) => {
    const s = await digitalShop(db);
    await as(db, U.alice);
    await q(db, `insert into public.mkt_cart_items (user_id, product_id, qty) values ($1,$2,1)`, [U.alice, s.product]);
    const co = (await one(db, `select public.mkt_checkout('{}'::jsonb) c`)).c;
    await as(db, 'service');
    await q(db, `select public.apply_flutterwave_payment($1, null, 'failed', 0, 'UGX')`, [co.tx_ref]);
    await q(db, `select public.apply_flutterwave_payment($1, $2, 'successful', $3, 'UGX', 'mobilemoneyug')`, [co.tx_ref, ++flw, co.amount_ugx]);
    await as(db, 'postgres');
    const p = await one(db, `select status from public.payments where tx_ref=$1`, [co.tx_ref]);
    const o = await one(db, `select status from public.mkt_orders where group_id=$1`, [co.group_id]);
    const esc = await accountBal(db, 'platform:escrow_marketplace');
    must(!(p.status === 'successful' && !['paid', 'delivered', 'completed'].includes(o.status)),
      `payment '${p.status}' (UGX ${co.amount_ugx} captured, escrow balance ${esc}) but the order stays '${o.status}': failed->successful is allowed by apply_payment_internal, `
      + `while mkt_fulfil only advances orders still in 'pending_payment' (the failure already cancelled them). The money has no order to release or refund against.`);
  }),
  // ---------------------------------------------------------------- S5 -----
  inv('S5', 'marketplace v2 order leaves pending_payment when its payment fails/abandons (no dead state)', async (db) => {
    const s = await digitalShop(db);
    await as(db, U.alice);
    await q(db, `insert into public.mkt_cart_items (user_id, product_id, qty) values ($1,$2,1)`, [U.alice, s.product]);
    const co = (await one(db, `select public.mkt_checkout('{}'::jsonb) c`)).c;
    await as(db, 'service');
    await q(db, `select public.apply_flutterwave_payment($1, null, 'failed', 0, 'UGX')`, [co.tx_ref]);
    await as(db, 'postgres');
    const o = await one(db, `select status from public.mkt_orders where group_id=$1`, [co.group_id]);
    const cart = Number((await one(db, `select count(*) n from public.mkt_cart_items where user_id=$1`, [U.alice])).n);
    must(o.status !== 'pending_payment', `payment failed but the v2 order is still '${o.status}' with no transition out (apply_payment_internal cancels only the legacy marketplace_orders row); `
      + `the cart was already emptied (${cart} items) and any mkt_coupons.used increment is never returned.`);
  }),
];
