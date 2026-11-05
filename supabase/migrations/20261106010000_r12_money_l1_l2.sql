-- Round 12 money: L1 (marketplace double payout on buyer refund) and L2 (marketplace earnings skip the payout hold).
-- NOT APPLIED to staging: the founder applies it, after 20261105122000_r12_erase_pii.sql. Idempotent (create or replace only).
--
-- L1. A v2 marketplace payment (purpose 'marketplace_order', reference_id = mkt_order_groups.id, payee_id NULL) refunded
--     through /refunds (request_refund -> admin_issue_refund -> complete_refund) booked the refund against platform revenue
--     and left the orders and the escrow untouched, so mkt_release_due later credited the vendor too
--     (paid 40,000 -> buyer refunded 40,000 AND vendor payable +36,000).
--     Now:
--       * The /refunds path on a v2 marketplace payment is a FULL refund of every order in the group. Per-order and partial
--         refunds go through a dispute (mkt_open_dispute / admin_resolve_dispute), which already settles escrow per order.
--         It is refused when any order in the group has a dispute (open or resolved) or is not in a refundable state.
--       * While a refund for the payment is 'requested' or 'processing', escrow cannot be released (mkt_release raises,
--         mkt_release_due skips) and no dispute can be opened, so the money cannot leave twice.
--       * complete_refund takes the refund out of the money it actually sits in: escrow for unreleased orders; for orders
--         already released to the vendor, a clawback from the vendor payable plus a reversal of the platform commission
--         (contra revenue). The orders become 'refunded' (released_at set), so auto-release never sees them again.
--         The ledger stays balanced (one transaction, debits = credits = refund amount).
-- L2. app.available_balance held only payments with payee_id = vendor; marketplace payments have payee_id NULL, so released
--     escrow was withdrawable at once. Vendor earnings from a marketplace payment are now held while that payment is inside
--     the same window as course earnings: greatest(payouts.hold_days, refunds.window_days) days from payment verification.
--     The held marketplace amount is derived from the ledger (vendor payable entries linked to the payment), so it is exact.

-- ------------------------------------------------------------------ helpers ----
-- The v2 order group a payment pays for, or NULL (course, session, legacy v1 marketplace order, ...).
create or replace function app.mkt_group_of_payment(p_payment uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select g.id from public.payments p join public.mkt_order_groups g on g.id = p.reference_id and g.payment_id = p.id
   where p.id = p_payment and p.purpose = 'marketplace_order'
$$;

-- True while a buyer refund of the payment that pays for this order group is waiting (requested) or being paid (processing).
create or replace function app.mkt_group_refund_pending(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mkt_order_groups g join public.refunds r on r.payment_id = g.payment_id
                  where g.id = p_group and r.status in ('requested','processing'))
$$;

-- Raises unless a /refunds refund of p_amount on this v2 marketplace payment is allowed (see header).
create or replace function app.mkt_refund_guard(p_payment uuid, p_amount bigint)
returns void language plpgsql stable security definer set search_path = '' as $$
declare p public.payments; g uuid := app.mkt_group_of_payment(p_payment); o record;
begin
  if g is null then return; end if;
  select * into p from public.payments where id = p_payment;
  if p_amount is distinct from (p.amount_ugx - p.refunded_ugx) then
    raise exception 'a marketplace payment is refunded in full here; for one order or part of an order, open a dispute on the order'
      using errcode = '22023';
  end if;
  for o in select mo.id, mo.status, mo.released_at, exists (select 1 from public.mkt_disputes d where d.order_id = mo.id) disputed
             from public.mkt_orders mo where mo.group_id = g loop
    if o.disputed then
      raise exception 'an order in this purchase has a dispute: the refund is settled in the dispute' using errcode = 'P0001';
    end if;
    if not ((o.released_at is null and o.status in ('paid','processing','shipped','out_for_delivery','delivered'))
            or (o.released_at is not null and o.status = 'completed')) then
      raise exception 'order % cannot be refunded from status %', o.id, o.status using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

-- --------------------------------------------------------- request_refund ----
create or replace function public.request_refund(p_payment_id uuid, p_reason text)
returns public.refunds language plpgsql security definer set search_path = '' as $$
declare p public.payments; r public.refunds; win int := coalesce((app.setting('refunds.window_days'))::int, 14);
begin
  select * into p from public.payments where id = p_payment_id and user_id = app.requesting_user_id();
  if not found then raise exception 'payment not found' using errcode = 'P0002'; end if;
  if p.status not in ('successful','partially_refunded') or p.amount_ugx = 0 then raise exception 'not refundable' using errcode = 'P0001'; end if;
  if p.verified_at < now() - make_interval(days => win) then raise exception 'refund window has passed' using errcode = 'P0001'; end if;
  if exists (select 1 from public.refunds where payment_id = p.id and status in ('requested','processing')) then
    raise exception 'refund already requested' using errcode = '23505'; end if;
  perform app.mkt_refund_guard(p.id, p.amount_ugx - p.refunded_ugx);          -- r12 L1
  insert into public.refunds (payment_id, amount_ugx, reason, requested_by) values (p.id, p.amount_ugx - p.refunded_ugx, p_reason, p.user_id)
  returning * into r;
  return r;
end;
$$;

-- ----------------------------------------------------- admin_issue_refund ----
create or replace function public.admin_issue_refund(p_payment_id uuid, p_amount_ugx bigint default null, p_reason text default 'Admin refund',
                                                     p_refund_id uuid default null)
returns public.refunds language plpgsql security definer set search_path = '' as $$
declare p public.payments; r public.refunds; amt bigint;
begin
  perform app.require_admin();
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.status not in ('successful','partially_refunded') or p.amount_ugx = 0 then raise exception 'payment not refundable' using errcode = 'P0001'; end if;
  amt := coalesce(p_amount_ugx, p.amount_ugx - p.refunded_ugx);
  if amt <= 0 or amt > p.amount_ugx - p.refunded_ugx then raise exception 'invalid refund amount' using errcode = '22023'; end if;
  if amt > coalesce((app.setting('payouts.super_admin_threshold_ugx'))::bigint, 1000000) then perform app.require_super_admin(); end if;
  perform app.mkt_refund_guard(p.id, amt);                                     -- r12 L1
  if p_refund_id is not null then
    update public.refunds set status = 'processing', approved_by = app.requesting_user_id(), amount_ugx = amt
     where id = p_refund_id and payment_id = p.id and status = 'requested' returning * into r;
    if not found then raise exception 'refund request not found' using errcode = 'P0002'; end if;
  else
    if exists (select 1 from public.refunds where payment_id = p.id and status in ('requested','processing')) and app.mkt_group_of_payment(p.id) is not null then
      raise exception 'a refund of this marketplace payment is already open: approve that request' using errcode = '23505';
    end if;
    insert into public.refunds (payment_id, amount_ugx, reason, status, requested_by, approved_by)
    values (p.id, amt, p_reason, 'processing', app.requesting_user_id(), app.requesting_user_id()) returning * into r;
  end if;
  perform app.audit_action('admin.issue_refund', 'refunds', r.id::text, jsonb_build_object('payment_id', p.id, 'amount_ugx', amt));
  return r;
end;
$$;

-- -------------------------------------------------------- complete_refund ----
-- Service-role only, after the Flutterwave refund API answered.
create or replace function public.complete_refund(p_refund_id uuid, p_success boolean, p_flw_refund_id bigint default null,
                                                  p_failure text default null, p_raw jsonb default null)
returns public.refunds language plpgsql security definer set search_path = '' as $$
declare r public.refunds; p public.payments; payee_part bigint; plat_part bigint; g uuid; o record; fee bigint; owner text;
  lines jsonb := '[]'::jsonb; covered bigint := 0;
  cash uuid := app.ledger_account('platform:cash_flutterwave', 'asset', null, 'Flutterwave balance');
  contra uuid := app.ledger_account('platform:refunds', 'contra_revenue', null, 'Refunds');
  escrow uuid := app.ledger_account('platform:escrow_marketplace', 'liability', null, 'Marketplace escrow');
begin
  perform app.require_backend();
  select * into r from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.status in ('completed','failed','rejected') then return r; end if;
  if not p_success then
    update public.refunds set status = 'failed', failure_reason = p_failure, raw = p_raw where id = r.id returning * into r;
    return r;
  end if;
  select * into p from public.payments where id = r.payment_id for update;
  if r.amount_ugx > p.amount_ugx - p.refunded_ugx then raise exception 'refund exceeds remaining amount' using errcode = '22023'; end if;
  g := app.mkt_group_of_payment(p.id);

  if g is not null then
    -- r12 L1: v2 marketplace. Take the money back from where it sits, order by order.
    perform 1 from public.mkt_orders where group_id = g order by id for update;
    perform app.mkt_refund_guard(p.id, r.amount_ugx);
    for o in select * from public.mkt_orders where group_id = g order by id loop
      if o.released_at is null then
        lines := lines || jsonb_build_array(jsonb_build_object('account', escrow, 'direction', 'debit', 'amount', o.total_ugx));
      else
        -- already released to the vendor (mkt_release): claw back the vendor share, reverse the commission
        select owner_id into owner from public.mkt_stores where id = o.store_id;
        fee := round(o.total_ugx * o.commission_pct / 100);
        lines := lines || jsonb_build_array(
          jsonb_build_object('account', app.payable_account(owner), 'direction', 'debit', 'amount', o.total_ugx - fee),
          jsonb_build_object('account', contra, 'direction', 'debit', 'amount', fee));
      end if;
      covered := covered + o.total_ugx;
    end loop;
    if covered <> r.amount_ugx then
      raise exception 'marketplace refund % does not match the orders it pays back (%)', r.amount_ugx, covered using errcode = 'P0001';
    end if;
    lines := lines || jsonb_build_array(jsonb_build_object('account', cash, 'direction', 'credit', 'amount', r.amount_ugx));
    perform app.post_ledger('refund', lines, p.id, r.id, null, 'Refund ' || p.tx_ref);
    for o in update public.mkt_orders set status = 'refunded', released_at = coalesce(released_at, now())
              where group_id = g returning * loop
      insert into public.mkt_order_events (order_id, status, note, actor_id) values (o.id, 'refunded', 'buyer refunded in full', coalesce(app.requesting_user_id(), 'system'));
      perform app.notify((select owner_id from public.mkt_stores where id = o.store_id), 'order.refunded', 'Order refunded',
                         'A marketplace order was refunded to the buyer.', '/seller.html#orders', jsonb_build_object('order_id', o.id));
    end loop;
  else
    payee_part := case when p.payee_id is null or p.amount_ugx = 0 then 0 else (r.amount_ugx * p.payee_share_ugx) / p.amount_ugx end;
    plat_part := r.amount_ugx - payee_part;
    perform app.post_ledger('refund', jsonb_build_array(
        jsonb_build_object('account', contra, 'direction', 'debit', 'amount', plat_part),
        jsonb_build_object('account', case when payee_part > 0 then app.payable_account(p.payee_id) else contra end, 'direction', 'debit', 'amount', payee_part),
        jsonb_build_object('account', cash, 'direction', 'credit', 'amount', r.amount_ugx)),
      p.id, r.id, null, 'Refund ' || p.tx_ref);
  end if;

  update public.payments set refunded_ugx = refunded_ugx + r.amount_ugx,
         status = case when refunded_ugx + r.amount_ugx >= amount_ugx then 'refunded'::public.payment_status else 'partially_refunded'::public.payment_status end
   where id = p.id returning * into p;
  update public.refunds set status = 'completed', flw_refund_id = p_flw_refund_id, raw = p_raw, completed_at = now() where id = r.id returning * into r;
  if p.status = 'refunded' then            -- revoke access
    case p.purpose
      when 'course' then update public.enrollments set status = 'refunded' where payment_id = p.id;
      when 'event_ticket' then update public.event_registrations set status = 'refunded' where payment_id = p.id;
      when 'marketplace_order' then update public.marketplace_orders set status = 'refunded' where id = p.reference_id;
      when 'tutor_session' then update public.session_bookings set status = 'refunded' where payment_id = p.id;
      when 'subscription' then update public.subscriptions set status = 'cancelled', cancelled_at = now() where id = p.reference_id;
      else null;
    end case;
  end if;
  perform app.notify(p.user_id, 'refund.completed', 'Refund processed', 'UGX ' || to_char(r.amount_ugx, 'FM999,999,999') || ' is on its way back to you.', '/dashboard.html#payments');
  return r;
end;
$$;

-- ---------------------------------------------------- escrow release gate ----
create or replace function app.mkt_release(p_order uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.mkt_orders; fee bigint; owner text; pay uuid;
  escrow uuid := app.ledger_account('platform:escrow_marketplace', 'liability', null, 'Marketplace escrow');
  rev_comm uuid := app.ledger_account('platform:revenue_commission', 'revenue', null, 'Commission revenue');
begin
  select * into o from public.mkt_orders where id = p_order for update;
  if o.released_at is not null or o.status not in ('paid','processing','shipped','out_for_delivery','delivered') then return; end if;
  if exists (select 1 from public.mkt_disputes d where d.order_id = o.id and d.status in ('open','vendor_accepted','escalated')) then
    raise exception 'order has an open dispute' using errcode = 'P0001';
  end if;
  if app.mkt_group_refund_pending(o.group_id) then                             -- r12 L1
    raise exception 'order has a pending refund' using errcode = 'P0001';
  end if;
  select owner_id into owner from public.mkt_stores where id = o.store_id;
  select payment_id into pay from public.mkt_order_groups where id = o.group_id;
  fee := round(o.total_ugx * o.commission_pct / 100);
  if o.total_ugx > 0 then
    perform app.post_ledger('escrow_release', jsonb_build_array(
      jsonb_build_object('account', escrow, 'direction', 'debit', 'amount', o.total_ugx),
      jsonb_build_object('account', rev_comm, 'direction', 'credit', 'amount', fee),
      jsonb_build_object('account', app.payable_account(owner), 'direction', 'credit', 'amount', o.total_ugx - fee)),
      pay, null, null, 'Escrow release order ' || o.id);
  end if;
  update public.mkt_orders set status = 'completed', released_at = now() where id = o.id;
  insert into public.mkt_order_events (order_id, status, note, actor_id) values (o.id, 'completed', 'escrow released', coalesce(app.requesting_user_id(), 'system'));
end;
$$;

create or replace function public.mkt_release_due()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  perform app.require_backend();
  for r in select o.id from public.mkt_orders o where o.status = 'delivered' and o.released_at is null and o.auto_release_at <= now()
             and not exists (select 1 from public.mkt_disputes d where d.order_id = o.id and d.status in ('open','vendor_accepted','escalated'))
             and not app.mkt_group_refund_pending(o.group_id)                  -- r12 L1
           limit 500 loop
    perform app.mkt_release(r.id); n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.mkt_open_dispute(p_order uuid, p_kind text, p_reason text)
returns public.mkt_disputes language plpgsql security definer set search_path = '' as $$
declare o public.mkt_orders; d public.mkt_disputes; ttl int := coalesce((app.setting('marketplace.escrow_days'))::int, 7);
begin
  select * into o from public.mkt_orders where id = p_order and buyer_id = app.requesting_user_id();
  if o.id is null then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.released_at is not null then raise exception 'escrow already released' using errcode = 'P0001'; end if;
  if o.status not in ('paid','processing','shipped','out_for_delivery','delivered') then raise exception 'cannot dispute this order' using errcode = 'P0001'; end if;
  if o.delivered_at is not null and o.delivered_at < now() - make_interval(days => ttl) then raise exception 'dispute window closed' using errcode = 'P0001'; end if;
  if app.mkt_group_refund_pending(o.group_id) then                             -- r12 L1
    raise exception 'a refund of this purchase is already in progress' using errcode = 'P0001';
  end if;
  insert into public.mkt_disputes (order_id, opened_by, kind, reason) values (o.id, o.buyer_id, p_kind, p_reason) returning * into d;
  update public.mkt_orders set status = 'disputed' where id = o.id;
  insert into public.mkt_order_events (order_id, status, note, actor_id) values (o.id, 'disputed', p_kind, o.buyer_id);
  perform app.notify((select owner_id from public.mkt_stores where id = o.store_id), 'order.disputed', 'Order disputed', 'A buyer opened a dispute.', '/seller.html#disputes', jsonb_build_object('order_id', o.id));
  return d;
end;
$$;

-- ------------------------------------------------------ L2: payout hold ----
-- Withdrawable = balance − earnings still inside the hold window − open payout requests.
-- Held = course/session/event shares (payee_id = user, as before) + marketplace vendor earnings (r12 L2): the net of the
-- user's payable entries posted by escrow release, dispute settlement and refund clawback for a marketplace payment
-- verified less than hold_days ago.
create or replace function app.available_balance(p_user text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare bal bigint; held bigint; held_mkt bigint; pending bigint;
        -- SR-14: earnings stay held at least as long as learners can request refunds
        hold_days int := greatest(coalesce((app.setting('payouts.hold_days'))::int, 14), coalesce((app.setting('refunds.window_days'))::int, 14));
begin
  select coalesce(sum(case when e.direction = 'credit' then e.amount_ugx else -e.amount_ugx end), 0) into bal
    from public.ledger_entries e join public.ledger_accounts a on a.id = e.account_id where a.owner_id = p_user;
  select coalesce(sum(p.payee_share_ugx - (p.refunded_ugx * p.payee_share_ugx / greatest(p.amount_ugx,1))), 0) into held
    from public.payments p
   where p.payee_id = p_user and p.split_subaccount_id is null and p.status in ('successful','partially_refunded')
     and p.verified_at > now() - make_interval(days => hold_days);
  select coalesce(sum(greatest(x.net, 0)), 0) into held_mkt from (
    select t.payment_id, sum(case when e.direction = 'credit' then e.amount_ugx else -e.amount_ugx end) net
      from public.ledger_entries e
      join public.ledger_accounts a on a.id = e.account_id and a.owner_id = p_user
      join public.ledger_transactions t on t.id = e.transaction_id and t.kind in ('escrow_release','escrow_refund','refund')
      join public.payments p on p.id = t.payment_id and p.payee_id is null and p.purpose = 'marketplace_order'
     where p.verified_at > now() - make_interval(days => hold_days)
     group by t.payment_id) x;
  select coalesce(sum(amount_ugx), 0) into pending from public.payouts
   where tutor_id = p_user and status in ('requested','approved','held','processing');
  return greatest(bal - held - held_mkt - pending, 0);
end;
$$;

-- --------------------------------------------------------------- grants ----
revoke execute on function app.mkt_group_of_payment(uuid), app.mkt_group_refund_pending(uuid), app.mkt_refund_guard(uuid, bigint)
  from public, anon, authenticated;
