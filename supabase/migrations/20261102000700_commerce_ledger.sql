-- =============================================================================
-- Commerce: settings/flags, coupons, subscription plans, marketplace,
-- unified payments (Flutterwave, UGX), double-entry ledger, invoices,
-- refunds, tutor payouts, webhook log.
--
-- Money rule: UGX has no minor unit in practice, so all amounts are BIGINT
-- whole shillings, CHECKed non-negative. Prices are ALWAYS read from the DB
-- inside SECURITY DEFINER functions — clients never send amounts.
-- =============================================================================

-- ------------------------------------------------ settings & feature flags ----
create table public.site_settings (
  key          text primary key check (key ~ '^[a-z0-9_\.]{2,64}$'),
  value        jsonb not null,
  is_public    boolean not null default false,     -- readable by anon (contact info, hero stats)
  description  text,
  updated_by   text references public.profiles(id) on delete set null,
  updated_at   timestamptz not null default now()
);
create trigger site_settings_updated_at before update on public.site_settings for each row execute function app.set_updated_at();

create table public.feature_flags (
  key           text primary key check (key ~ '^[a-z0-9_\.]{2,64}$'),
  enabled       boolean not null default false,
  rollout_pct   integer not null default 100 check (rollout_pct between 0 and 100),
  allowed_roles public.app_role[],                  -- null = everyone
  description   text,
  updated_by    text references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now()
);
create trigger feature_flags_updated_at before update on public.feature_flags for each row execute function app.set_updated_at();

insert into public.site_settings (key, value, is_public, description) values
  ('commission_pct', '{"course":20,"event_ticket":10,"marketplace_order":10,"tutor_session":15,"default":20}', false, 'Platform commission % per product type (tutor override wins)'),
  ('payments.split_enabled', 'true', false, 'Use Flutterwave subaccount splits when the payee has a subaccount'),
  ('payouts.min_ugx', '20000', false, 'Minimum payout request'),
  ('payouts.super_admin_threshold_ugx', '1000000', false, 'Payouts above this need a super_admin approval'),
  ('payouts.hold_days', '7', false, 'Earnings become withdrawable N days after payment (refund window)'),
  ('refunds.window_days', '14', true, 'Refund request window'),
  ('contact', '{"email":"hello@101codecrafts.com","phone":"+256754129226","address":"Kampala, Uganda"}', true, 'Public contact details'),
  ('hero_stats', '{"members":null,"courses":null,"events":null}', true, 'Overrides for landing hero counters (null = live)'),
  ('gamification.xp', '{"lesson_completed":10,"course_completed":100,"project_created":30,"event_attended":40,"post_created":2,"review_written":5,"referral_joined":50,"daily_login":1}', false, 'XP awarded per action')
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('marketplace', true, 'Marketplace listings and orders'),
  ('subscriptions', true, 'Membership subscriptions'),
  ('tutor_sessions', true, 'Paid tutor live sessions'),
  ('ai_news_summaries', false, 'One-line AI summaries for news'),
  ('whatsapp_notifications', false, 'WhatsApp link opt-in delivery')
on conflict (key) do nothing;

create or replace function app.setting(p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select value from public.site_settings where key = p_key
$$;

-- ------------------------------------------------------------- coupons ----
create table public.coupons (
  id               uuid primary key default gen_random_uuid(),
  code             text not null check (code ~ '^[A-Z0-9_-]{3,32}$'),
  kind             public.coupon_kind not null,
  value            bigint not null check (value > 0),
  applies_to       public.payment_purpose,          -- null = any
  course_id        uuid references public.courses(id) on delete cascade,
  session_id       uuid references public.tutor_sessions(id) on delete cascade,
  tutor_id         text references public.profiles(id) on delete cascade,  -- tutor-issued coupons
  max_redemptions  integer check (max_redemptions > 0),
  per_user_limit   integer not null default 1 check (per_user_limit > 0),
  redeemed_count   integer not null default 0 check (redeemed_count >= 0),
  starts_at        timestamptz not null default now(),
  expires_at       timestamptz,
  is_active        boolean not null default true,
  created_by       text references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);
create unique index coupons_code_uniq on public.coupons (upper(code));
create trigger coupons_updated_at before update on public.coupons for each row execute function app.set_updated_at();

create table public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  payment_id  uuid not null,
  created_at  timestamptz not null default now(),
  unique (payment_id)
);
create index coupon_redemptions_user_idx on public.coupon_redemptions (coupon_id, user_id);

-- Tutors may only issue coupons for their own courses/sessions.
create or replace function app.guard_coupon()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  new.tutor_id := app.requesting_user_id(); new.created_by := app.requesting_user_id();
  if tg_op = 'INSERT' then new.redeemed_count := 0;
  elsif new.redeemed_count is distinct from old.redeemed_count then
    raise exception 'protected coupon fields' using errcode = '42501';
  end if;
  if not ((new.course_id is not null and app.owns_course(new.course_id))
          or (new.session_id is not null and app.owns_session(new.session_id))) then
    raise exception 'tutor coupons must target your own course or session' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger coupons_guard before insert or update on public.coupons for each row execute function app.guard_coupon();

-- ------------------------------------------------ subscription plans ----
create table public.subscription_plans (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique check (code ~ '^[a-z0-9_-]{2,40}$'),
  name                 text not null check (char_length(name) between 2 and 80),
  description          text check (char_length(description) <= 2000),
  interval             public.billing_interval not null,
  amount_ugx           bigint not null check (amount_ugx >= 1000),
  flw_payment_plan_id  bigint unique,             -- created via Flutterwave /payment-plans
  features             jsonb not null default '{}',
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger subscription_plans_updated_at before update on public.subscription_plans for each row execute function app.set_updated_at();

create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               text not null references public.profiles(id) on delete cascade,
  plan_id               uuid not null references public.subscription_plans(id) on delete restrict,
  status                public.subscription_status not null default 'pending',
  flw_subscription_id   bigint unique,
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  cancelled_at          timestamptz,
  started_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index subscriptions_one_live on public.subscriptions (user_id) where status in ('active','past_due');
create index subscriptions_status_idx on public.subscriptions (status, current_period_end);
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function app.set_updated_at();

create or replace function app.has_active_subscription()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.subscriptions s where s.user_id = app.requesting_user_id()
                 and s.status = 'active' and s.current_period_end > now())
$$;

-- -------------------------------------------------------- marketplace ----
create table public.marketplace_listings (
  id            uuid primary key default gen_random_uuid(),
  seller_id     text not null references public.profiles(id) on delete cascade,
  title         text not null check (char_length(title) between 3 and 140),
  description   text check (char_length(description) <= 10000),
  kind          public.listing_kind not null default 'digital',
  price_ugx     bigint not null check (price_ugx between 1000 and 50000000),
  stock         integer check (stock is null or stock >= 0),
  cover_url     text,
  file_path     text,
  tags          text[] not null default '{}',
  status        public.listing_status not null default 'draft',
  is_featured   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index marketplace_listings_live_idx on public.marketplace_listings (created_at desc) where status = 'active' and deleted_at is null;
create index marketplace_listings_seller_idx on public.marketplace_listings (seller_id);
create trigger marketplace_listings_updated_at before update on public.marketplace_listings for each row execute function app.set_updated_at();

create or replace function app.guard_listing()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.seller_id := app.requesting_user_id(); new.is_featured := false; return new; end if;
  if new.seller_id is distinct from old.seller_id or new.is_featured is distinct from old.is_featured then
    raise exception 'protected listing fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger marketplace_listings_guard before insert or update on public.marketplace_listings for each row execute function app.guard_listing();

-- ------------------------------------------------------------ payments ----
create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              text references public.profiles(id) on delete set null,     -- payer
  payee_id             text references public.profiles(id) on delete set null,     -- tutor/seller (null = platform)
  tx_ref               text not null unique check (tx_ref ~ '^[A-Za-z0-9_\-]{8,80}$'),
  provider             text not null default 'flutterwave' check (provider in ('flutterwave','coupon','manual')),
  purpose              public.payment_purpose not null,
  reference_id         uuid,                       -- course/event/order/booking/subscription id
  quantity             integer not null default 1 check (quantity between 1 and 100),
  list_price_ugx       bigint not null check (list_price_ugx >= 0),
  discount_ugx         bigint not null default 0 check (discount_ugx >= 0),
  amount_ugx           bigint not null check (amount_ugx >= 0),
  coupon_id            uuid references public.coupons(id) on delete set null,
  commission_pct       numeric(5,2) not null default 0 check (commission_pct between 0 and 100),
  platform_fee_ugx     bigint not null default 0 check (platform_fee_ugx >= 0),
  payee_share_ugx      bigint not null default 0 check (payee_share_ugx >= 0),
  split_subaccount_id  text,                       -- set when Flutterwave split pays the payee at source
  currency             char(3) not null default 'UGX' check (currency = 'UGX'),
  status               public.payment_status not null default 'pending',
  flw_transaction_id   bigint unique,
  flw_plan_id          bigint,
  payment_type         text,
  failure_reason       text,
  checkout_link        text,
  refunded_ugx         bigint not null default 0 check (refunded_ugx >= 0),
  raw                  jsonb,
  verified_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (amount_ugx = list_price_ugx - discount_ugx),
  check (platform_fee_ugx + payee_share_ugx = case when payee_id is null then 0 else amount_ugx end),
  check (refunded_ugx <= amount_ugx)
);
create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_payee_idx on public.payments (payee_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);
create index payments_verified_idx on public.payments (verified_at) where status in ('successful','partially_refunded','refunded');
create trigger payments_updated_at before update on public.payments for each row execute function app.set_updated_at();

alter table public.coupon_redemptions add constraint coupon_redemptions_payment_fk foreign key (payment_id) references public.payments(id) on delete cascade;
alter table public.enrollments add constraint enrollments_payment_fk foreign key (payment_id) references public.payments(id) on delete set null;
alter table public.event_registrations add constraint event_registrations_payment_fk foreign key (payment_id) references public.payments(id) on delete set null;
alter table public.session_bookings add constraint session_bookings_payment_fk foreign key (payment_id) references public.payments(id) on delete set null;

create table public.marketplace_orders (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.marketplace_listings(id) on delete restrict,
  buyer_id     text not null references public.profiles(id) on delete restrict,
  seller_id    text not null references public.profiles(id) on delete restrict,
  quantity     integer not null default 1 check (quantity between 1 and 100),
  amount_ugx   bigint not null check (amount_ugx >= 0),
  status       public.order_status not null default 'pending_payment',
  payment_id   uuid references public.payments(id) on delete set null,
  buyer_note   text check (char_length(buyer_note) <= 1000),
  paid_at      timestamptz,
  fulfilled_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create index marketplace_orders_buyer_idx  on public.marketplace_orders (buyer_id, created_at desc);
create index marketplace_orders_seller_idx on public.marketplace_orders (seller_id, created_at desc);
create trigger marketplace_orders_updated_at before update on public.marketplace_orders for each row execute function app.set_updated_at();

create or replace function app.guard_order()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if (to_jsonb(new) - array['status','fulfilled_at','updated_at']) is distinct from (to_jsonb(old) - array['status','fulfilled_at','updated_at'])
     or not (old.status = 'paid' and new.status = 'fulfilled' and old.seller_id = app.requesting_user_id()) then
    raise exception 'sellers may only mark paid orders as fulfilled' using errcode = '42501';
  end if;
  new.fulfilled_at := now();
  return new;
end;
$$;
create trigger marketplace_orders_guard before update on public.marketplace_orders for each row execute function app.guard_order();

-- ------------------------------------------------------ double-entry ledger ----
create table public.ledger_accounts (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique check (code ~ '^[a-z]+:[A-Za-z0-9_:\-]+$'),
  name       text not null,
  kind       public.ledger_account_kind not null,
  owner_id   text references public.profiles(id) on delete restrict,   -- set for user payable accounts
  created_at timestamptz not null default now()
);
create index ledger_accounts_owner_idx on public.ledger_accounts (owner_id);

create table public.ledger_transactions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('payment','split_settlement','refund','payout','adjustment')),
  payment_id  uuid references public.payments(id) on delete restrict,
  refund_id   uuid,
  payout_id   uuid,
  memo        text check (char_length(memo) <= 500),
  created_by  text,
  created_at  timestamptz not null default now()
);
create index ledger_transactions_payment_idx on public.ledger_transactions (payment_id);
create index ledger_transactions_created_idx on public.ledger_transactions (created_at);

create table public.ledger_entries (
  id              bigint generated always as identity primary key,
  transaction_id  uuid not null references public.ledger_transactions(id) on delete restrict,
  account_id      uuid not null references public.ledger_accounts(id) on delete restrict,
  direction       public.ledger_direction not null,
  amount_ugx      bigint not null check (amount_ugx > 0),
  created_at      timestamptz not null default now()
);
create index ledger_entries_account_idx on public.ledger_entries (account_id, created_at);
create index ledger_entries_txn_idx on public.ledger_entries (transaction_id);

-- Every transaction must balance (checked at COMMIT).
create or replace function app.ledger_balanced()
returns trigger language plpgsql set search_path = '' as $$
declare d bigint; c bigint;
begin
  select coalesce(sum(amount_ugx) filter (where direction = 'debit'), 0),
         coalesce(sum(amount_ugx) filter (where direction = 'credit'), 0)
    into d, c from public.ledger_entries where transaction_id = new.transaction_id;
  if d <> c then
    raise exception 'unbalanced ledger transaction % (debits %, credits %)', new.transaction_id, d, c using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger ledger_entries_balanced after insert on public.ledger_entries
  deferrable initially deferred for each row execute function app.ledger_balanced();

-- Ledger is append-only: corrections are new 'adjustment' transactions.
create or replace function app.ledger_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'ledger is append-only' using errcode = '42501'; end;
$$;
create trigger ledger_entries_immutable before update or delete on public.ledger_entries for each row execute function app.ledger_immutable();
create trigger ledger_transactions_immutable before update or delete on public.ledger_transactions for each row execute function app.ledger_immutable();

create or replace function app.ledger_account(p_code text, p_kind public.ledger_account_kind, p_owner text default null, p_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid;
begin
  select id into a from public.ledger_accounts where code = p_code;
  if a is null then
    insert into public.ledger_accounts (code, name, kind, owner_id) values (p_code, coalesce(p_name, p_code), p_kind, p_owner)
    on conflict (code) do update set code = excluded.code returning id into a;
  end if;
  return a;
end;
$$;

create or replace function app.payable_account(p_user text)
returns uuid language sql security definer set search_path = '' as $$
  select app.ledger_account('user:' || p_user || ':payable', 'liability', p_user, 'Earnings payable')
$$;

-- p_lines: [{"account": uuid, "direction": "debit"|"credit", "amount": n}, ...]
create or replace function app.post_ledger(p_kind text, p_lines jsonb, p_payment uuid default null,
                                           p_refund uuid default null, p_payout uuid default null, p_memo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t uuid; l jsonb;
begin
  insert into public.ledger_transactions (kind, payment_id, refund_id, payout_id, memo, created_by)
  values (p_kind, p_payment, p_refund, p_payout, p_memo, coalesce(app.requesting_user_id(), 'system')) returning id into t;
  for l in select * from jsonb_array_elements(p_lines) loop
    if (l ->> 'amount')::bigint > 0 then
      insert into public.ledger_entries (transaction_id, account_id, direction, amount_ugx)
      values (t, (l ->> 'account')::uuid, (l ->> 'direction')::public.ledger_direction, (l ->> 'amount')::bigint);
    end if;
  end loop;
  return t;
end;
$$;

-- --------------------------------------------------------------- invoices ----
create sequence public.invoice_seq;
create table public.invoices (
  id           uuid primary key default gen_random_uuid(),
  number       text not null unique,
  payment_id   uuid not null unique references public.payments(id) on delete restrict,
  user_id      text references public.profiles(id) on delete set null,
  items        jsonb not null,
  subtotal_ugx bigint not null check (subtotal_ugx >= 0),
  discount_ugx bigint not null default 0 check (discount_ugx >= 0),
  total_ugx    bigint not null check (total_ugx >= 0),
  issued_at    timestamptz not null default now(),
  emailed_at   timestamptz
);
create index invoices_user_idx on public.invoices (user_id, issued_at desc);

-- ---------------------------------------------------------------- refunds ----
create table public.refunds (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references public.payments(id) on delete restrict,
  amount_ugx     bigint not null check (amount_ugx > 0),
  reason         text not null check (char_length(reason) between 3 and 1000),
  status         public.refund_status not null default 'requested',
  requested_by   text references public.profiles(id) on delete set null,
  approved_by    text references public.profiles(id) on delete set null,
  flw_refund_id  bigint,
  failure_reason text,
  raw            jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_status_idx on public.refunds (status, created_at);
create trigger refunds_updated_at before update on public.refunds for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------- payouts ----
create table public.payouts (
  id               uuid primary key default gen_random_uuid(),
  tutor_id         text not null references public.profiles(id) on delete restrict,
  amount_ugx       bigint not null check (amount_ugx >= 1000),
  method_id        uuid not null references public.payout_methods(id) on delete restrict,
  status           public.payout_status not null default 'requested',
  reference        text not null unique default ('ccx-po-' || replace(gen_random_uuid()::text, '-', '')),
  flw_transfer_id  bigint unique,
  reviewed_by      text references public.profiles(id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text check (char_length(review_note) <= 1000),
  processed_at     timestamptz,
  failure_reason   text,
  raw              jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index payouts_tutor_idx on public.payouts (tutor_id, created_at desc);
create index payouts_status_idx on public.payouts (status, created_at);
create trigger payouts_updated_at before update on public.payouts for each row execute function app.set_updated_at();

-- ------------------------------------------------------------ webhooks ----
create table public.webhook_events (
  id               bigint generated always as identity primary key,
  provider         text not null check (provider in ('clerk','flutterwave','resend','cal')),
  event_id         text not null,
  event_type       text,
  signature_valid  boolean not null,
  payload          jsonb not null,
  processed_at     timestamptz,
  error            text,
  attempts         integer not null default 0,
  received_at      timestamptz not null default now(),
  unique (provider, event_id)
);
create index webhook_events_unprocessed_idx on public.webhook_events (received_at) where processed_at is null;

-- =============================================================================
-- Wallet view (security_invoker: ledger RLS limits rows to the caller's
-- own payable account; admins see everyone).
-- =============================================================================
create view public.wallet_balances with (security_invoker = true) as
select a.owner_id as user_id,
       coalesce(sum(e.amount_ugx) filter (where e.direction = 'credit'), 0)                                   as credited_ugx,
       coalesce(sum(e.amount_ugx) filter (where e.direction = 'debit'), 0)                                    as debited_ugx,
       coalesce(sum(case when e.direction = 'credit' then e.amount_ugx else -e.amount_ugx end), 0)            as balance_ugx
  from public.ledger_accounts a
  left join public.ledger_entries e on e.account_id = a.id
 where a.owner_id is not null
 group by a.owner_id;

-- Withdrawable = balance − earnings still inside the hold window − open payout requests.
create or replace function app.available_balance(p_user text)
returns bigint language plpgsql stable security definer set search_path = '' as $$
declare bal bigint; held bigint; pending bigint; hold_days int := coalesce((app.setting('payouts.hold_days'))::int, 7);
begin
  select coalesce(sum(case when e.direction = 'credit' then e.amount_ugx else -e.amount_ugx end), 0) into bal
    from public.ledger_entries e join public.ledger_accounts a on a.id = e.account_id where a.owner_id = p_user;
  select coalesce(sum(p.payee_share_ugx - (p.refunded_ugx * p.payee_share_ugx / greatest(p.amount_ugx,1))), 0) into held
    from public.payments p
   where p.payee_id = p_user and p.split_subaccount_id is null and p.status in ('successful','partially_refunded')
     and p.verified_at > now() - make_interval(days => hold_days);
  select coalesce(sum(amount_ugx), 0) into pending from public.payouts
   where tutor_id = p_user and status in ('requested','approved','held','processing');
  return greatest(bal - held - pending, 0);
end;
$$;

create or replace function public.my_wallet()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me text := app.requesting_user_id();
begin
  if me is null then raise exception 'sign in required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'balance_ugx', coalesce((select sum(case when e.direction='credit' then e.amount_ugx else -e.amount_ugx end)
                               from public.ledger_entries e join public.ledger_accounts a on a.id = e.account_id where a.owner_id = me), 0),
    'available_ugx', app.available_balance(me),
    'lifetime_earnings_ugx', coalesce((select sum(payee_share_ugx) from public.payments where payee_id = me and status in ('successful','partially_refunded','refunded')), 0),
    'paid_out_ugx', coalesce((select sum(amount_ugx) from public.payouts where tutor_id = me and status = 'paid'), 0),
    'pending_payouts_ugx', coalesce((select sum(amount_ugx) from public.payouts where tutor_id = me and status in ('requested','approved','held','processing')), 0),
    'settled_by_split_ugx', coalesce((select sum(payee_share_ugx) from public.payments where payee_id = me and split_subaccount_id is not null and status in ('successful','partially_refunded')), 0));
end;
$$;

-- =============================================================================
-- Checkout: ONE entry point for every product. Called with the payer's JWT.
-- =============================================================================
create or replace function public.create_checkout(
  p_purpose public.payment_purpose, p_reference_id uuid default null, p_coupon_code text default null,
  p_quantity int default 1, p_note text default null, p_amount_ugx bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me text := app.requesting_user_id();
  qty int := coalesce(p_quantity, 1);
  unit bigint; payee text; ref uuid := p_reference_id; title text; comm_key text; plan_flw bigint;
  c public.coupons; disc bigint := 0; amt bigint; pct numeric; fee bigint := 0; share bigint := 0;
  sub_acct text; p public.payments; prefix text;
  co public.courses; ev public.events; li public.marketplace_listings; se public.tutor_sessions; pl public.subscription_plans;
begin
  if me is null or not app.is_member() then raise exception 'active account required' using errcode = '42501'; end if;
  if qty < 1 or qty > 100 then raise exception 'invalid quantity' using errcode = '22023'; end if;

  case p_purpose
  when 'course' then
    select * into co from public.courses where id = p_reference_id and deleted_at is null;
    if not found or co.status <> 'published' or co.is_free then raise exception 'course not purchasable' using errcode = 'P0002'; end if;
    if co.tutor_id = me then raise exception 'cannot buy your own course' using errcode = '22023'; end if;
    if exists (select 1 from public.enrollments e where e.user_id = me and e.course_id = co.id and e.status in ('active','completed')) then
      raise exception 'already enrolled' using errcode = '23505'; end if;
    unit := co.price_ugx; payee := co.tutor_id; title := co.title; comm_key := 'course'; qty := 1; prefix := 'crs';
  when 'event_ticket' then
    select * into ev from public.events where id = p_reference_id and deleted_at is null;
    if not found or ev.status <> 'published' or ev.starts_at < now() or ev.price_ugx = 0 then
      raise exception 'event not purchasable' using errcode = 'P0002'; end if;
    if exists (select 1 from public.event_registrations r where r.event_id = ev.id and r.user_id = me and r.status in ('registered','attended')) then
      raise exception 'already registered' using errcode = '23505'; end if;
    unit := ev.price_ugx; title := ev.title; comm_key := 'event_ticket'; qty := 1; prefix := 'evt';
    payee := case when exists (select 1 from public.user_roles r where r.user_id = ev.created_by and r.role = 'tutor')
                   and not exists (select 1 from public.user_roles r where r.user_id = ev.created_by and r.role in ('admin','super_admin'))
                  then ev.created_by end;
  when 'marketplace_order' then
    select * into li from public.marketplace_listings where id = p_reference_id and deleted_at is null for update;
    if not found or li.status <> 'active' then raise exception 'listing not available' using errcode = 'P0002'; end if;
    if li.seller_id = me then raise exception 'cannot buy your own listing' using errcode = '22023'; end if;
    if li.stock is not null and li.stock < qty then raise exception 'not enough stock' using errcode = 'P0001'; end if;
    unit := li.price_ugx; payee := li.seller_id; title := li.title; comm_key := 'marketplace_order'; prefix := 'ord';
    ref := gen_random_uuid();     -- order id
  when 'tutor_session' then
    select * into se from public.tutor_sessions where id = p_reference_id for update;
    if not found or se.status <> 'scheduled' or se.starts_at < now() or se.price_ugx = 0 then
      raise exception 'session not purchasable' using errcode = 'P0002'; end if;
    if se.tutor_id = me then raise exception 'cannot book your own session' using errcode = '22023'; end if;
    unit := se.price_ugx; payee := se.tutor_id; title := se.title; comm_key := 'tutor_session'; qty := 1; prefix := 'ses';
  when 'subscription' then
    select * into pl from public.subscription_plans where id = p_reference_id and is_active;
    if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
    if exists (select 1 from public.subscriptions s where s.user_id = me and s.status in ('active','past_due')) then
      raise exception 'already subscribed' using errcode = '23505'; end if;
    unit := pl.amount_ugx; title := pl.name; qty := 1; plan_flw := pl.flw_payment_plan_id; prefix := 'sub';
    ref := gen_random_uuid();     -- subscription id
  when 'donation' then
    if p_amount_ugx is null or p_amount_ugx < 1000 or p_amount_ugx > 10000000 then
      raise exception 'donation must be between 1,000 and 10,000,000 UGX' using errcode = '22023'; end if;
    unit := p_amount_ugx; title := 'Donation to 101 Codecrafts'; qty := 1; prefix := 'don';
  end case;

  -- coupon
  if p_coupon_code is not null and p_purpose <> 'donation' then
    select * into c from public.coupons where upper(code) = upper(p_coupon_code) and is_active
       and starts_at <= now() and (expires_at is null or expires_at > now()) for update;
    if not found
       or (c.applies_to is not null and c.applies_to <> p_purpose)
       or (c.course_id is not null and c.course_id is distinct from p_reference_id)
       or (c.session_id is not null and c.session_id is distinct from p_reference_id)
       or (c.max_redemptions is not null and c.redeemed_count >= c.max_redemptions)
       or (select count(*) from public.coupon_redemptions r where r.coupon_id = c.id and r.user_id = me) >= c.per_user_limit then
      raise exception 'invalid or expired coupon' using errcode = '22023';
    end if;
    disc := case when c.kind = 'percent' then (unit * qty * c.value) / 100 else least(c.value, unit * qty) end;
  end if;

  amt := unit * qty - disc;
  if payee is not null then
    pct := coalesce((select t.commission_pct_override from public.tutor_profiles t where t.user_id = payee),
                    (app.setting('commission_pct') ->> comm_key)::numeric,
                    (app.setting('commission_pct') ->> 'default')::numeric, 20);
    fee := round(amt * pct / 100);
    share := amt - fee;
    if coalesce((app.setting('payments.split_enabled'))::boolean, false) and share > 0 then
      select t.flw_subaccount_id into sub_acct from public.tutor_profiles t where t.user_id = payee and t.verification_status = 'verified';
    end if;
  else
    pct := 0;
  end if;

  insert into public.payments (user_id, payee_id, tx_ref, provider, purpose, reference_id, quantity, list_price_ugx, discount_ugx,
                               amount_ugx, coupon_id, commission_pct, platform_fee_ugx, payee_share_ugx, split_subaccount_id, flw_plan_id)
  values (me, payee, 'ccx-' || prefix || '-' || replace(gen_random_uuid()::text, '-', ''),
          case when amt = 0 then 'coupon' else 'flutterwave' end, p_purpose, ref, qty, unit * qty, disc, amt,
          c.id, pct, case when payee is null then 0 else fee end, share, sub_acct, plan_flw)
  returning * into p;

  if c.id is not null then
    insert into public.coupon_redemptions (coupon_id, user_id, payment_id) values (c.id, me, p.id);
    update public.coupons set redeemed_count = redeemed_count + 1 where id = c.id;
  end if;

  -- pending domain rows
  if p_purpose = 'marketplace_order' then
    insert into public.marketplace_orders (id, listing_id, buyer_id, seller_id, quantity, amount_ugx, payment_id, buyer_note)
    values (ref, li.id, me, li.seller_id, qty, amt, p.id, p_note);
  elsif p_purpose = 'tutor_session' then
    insert into public.session_bookings (session_id, learner_id, status, payment_id, learner_note)
    values (se.id, me, 'pending_payment', p.id, p_note)
    on conflict (session_id, learner_id) do update set status = 'pending_payment', payment_id = excluded.payment_id;
  elsif p_purpose = 'subscription' then
    insert into public.subscriptions (id, user_id, plan_id, status) values (ref, me, pl.id, 'pending');
  end if;

  if amt = 0 then          -- 100% coupon: fulfil immediately, no gateway
    perform public.apply_flutterwave_payment(p.tx_ref, null, 'successful', 0, 'UGX', 'coupon', null);
  end if;

  return jsonb_build_object(
    'payment_id', p.id, 'tx_ref', p.tx_ref, 'amount_ugx', p.amount_ugx, 'list_price_ugx', p.list_price_ugx,
    'discount_ugx', p.discount_ugx, 'currency', 'UGX', 'description', title, 'purpose', p.purpose,
    'reference_id', p.reference_id, 'free', amt = 0, 'payment_plan', plan_flw,
    'subaccounts', case when sub_acct is not null
                        then jsonb_build_array(jsonb_build_object('id', sub_acct, 'transaction_charge_type', 'flat_subaccount',
                                                                  'transaction_charge', share))
                        else '[]'::jsonb end);
end;
$$;

-- Service-role only: store the hosted checkout link.
create or replace function public.set_payment_checkout_link(p_tx_ref text, p_link text)
returns void language sql security definer set search_path = '' as $$
  update public.payments set checkout_link = p_link where tx_ref = p_tx_ref and status = 'pending'
$$;

-- Grants the purchased thing. Internal.
create or replace function app.fulfil_payment(p public.payments)
returns void language plpgsql security definer set search_path = '' as $$
declare o public.marketplace_orders; pl public.subscription_plans; per interval;
begin
  case p.purpose
  when 'course' then
    insert into public.enrollments (user_id, course_id, payment_id) values (p.user_id, p.reference_id, p.id)
    on conflict (user_id, course_id) do update set status = 'active', payment_id = excluded.payment_id;
  when 'event_ticket' then
    insert into public.event_registrations (event_id, user_id, status, payment_id) values (p.reference_id, p.user_id, 'registered', p.id)
    on conflict (event_id, user_id) do update set status = 'registered', payment_id = excluded.payment_id;
  when 'marketplace_order' then
    update public.marketplace_orders set status = 'paid', paid_at = now() where id = p.reference_id and status = 'pending_payment' returning * into o;
    if found then
      update public.marketplace_listings
         set stock = case when stock is null then null else greatest(stock - o.quantity, 0) end,
             status = case when stock is not null and stock - o.quantity <= 0 then 'sold_out'::public.listing_status else status end
       where id = o.listing_id;
      perform app.notify(o.seller_id, 'order.paid', 'New paid order', 'An order for your listing was paid.', '/dashboard.html#orders', jsonb_build_object('order_id', o.id));
    end if;
  when 'tutor_session' then
    update public.session_bookings set status = 'confirmed' where payment_id = p.id;
    perform app.notify(p.payee_id, 'session.booked', 'New session booking', 'A learner booked your session.', '/dashboard.html#sessions');
  when 'subscription' then
    select sp.* into pl from public.subscription_plans sp join public.subscriptions s on s.plan_id = sp.id where s.id = p.reference_id;
    per := case pl.interval when 'monthly' then interval '1 month' when 'quarterly' then interval '3 months' else interval '1 year' end;
    update public.subscriptions set status = 'active', started_at = coalesce(started_at, now()),
           current_period_start = now(), current_period_end = greatest(coalesce(current_period_end, now()), now()) + per
     where id = p.reference_id;
  else null;
  end case;
end;
$$;

-- Service-role only. Apply a VERIFIED Flutterwave result (the server
-- re-fetches /v3/transactions/:id/verify first). Idempotent.
create or replace function public.apply_flutterwave_payment(
  p_tx_ref text, p_flw_id bigint, p_status text, p_amount numeric, p_currency text,
  p_payment_type text default null, p_raw jsonb default null)
returns public.payments language plpgsql security definer set search_path = '' as $$
declare
  p public.payments; inv_no text;
  cash uuid := app.ledger_account('platform:cash_flutterwave', 'asset', null, 'Flutterwave balance');
  rev_comm uuid := app.ledger_account('platform:revenue_commission', 'revenue', null, 'Commission revenue');
  rev_direct uuid := app.ledger_account('platform:revenue_direct', 'revenue', null, 'Direct sales revenue');
begin
  select * into p from public.payments where tx_ref = p_tx_ref for update;
  if not found then raise exception 'unknown tx_ref %', p_tx_ref using errcode = 'P0002'; end if;
  if p.status in ('successful','refunded','partially_refunded') then return p; end if;     -- idempotent

  if p_status = 'successful' then
    if upper(coalesce(p_currency, '')) <> 'UGX' or p_amount is null or p_amount < p.amount_ugx then
      update public.payments set status = 'failed', failure_reason = 'amount_or_currency_mismatch',
             flw_transaction_id = p_flw_id, raw = p_raw, verified_at = now() where id = p.id returning * into p;
      return p;
    end if;
    update public.payments set status = 'successful', flw_transaction_id = p_flw_id, payment_type = p_payment_type,
           raw = p_raw, verified_at = now(), failure_reason = null where id = p.id returning * into p;

    if p.amount_ugx > 0 then
      if p.payee_id is not null then
        perform app.post_ledger('payment', jsonb_build_array(
          jsonb_build_object('account', cash, 'direction', 'debit', 'amount', p.amount_ugx),
          jsonb_build_object('account', rev_comm, 'direction', 'credit', 'amount', p.platform_fee_ugx),
          jsonb_build_object('account', app.payable_account(p.payee_id), 'direction', 'credit', 'amount', p.payee_share_ugx)),
          p.id, null, null, p.purpose::text || ' ' || p.tx_ref);
        if p.split_subaccount_id is not null and p.payee_share_ugx > 0 then
          perform app.post_ledger('split_settlement', jsonb_build_array(
            jsonb_build_object('account', app.payable_account(p.payee_id), 'direction', 'debit', 'amount', p.payee_share_ugx),
            jsonb_build_object('account', cash, 'direction', 'credit', 'amount', p.payee_share_ugx)),
            p.id, null, null, 'Settled to subaccount ' || p.split_subaccount_id);
        end if;
      else
        perform app.post_ledger('payment', jsonb_build_array(
          jsonb_build_object('account', cash, 'direction', 'debit', 'amount', p.amount_ugx),
          jsonb_build_object('account', rev_direct, 'direction', 'credit', 'amount', p.amount_ugx)),
          p.id, null, null, p.purpose::text || ' ' || p.tx_ref);
      end if;
    end if;

    inv_no := 'CCX-' || to_char(now() at time zone 'Africa/Kampala', 'YYYY') || '-' || lpad(nextval('public.invoice_seq')::text, 6, '0');
    insert into public.invoices (number, payment_id, user_id, items, subtotal_ugx, discount_ugx, total_ugx)
    values (inv_no, p.id, p.user_id,
            jsonb_build_array(jsonb_build_object('purpose', p.purpose, 'reference_id', p.reference_id, 'quantity', p.quantity,
                                                 'amount_ugx', p.list_price_ugx)),
            p.list_price_ugx, p.discount_ugx, p.amount_ugx)
    on conflict (payment_id) do nothing;

    perform app.fulfil_payment(p);
    perform app.notify(p.user_id, 'payment.successful', 'Payment received',
                       'We received UGX ' || to_char(p.amount_ugx, 'FM999,999,999') || '. Receipt ' || inv_no || '.', '/dashboard.html#payments',
                       jsonb_build_object('tx_ref', p.tx_ref, 'invoice', inv_no));
  elsif p_status in ('failed','cancelled','abandoned') then
    update public.payments set status = p_status::public.payment_status, flw_transaction_id = coalesce(p_flw_id, flw_transaction_id),
           raw = p_raw, verified_at = now() where id = p.id returning * into p;
    if p.purpose = 'marketplace_order' then
      update public.marketplace_orders set status = 'cancelled' where id = p.reference_id and status = 'pending_payment';
    elsif p.purpose = 'tutor_session' then
      update public.session_bookings set status = 'cancelled' where payment_id = p.id and status = 'pending_payment';
    elsif p.purpose = 'subscription' then
      update public.subscriptions set status = 'expired' where id = p.reference_id and status = 'pending';
    end if;
    if p.coupon_id is not null then
      delete from public.coupon_redemptions where payment_id = p.id;
      update public.coupons set redeemed_count = greatest(redeemed_count - 1, 0) where id = p.coupon_id;
    end if;
  end if;
  return p;
end;
$$;

-- Service-role only: Flutterwave-initiated subscription renewal (tx_ref is
-- generated by Flutterwave, so we create the payment row here).
create or replace function public.record_subscription_renewal(p_flw_plan_id bigint, p_customer_email text, p_flw_id bigint,
                                                              p_tx_ref text, p_amount numeric, p_currency text, p_raw jsonb)
returns public.payments language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions; pl public.subscription_plans; uid text; p public.payments;
begin
  select * into p from public.payments where flw_transaction_id = p_flw_id;
  if found then return p; end if;
  select pp.user_id into uid from public.profile_private pp where lower(pp.email) = lower(p_customer_email);
  select * into pl from public.subscription_plans where flw_payment_plan_id = p_flw_plan_id;
  select * into s from public.subscriptions where user_id = uid and plan_id = pl.id order by created_at desc limit 1;
  if uid is null or pl.id is null or s.id is null then raise exception 'subscription not found for renewal' using errcode = 'P0002'; end if;
  insert into public.payments (user_id, tx_ref, purpose, reference_id, list_price_ugx, amount_ugx, flw_plan_id)
  values (uid, left(regexp_replace(coalesce(p_tx_ref, 'flw-' || p_flw_id), '[^A-Za-z0-9_\-]', '-', 'g'), 80), 'subscription', s.id, pl.amount_ugx, pl.amount_ugx, p_flw_plan_id)
  on conflict (tx_ref) do nothing;
  return public.apply_flutterwave_payment(left(regexp_replace(coalesce(p_tx_ref, 'flw-' || p_flw_id), '[^A-Za-z0-9_\-]', '-', 'g'), 80),
                                          p_flw_id, 'successful', p_amount, p_currency, 'subscription_renewal', p_raw);
end;
$$;

-- ------------------------------------------------------------ refunds ----
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
  insert into public.refunds (payment_id, amount_ugx, reason, requested_by) values (p.id, p.amount_ugx - p.refunded_ugx, p_reason, p.user_id)
  returning * into r;
  return r;
end;
$$;

-- Service-role only, after the Flutterwave refund API answered.
create or replace function public.complete_refund(p_refund_id uuid, p_success boolean, p_flw_refund_id bigint default null,
                                                  p_failure text default null, p_raw jsonb default null)
returns public.refunds language plpgsql security definer set search_path = '' as $$
declare r public.refunds; p public.payments; payee_part bigint; plat_part bigint;
  cash uuid := app.ledger_account('platform:cash_flutterwave', 'asset', null, 'Flutterwave balance');
  contra uuid := app.ledger_account('platform:refunds', 'contra_revenue', null, 'Refunds');
begin
  select * into r from public.refunds where id = p_refund_id for update;
  if not found then raise exception 'refund not found' using errcode = 'P0002'; end if;
  if r.status in ('completed','failed','rejected') then return r; end if;
  if not p_success then
    update public.refunds set status = 'failed', failure_reason = p_failure, raw = p_raw where id = r.id returning * into r;
    return r;
  end if;
  select * into p from public.payments where id = r.payment_id for update;
  if r.amount_ugx > p.amount_ugx - p.refunded_ugx then raise exception 'refund exceeds remaining amount' using errcode = '22023'; end if;
  payee_part := case when p.payee_id is null or p.amount_ugx = 0 then 0 else (r.amount_ugx * p.payee_share_ugx) / p.amount_ugx end;
  plat_part := r.amount_ugx - payee_part;
  perform app.post_ledger('refund', jsonb_build_array(
      jsonb_build_object('account', contra, 'direction', 'debit', 'amount', plat_part),
      jsonb_build_object('account', case when payee_part > 0 then app.payable_account(p.payee_id) else contra end, 'direction', 'debit', 'amount', payee_part),
      jsonb_build_object('account', cash, 'direction', 'credit', 'amount', r.amount_ugx)),
    p.id, r.id, null, 'Refund ' || p.tx_ref);
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

-- ------------------------------------------------------------ payouts ----
create or replace function public.request_payout(p_amount_ugx bigint, p_method_id uuid default null)
returns public.payouts language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); m uuid; po public.payouts;
        minimum bigint := coalesce((app.setting('payouts.min_ugx'))::bigint, 20000);
begin
  if not app.is_tutor() then raise exception 'verified tutors only' using errcode = '42501'; end if;
  m := coalesce(p_method_id, (select default_payout_method_id from public.tutor_profiles where user_id = me));
  if m is null or not exists (select 1 from public.payout_methods where id = m and tutor_id = me and deleted_at is null) then
    raise exception 'add a payout method first' using errcode = '22023'; end if;
  if p_amount_ugx is null or p_amount_ugx < minimum then raise exception 'minimum payout is % UGX', minimum using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('payout:' || me));        -- no double-spend via parallel requests
  if p_amount_ugx > app.available_balance(me) then raise exception 'insufficient available balance' using errcode = 'P0001'; end if;
  insert into public.payouts (tutor_id, amount_ugx, method_id) values (me, p_amount_ugx, m) returning * into po;
  return po;
end;
$$;

-- Service-role only: transfer initiated at Flutterwave.
create or replace function public.mark_payout_processing(p_payout_id uuid, p_flw_transfer_id bigint)
returns public.payouts language sql security definer set search_path = '' as $$
  update public.payouts set status = 'processing', flw_transfer_id = p_flw_transfer_id
   where id = p_payout_id and status = 'approved' returning *
$$;

-- Service-role only: transfer webhook / verification result. Idempotent.
create or replace function public.complete_payout(p_reference text, p_success boolean, p_failure text default null, p_raw jsonb default null)
returns public.payouts language plpgsql security definer set search_path = '' as $$
declare po public.payouts; cash uuid := app.ledger_account('platform:cash_flutterwave', 'asset', null, 'Flutterwave balance');
begin
  select * into po from public.payouts where reference = p_reference for update;
  if not found then raise exception 'payout not found' using errcode = 'P0002'; end if;
  if po.status in ('paid','failed','rejected') then return po; end if;
  if p_success then
    perform app.post_ledger('payout', jsonb_build_array(
      jsonb_build_object('account', app.payable_account(po.tutor_id), 'direction', 'debit', 'amount', po.amount_ugx),
      jsonb_build_object('account', cash, 'direction', 'credit', 'amount', po.amount_ugx)), null, null, po.id, 'Payout ' || po.reference);
    update public.payouts set status = 'paid', processed_at = now(), raw = p_raw where id = po.id returning * into po;
    perform app.notify(po.tutor_id, 'payout.paid', 'Payout sent', 'UGX ' || to_char(po.amount_ugx, 'FM999,999,999') || ' was sent to your account.', '/dashboard.html#earnings');
  else
    update public.payouts set status = 'failed', failure_reason = p_failure, raw = p_raw, processed_at = now() where id = po.id returning * into po;
    perform app.notify(po.tutor_id, 'payout.failed', 'Payout failed', coalesce(p_failure, 'The transfer failed; funds are back in your balance.'), '/dashboard.html#earnings');
  end if;
  return po;
end;
$$;
