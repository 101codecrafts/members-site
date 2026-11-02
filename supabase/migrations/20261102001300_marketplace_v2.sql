-- =============================================================================
-- Marketplace v2 (multi-vendor). Stores with KYC, products (5 types) with
-- variants, tiered/MOQ pricing and a category tree, carts, wishlists,
-- per-vendor orders from one checkout, tracking events, verified-purchase
-- reviews, Q&A, coupons, shipping zones (Kampala boda / pickup / courier),
-- returns & disputes with ESCROW in the ledger (released on delivery
-- confirmation or 7 days after delivery, minus commission), signed digital
-- downloads, RFQ / bulk quotes, external (affiliate) products via /go/<id>.
-- The v1 marketplace_listings/orders stay for backwards compatibility.
-- =============================================================================

create type public.mkt_product_type as enum ('digital','physical','service','software_license','course_bundle');
create type public.mkt_kyc_status   as enum ('pending','verified','rejected','suspended');
create type public.mkt_order_status as enum ('pending_payment','paid','processing','shipped','out_for_delivery','delivered','completed','cancelled','refunded','disputed');
create type public.mkt_ship_method  as enum ('boda','pickup','courier','digital');
create type public.mkt_dispute_status as enum ('open','vendor_accepted','escalated','resolved_refund','resolved_release');
create type public.external_source  as enum ('amazon','alibaba','aliexpress','jumia','other');

alter table public.ledger_transactions drop constraint if exists ledger_transactions_kind_check;
alter table public.ledger_transactions add constraint ledger_transactions_kind_check
  check (kind in ('payment','split_settlement','refund','payout','adjustment','escrow_hold','escrow_release','escrow_refund'));

insert into public.site_settings (key, value, is_public, description) values
  ('marketplace.escrow_days', '7', true, 'Escrow auto-release N days after delivery when the buyer does not confirm or dispute'),
  ('marketplace.download_ttl_seconds', '300', false, 'Lifetime of signed digital-download URLs'),
  ('marketplace.max_downloads', '10', false, 'Downloads per purchased digital item')
on conflict (key) do nothing;

-- ------------------------------------------------------------ categories ----
create table public.mkt_categories (
  id        uuid primary key default gen_random_uuid(),
  parent_id uuid references public.mkt_categories(id) on delete cascade,
  slug      text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name      text not null,
  sort      int not null default 0
);
insert into public.mkt_categories (slug, name, sort) values
  ('electronics','Electronics & Gadgets',1),('software','Software & Licences',2),('courses','Courses & Bundles',3),
  ('templates','Templates & Assets',4),('services','Services',5),('books','Books',6),('iot','IoT & Components',7);

-- ---------------------------------------------------------------- stores ----
create table public.mkt_stores (
  id             uuid primary key default gen_random_uuid(),
  owner_id       text not null unique references public.profiles(id) on delete cascade,
  slug           text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  name           text not null check (char_length(name) between 2 and 80),
  description    text check (char_length(description) <= 4000),
  logo_url       text check (logo_url is null or logo_url ~ '^https://'),
  kyc_status     public.mkt_kyc_status not null default 'pending',
  kyc_note       text,
  commission_pct numeric(5,2) check (commission_pct between 0 and 50),   -- null = site default
  rating_avg     numeric(3,2) not null default 0,
  rating_count   int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger mkt_stores_updated_at before update on public.mkt_stores for each row execute function app.set_updated_at();

-- KYC documents and payout phone: owner + admin only.
create table public.mkt_store_private (
  store_id      uuid primary key references public.mkt_stores(id) on delete cascade,
  legal_name    text,
  phone         text check (phone is null or phone ~ '^\+?[0-9]{9,15}$'),
  kyc_documents text[] not null default '{}',        -- storage paths in the private kyc bucket
  updated_at    timestamptz not null default now()
);

create or replace function app.guard_store()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_admin() or app.is_backend() or pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := app.requesting_user_id(); new.kyc_status := 'pending'; new.kyc_note := null;
    new.commission_pct := null; new.rating_avg := 0; new.rating_count := 0;
  elsif new.kyc_status is distinct from old.kyc_status or new.commission_pct is distinct from old.commission_pct
     or new.owner_id <> old.owner_id or new.rating_avg <> old.rating_avg or new.rating_count <> old.rating_count or new.kyc_note is distinct from old.kyc_note then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger mkt_stores_guard before insert or update on public.mkt_stores for each row execute function app.guard_store();

create or replace function app.owns_store(p_store uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mkt_stores s where s.id = p_store and s.owner_id = app.requesting_user_id())
$$;
create or replace function app.store_verified(p_store uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mkt_stores s where s.id = p_store and s.kyc_status = 'verified')
$$;

-- -------------------------------------------------------------- products ----
create table public.mkt_products (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references public.mkt_stores(id) on delete cascade,
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,100}$'),
  title           text not null check (char_length(title) between 3 and 160),
  description_md  text check (char_length(description_md) <= 30000),
  type            public.mkt_product_type not null,
  category_id     uuid references public.mkt_categories(id) on delete set null,
  images          text[] not null default '{}' check (cardinality(images) <= 12),
  price_ugx       bigint not null check (price_ugx between 500 and 100000000),
  compare_at_ugx  bigint check (compare_at_ugx is null or compare_at_ugx > price_ugx),
  stock           int check (stock is null or stock >= 0),          -- null = unlimited (digital/service)
  moq             int not null default 1 check (moq between 1 and 100000),
  tags            text[] not null default '{}',
  attributes      jsonb not null default '{}',
  status          public.content_status not null default 'draft',
  age_rating      public.age_rating not null default 'all',
  rating_avg      numeric(3,2) not null default 0,
  rating_count    int not null default 0,
  sold_count      int not null default 0,
  search          tsvector generated always as (
                    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                    setweight(to_tsvector('english', app.tags_to_text(tags)), 'B') ||
                    setweight(to_tsvector('english', left(coalesce(description_md,''), 20000)), 'C')) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index mkt_products_search_idx on public.mkt_products using gin (search);
create index mkt_products_cat_idx on public.mkt_products (category_id, price_ugx) where status = 'published';
create index mkt_products_store_idx on public.mkt_products (store_id);
create trigger mkt_products_updated_at before update on public.mkt_products for each row execute function app.set_updated_at();

create or replace function app.guard_product()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- pg_trigger_depth() > 1: aggregate maintenance from our own definer triggers (reviews)
  if app.is_admin() or app.is_backend() or pg_trigger_depth() > 1 then return new; end if;
  if not app.owns_store(new.store_id) then raise exception 'not your store' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then new.rating_avg := 0; new.rating_count := 0; new.sold_count := 0; end if;
  if tg_op = 'UPDATE' and (new.rating_avg <> old.rating_avg or new.rating_count <> old.rating_count or new.sold_count <> old.sold_count or new.store_id <> old.store_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- vendors may publish only once their store passed KYC
  if new.status = 'published' and not app.store_verified(new.store_id) then raise exception 'store KYC not verified' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger mkt_products_guard before insert or update on public.mkt_products for each row execute function app.guard_product();

create or replace function app.can_view_mkt_product(p_product uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.mkt_products p where p.id = p_product and (
    app.is_admin() or app.owns_store(p.store_id)
    or (p.status = 'published' and app.store_verified(p.store_id) and app.age_ok(p.age_rating))))
$$;

create table public.mkt_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.mkt_products(id) on delete cascade,
  sku        text,
  name       text not null,
  options    jsonb not null default '{}',
  price_ugx  bigint check (price_ugx between 500 and 100000000),   -- null = product price
  stock      int check (stock is null or stock >= 0),
  unique (product_id, name)
);
create table public.mkt_price_tiers (
  product_id     uuid not null references public.mkt_products(id) on delete cascade,
  min_qty        int not null check (min_qty >= 2),
  unit_price_ugx bigint not null check (unit_price_ugx >= 100),
  primary key (product_id, min_qty)
);
create table public.mkt_digital_assets (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.mkt_products(id) on delete cascade,
  storage_path text not null check (storage_path !~ '\.\.'),
  filename     text not null,
  license_template text            -- software_license: key/template delivered after payment
);

-- ------------------------------------------------- shipping / pickup points ----
create table public.mkt_shipping_zones (
  id        uuid primary key default gen_random_uuid(),
  store_id  uuid references public.mkt_stores(id) on delete cascade,       -- null = platform default
  name      text not null,
  method    public.mkt_ship_method not null,
  fee_ugx   bigint not null default 0 check (fee_ugx between 0 and 2000000),
  eta_days  int not null default 1,
  areas     text[] not null default '{}',
  active    boolean not null default true
);
insert into public.mkt_shipping_zones (name, method, fee_ugx, eta_days, areas) values
  ('Kampala boda (same day)', 'boda', 5000, 0, '{Kampala,Wakiso}'), ('Greater Kampala boda', 'boda', 10000, 1, '{Mukono,Entebbe,Mpigi}'),
  ('Pickup point', 'pickup', 0, 1, '{}'), ('Upcountry courier', 'courier', 15000, 3, '{Uganda}'), ('Instant digital delivery', 'digital', 0, 0, '{}');
create table public.mkt_pickup_points (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  address text not null,
  lat     numeric(9,6), lng numeric(9,6),
  hours   text,
  active  boolean not null default true
);

-- ---------------------------------------------------------- cart, wishlist ----
create table public.mkt_cart_items (
  user_id    text not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.mkt_products(id) on delete cascade,
  variant_id uuid references public.mkt_variants(id) on delete cascade,
  qty        int not null check (qty between 1 and 100000),
  added_at   timestamptz not null default now(),
  unique nulls not distinct (user_id, product_id, variant_id)
);
create table public.mkt_wishlist (
  user_id    text not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.mkt_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ------------------------------------------------------------- coupons ----
create table public.mkt_coupons (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid references public.mkt_stores(id) on delete cascade,     -- null = platform-funded
  code         text not null check (code ~ '^[A-Z0-9_-]{3,32}$'),
  kind         text not null check (kind in ('percent','fixed')),
  value        bigint not null check (value > 0),
  min_subtotal bigint not null default 0,
  max_uses     int, used int not null default 0,
  expires_at   timestamptz,
  active       boolean not null default true,
  unique nulls not distinct (store_id, code),
  check (kind <> 'percent' or value <= 90)
);

-- ---------------------------------------------------------------- orders ----
create table public.mkt_order_groups (
  id         uuid primary key default gen_random_uuid(),
  buyer_id   text not null references public.profiles(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete set null,
  total_ugx  bigint not null check (total_ugx >= 0),
  created_at timestamptz not null default now()
);
create table public.mkt_orders (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.mkt_order_groups(id) on delete cascade,
  buyer_id        text not null references public.profiles(id) on delete restrict,
  store_id        uuid not null references public.mkt_stores(id) on delete restrict,
  status          public.mkt_order_status not null default 'pending_payment',
  subtotal_ugx    bigint not null, shipping_ugx bigint not null default 0, discount_ugx bigint not null default 0,
  total_ugx       bigint not null check (total_ugx = subtotal_ugx + shipping_ugx - discount_ugx and total_ugx >= 0),
  commission_pct  numeric(5,2) not null,
  shipping_method public.mkt_ship_method not null,
  shipping_zone_id uuid references public.mkt_shipping_zones(id) on delete set null,
  pickup_point_id uuid references public.mkt_pickup_points(id) on delete set null,
  shipping_address jsonb,
  carrier         text, tracking_code text,
  paid_at timestamptz, delivered_at timestamptz, auto_release_at timestamptz, released_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index mkt_orders_buyer_idx on public.mkt_orders (buyer_id, created_at desc);
create index mkt_orders_store_idx on public.mkt_orders (store_id, created_at desc);
create index mkt_orders_release_idx on public.mkt_orders (auto_release_at) where status = 'delivered' and released_at is null;
create trigger mkt_orders_updated_at before update on public.mkt_orders for each row execute function app.set_updated_at();

create table public.mkt_order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.mkt_orders(id) on delete cascade,
  product_id     uuid not null references public.mkt_products(id) on delete restrict,
  variant_id     uuid references public.mkt_variants(id) on delete set null,
  title          text not null,
  type           public.mkt_product_type not null,
  unit_price_ugx bigint not null,
  qty            int not null check (qty >= 1),
  line_total_ugx bigint not null check (line_total_ugx = unit_price_ugx * qty),
  license_key    text,
  downloads      int not null default 0
);
create table public.mkt_order_events (
  id        bigint generated always as identity primary key,
  order_id  uuid not null references public.mkt_orders(id) on delete cascade,
  status    public.mkt_order_status not null,
  note      text,
  actor_id  text,
  at        timestamptz not null default now()
);
create index mkt_order_events_order_idx on public.mkt_order_events (order_id, at);

-- --------------------------------------------- reviews, Q&A, disputes, RFQ ----
create table public.mkt_reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.mkt_products(id) on delete cascade,
  user_id    text not null references public.profiles(id) on delete cascade,
  order_id   uuid not null references public.mkt_orders(id) on delete cascade,
  rating     int not null check (rating between 1 and 5),
  body       text check (char_length(body) <= 4000),
  vendor_reply text,
  created_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create table public.mkt_questions (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.mkt_products(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  body        text not null check (char_length(body) between 3 and 1000),
  answer      text check (char_length(answer) <= 2000),
  answered_by text references public.profiles(id) on delete set null,
  answered_at timestamptz,
  created_at  timestamptz not null default now()
);
create table public.mkt_disputes (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references public.mkt_orders(id) on delete cascade,
  opened_by   text not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('return','refund','not_received','not_as_described')),
  reason      text not null check (char_length(reason) between 5 and 4000),
  evidence    text[] not null default '{}',
  status      public.mkt_dispute_status not null default 'open',
  refund_ugx  bigint,
  resolution_note text,
  resolved_by text references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create table public.mkt_rfqs (
  id           uuid primary key default gen_random_uuid(),
  buyer_id     text not null references public.profiles(id) on delete cascade,
  product_id   uuid references public.mkt_products(id) on delete set null,
  store_id     uuid references public.mkt_stores(id) on delete cascade,   -- null = open to all verified vendors
  title        text not null check (char_length(title) between 3 and 160),
  details      text check (char_length(details) <= 8000),
  qty          int not null check (qty >= 1),
  target_unit_ugx bigint,
  status       text not null default 'open' check (status in ('open','quoted','accepted','closed')),
  created_at   timestamptz not null default now()
);
create table public.mkt_rfq_quotes (
  id             uuid primary key default gen_random_uuid(),
  rfq_id         uuid not null references public.mkt_rfqs(id) on delete cascade,
  store_id       uuid not null references public.mkt_stores(id) on delete cascade,
  unit_price_ugx bigint not null check (unit_price_ugx >= 100),
  moq            int not null default 1,
  valid_until    timestamptz not null,
  note           text,
  status         text not null default 'offered' check (status in ('offered','accepted','declined','expired')),
  created_at     timestamptz not null default now(),
  unique (rfq_id, store_id)
);

-- ------------------------------------------------------- external products ----
create table public.external_products (
  id           uuid primary key default gen_random_uuid(),
  source       public.external_source not null,
  title        text not null check (char_length(title) between 3 and 200),
  url          text not null check (url ~ '^https://'),
  image_url    text check (image_url is null or image_url ~ '^https://'),
  price_text   text,
  category_id  uuid references public.mkt_categories(id) on delete set null,
  affiliate_tag text,                 -- TODO: Amazon Associates / AliExpress Portals / Jumia KOL ids once approved
  approved     boolean not null default false,
  clicks       int not null default 0,
  created_by   text references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create table public.external_product_clicks (
  id         bigint generated always as identity primary key,
  product_id uuid not null references public.external_products(id) on delete cascade,
  user_id    text references public.profiles(id) on delete set null,
  ip_hash    text,
  referrer   text,
  at         timestamptz not null default now()
);

-- ================================================================ RPCs ========
create or replace function app.mkt_unit_price(p_product uuid, p_variant uuid, p_qty int)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select t.unit_price_ugx from public.mkt_price_tiers t where t.product_id = p_product and t.min_qty <= p_qty order by t.min_qty desc limit 1),
    (select v.price_ugx from public.mkt_variants v where v.id = p_variant and v.product_id = p_product),
    (select p.price_ugx from public.mkt_products p where p.id = p_product))
$$;

-- Server-priced checkout of the caller's whole cart: one payment, one order per store.
-- p_shipping: {"<store_id>": {"zone_id": "...", "pickup_point_id": "...", "address": {...}}}
create or replace function public.mkt_checkout(p_shipping jsonb default '{}', p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); g public.mkt_order_groups; st record; o public.mkt_orders; it record;
  sub bigint; ship bigint; disc bigint; z public.mkt_shipping_zones; cp public.mkt_coupons; pay public.payments;
  total bigint := 0; pct numeric; all_digital boolean; ship_cfg jsonb;
begin
  if me is null or not app.is_member() then raise exception 'members only' using errcode = '42501'; end if;
  if not exists (select 1 from public.mkt_cart_items where user_id = me) then raise exception 'cart is empty' using errcode = '22023'; end if;
  -- validate every line (visibility, stock, MOQ)
  for it in select c.*, p.store_id, p.stock pstock, p.moq, v.stock vstock from public.mkt_cart_items c join public.mkt_products p on p.id = c.product_id
            left join public.mkt_variants v on v.id = c.variant_id where c.user_id = me loop
    if not app.can_view_mkt_product(it.product_id) or not app.store_verified(it.store_id) then raise exception 'product unavailable' using errcode = '22023'; end if;
    if it.qty < it.moq then raise exception 'minimum order quantity is %', it.moq using errcode = '22023'; end if;
    if coalesce(it.vstock, it.pstock, 2147483647) < it.qty then raise exception 'insufficient stock' using errcode = '22023'; end if;
  end loop;
  insert into public.mkt_order_groups (buyer_id, total_ugx) values (me, 0) returning * into g;
  for st in select distinct p.store_id from public.mkt_cart_items c join public.mkt_products p on p.id = c.product_id where c.user_id = me loop
    select coalesce(sum(app.mkt_unit_price(c.product_id, c.variant_id, c.qty) * c.qty), 0), bool_and(p.type in ('digital','software_license','course_bundle'))
      into sub, all_digital
      from public.mkt_cart_items c join public.mkt_products p on p.id = c.product_id where c.user_id = me and p.store_id = st.store_id;
    ship_cfg := coalesce(p_shipping -> st.store_id::text, '{}');
    if all_digital then
      select * into z from public.mkt_shipping_zones where method = 'digital' and store_id is null and active limit 1;
    else
      select * into z from public.mkt_shipping_zones where id = nullif(ship_cfg ->> 'zone_id', '')::uuid and active
         and (store_id is null or store_id = st.store_id) and method <> 'digital';
      if z.id is null then raise exception 'choose a shipping option for each store' using errcode = '22023'; end if;
    end if;
    ship := coalesce(z.fee_ugx, 0); disc := 0;
    if p_coupon is not null then
      select * into cp from public.mkt_coupons where code = upper(p_coupon) and active and (store_id = st.store_id or store_id is null)
         and (expires_at is null or expires_at > now()) and (max_uses is null or used < max_uses) and min_subtotal <= sub
       order by store_id nulls last limit 1;
      if cp.id is not null then
        disc := case when cp.kind = 'percent' then sub * cp.value / 100 else least(cp.value, sub) end;
        update public.mkt_coupons set used = used + 1 where id = cp.id;
      end if;
    end if;
    pct := coalesce((select s.commission_pct from public.mkt_stores s where s.id = st.store_id),
                    (app.setting('commission_pct') ->> 'marketplace_order')::numeric, 10);
    insert into public.mkt_orders (group_id, buyer_id, store_id, subtotal_ugx, shipping_ugx, discount_ugx, total_ugx, commission_pct,
                                   shipping_method, shipping_zone_id, pickup_point_id, shipping_address)
    values (g.id, me, st.store_id, sub, ship, disc, sub + ship - disc, pct, coalesce(z.method, 'digital'), z.id,
            nullif(ship_cfg ->> 'pickup_point_id', '')::uuid, ship_cfg -> 'address')
    returning * into o;
    insert into public.mkt_order_items (order_id, product_id, variant_id, title, type, unit_price_ugx, qty, line_total_ugx)
    select o.id, c.product_id, c.variant_id, p.title || coalesce(' — ' || v.name, ''), p.type,
           app.mkt_unit_price(c.product_id, c.variant_id, c.qty), c.qty, app.mkt_unit_price(c.product_id, c.variant_id, c.qty) * c.qty
      from public.mkt_cart_items c join public.mkt_products p on p.id = c.product_id left join public.mkt_variants v on v.id = c.variant_id
     where c.user_id = me and p.store_id = st.store_id;
    insert into public.mkt_order_events (order_id, status, actor_id) values (o.id, 'pending_payment', me);
    total := total + o.total_ugx;
  end loop;
  -- payee null: funds land in platform escrow on payment (see app.mkt_fulfil); vendors are paid on release.
  insert into public.payments (user_id, payee_id, tx_ref, provider, purpose, reference_id, quantity, list_price_ugx, discount_ugx, amount_ugx)
  values (me, null, 'ccx-mkt-' || replace(gen_random_uuid()::text, '-', ''), case when total = 0 then 'coupon' else 'flutterwave' end,
          'marketplace_order', g.id, 1, total, 0, total) returning * into pay;
  update public.mkt_order_groups set payment_id = pay.id, total_ugx = total where id = g.id;
  delete from public.mkt_cart_items where user_id = me;
  if total = 0 then perform app.apply_payment_internal(pay.tx_ref, null, 'successful', 0, 'UGX', 'coupon', null); end if;
  return jsonb_build_object('payment_id', pay.id, 'tx_ref', pay.tx_ref, 'amount_ugx', total, 'currency', 'UGX', 'group_id', g.id,
                            'description', '101 Codecrafts Marketplace order', 'purpose', 'marketplace_order', 'free', total = 0);
end;
$$;

-- On verified payment: orders → paid, stock decremented, revenue reclassified into escrow.
create or replace function app.mkt_fulfil(p public.payments)
returns void language plpgsql security definer set search_path = '' as $$
declare o record; ttl int := coalesce((app.setting('marketplace.escrow_days'))::int, 7);
  escrow uuid := app.ledger_account('platform:escrow_marketplace', 'liability', null, 'Marketplace escrow');
  rev_direct uuid := app.ledger_account('platform:revenue_direct', 'revenue', null, 'Direct sales revenue');
begin
  if p.amount_ugx > 0 then
    perform app.post_ledger('escrow_hold', jsonb_build_array(
      jsonb_build_object('account', rev_direct, 'direction', 'debit', 'amount', p.amount_ugx),
      jsonb_build_object('account', escrow, 'direction', 'credit', 'amount', p.amount_ugx)), p.id, null, null, 'Marketplace escrow ' || p.tx_ref);
  end if;
  for o in update public.mkt_orders set status = 'paid', paid_at = now() where group_id = p.reference_id and status = 'pending_payment' returning * loop
    insert into public.mkt_order_events (order_id, status, actor_id) values (o.id, 'paid', 'system');
    update public.mkt_products pr set stock = case when pr.stock is null then null else greatest(pr.stock - i.qty, 0) end, sold_count = pr.sold_count + i.qty
      from public.mkt_order_items i where i.order_id = o.id and i.product_id = pr.id and i.variant_id is null;
    update public.mkt_variants v set stock = case when v.stock is null then null else greatest(v.stock - i.qty, 0) end
      from public.mkt_order_items i where i.order_id = o.id and i.variant_id = v.id;
    -- digital-only orders are delivered instantly; escrow clock starts now
    if o.shipping_method = 'digital' then
      update public.mkt_order_items set license_key = case when type = 'software_license' then upper(substr(md5(gen_random_uuid()::text), 1, 20)) end where order_id = o.id;
      update public.mkt_orders set status = 'delivered', delivered_at = now(), auto_release_at = now() + make_interval(days => ttl) where id = o.id;
      insert into public.mkt_order_events (order_id, status, actor_id) values (o.id, 'delivered', 'system');
    end if;
    perform app.notify((select owner_id from public.mkt_stores where id = o.store_id), 'order.paid', 'New paid order', 'You have a new marketplace order.', '/seller.html#orders', jsonb_build_object('order_id', o.id));
  end loop;
end;
$$;

-- Dispatch: marketplace v2 payments first, then the original fulfilment.
alter function app.fulfil_payment(public.payments) rename to fulfil_payment_v1;
create or replace function app.fulfil_payment(p public.payments)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p.purpose = 'marketplace_order' and exists (select 1 from public.mkt_order_groups g where g.id = p.reference_id) then
    perform app.mkt_fulfil(p);
  else
    perform app.fulfil_payment_v1(p);
  end if;
end;
$$;

-- Release escrow for one order: commission to platform, net to the vendor's payable (withdrawable after the payout hold).
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

-- Vendor moves an order through fulfilment.
create or replace function public.mkt_vendor_update_order(p_order uuid, p_status public.mkt_order_status, p_carrier text default null, p_tracking text default null, p_note text default null)
returns public.mkt_orders language plpgsql security definer set search_path = '' as $$
declare o public.mkt_orders; ttl int := coalesce((app.setting('marketplace.escrow_days'))::int, 7);
begin
  select * into o from public.mkt_orders where id = p_order for update;
  if o.id is null or not (app.owns_store(o.store_id) or app.is_admin()) then raise exception 'order not found' using errcode = 'P0002'; end if;
  if p_status not in ('processing','shipped','out_for_delivery','delivered','cancelled') then raise exception 'bad status' using errcode = '22023'; end if;
  if o.status not in ('paid','processing','shipped','out_for_delivery') then raise exception 'order cannot change from %', o.status using errcode = 'P0001'; end if;
  if p_status = 'cancelled' then raise exception 'cancellation goes through a refund dispute' using errcode = 'P0001'; end if;
  update public.mkt_orders set status = p_status, carrier = coalesce(p_carrier, carrier), tracking_code = coalesce(p_tracking, tracking_code),
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         auto_release_at = case when p_status = 'delivered' then now() + make_interval(days => ttl) else auto_release_at end
   where id = o.id returning * into o;
  insert into public.mkt_order_events (order_id, status, note, actor_id) values (o.id, p_status, p_note, app.requesting_user_id());
  perform app.notify(o.buyer_id, 'order.' || p_status::text, 'Order update', 'Your order is now ' || replace(p_status::text, '_', ' ') || '.', '/orders.html', jsonb_build_object('order_id', o.id));
  return o;
end;
$$;

-- Buyer confirms delivery → immediate escrow release.
create or replace function public.mkt_confirm_delivery(p_order uuid)
returns public.mkt_orders language plpgsql security definer set search_path = '' as $$
declare o public.mkt_orders;
begin
  select * into o from public.mkt_orders where id = p_order and buyer_id = app.requesting_user_id();
  if o.id is null then raise exception 'order not found' using errcode = 'P0002'; end if;
  if o.status not in ('shipped','out_for_delivery','delivered') then raise exception 'order not shipped yet' using errcode = 'P0001'; end if;
  update public.mkt_orders set delivered_at = coalesce(delivered_at, now()) where id = o.id;
  perform app.mkt_release(o.id);
  select * into o from public.mkt_orders where id = p_order;
  return o;
end;
$$;

-- Cron (service): auto-release orders whose escrow window passed without a dispute.
create or replace function public.mkt_release_due()
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  perform app.require_backend();
  for r in select o.id from public.mkt_orders o where o.status = 'delivered' and o.released_at is null and o.auto_release_at <= now()
             and not exists (select 1 from public.mkt_disputes d where d.order_id = o.id and d.status in ('open','vendor_accepted','escalated')) limit 500 loop
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
  insert into public.mkt_disputes (order_id, opened_by, kind, reason) values (o.id, o.buyer_id, p_kind, p_reason) returning * into d;
  update public.mkt_orders set status = 'disputed' where id = o.id;
  insert into public.mkt_order_events (order_id, status, note, actor_id) values (o.id, 'disputed', p_kind, o.buyer_id);
  perform app.notify((select owner_id from public.mkt_stores where id = o.store_id), 'order.disputed', 'Order disputed', 'A buyer opened a dispute.', '/seller.html#disputes', jsonb_build_object('order_id', o.id));
  return d;
end;
$$;

-- Admin resolves: refund (full/partial, rest released to vendor) or release.
create or replace function public.admin_resolve_dispute(p_dispute uuid, p_outcome text, p_refund_ugx bigint default null, p_note text default null)
returns public.mkt_disputes language plpgsql security definer set search_path = '' as $$
declare d public.mkt_disputes; o public.mkt_orders; amt bigint; pay uuid; fee bigint; owner text;
  escrow uuid := app.ledger_account('platform:escrow_marketplace', 'liability', null, 'Marketplace escrow');
  refunds uuid := app.ledger_account('platform:refunds_payable', 'liability', null, 'Refunds owed to buyers');
  rev_comm uuid := app.ledger_account('platform:revenue_commission', 'revenue', null, 'Commission revenue');
begin
  perform app.require_admin();
  select * into d from public.mkt_disputes where id = p_dispute for update;
  if d.id is null or d.status not in ('open','vendor_accepted','escalated') then raise exception 'dispute not open' using errcode = 'P0001'; end if;
  select * into o from public.mkt_orders where id = d.order_id for update;
  select payment_id into pay from public.mkt_order_groups where id = o.group_id;
  if p_outcome = 'release' then
    update public.mkt_disputes set status = 'resolved_release', resolution_note = p_note, resolved_by = app.requesting_user_id(), resolved_at = now() where id = d.id returning * into d;
    update public.mkt_orders set status = 'delivered' where id = o.id;
    perform app.mkt_release(o.id);
  elsif p_outcome = 'refund' then
    amt := least(coalesce(p_refund_ugx, o.total_ugx), o.total_ugx);
    select owner_id into owner from public.mkt_stores where id = o.store_id;
    fee := round((o.total_ugx - amt) * o.commission_pct / 100);
    perform app.post_ledger('escrow_refund', jsonb_strip_nulls(jsonb_build_array(
      jsonb_build_object('account', escrow, 'direction', 'debit', 'amount', o.total_ugx),
      jsonb_build_object('account', refunds, 'direction', 'credit', 'amount', amt))
      || case when o.total_ugx - amt > 0 then jsonb_build_array(
           jsonb_build_object('account', rev_comm, 'direction', 'credit', 'amount', fee),
           jsonb_build_object('account', app.payable_account(owner), 'direction', 'credit', 'amount', o.total_ugx - amt - fee)) else '[]'::jsonb end),
      pay, null, null, 'Dispute refund order ' || o.id);
    update public.mkt_disputes set status = 'resolved_refund', refund_ugx = amt, resolution_note = p_note, resolved_by = app.requesting_user_id(), resolved_at = now() where id = d.id returning * into d;
    update public.mkt_orders set status = 'refunded', released_at = now() where id = o.id;
    insert into public.mkt_order_events (order_id, status, note, actor_id) values (o.id, 'refunded', p_note, app.requesting_user_id());
    -- TODO: execute the MoMo refund via Flutterwave refunds API from the server (services/payments) and clear refunds_payable.
  else
    raise exception 'bad outcome' using errcode = '22023';
  end if;
  perform app.audit_action('admin.resolve_dispute', 'mkt_disputes', d.id::text, jsonb_build_object('outcome', p_outcome, 'refund_ugx', amt));
  return d;
end;
$$;

-- Digital download: only the buyer of a paid item, capped count. Returns the storage path;
-- the server signs it with a short TTL (marketplace.download_ttl_seconds) using the service key.
create or replace function public.mkt_download(p_item uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare i record; maxd int := coalesce((app.setting('marketplace.max_downloads'))::int, 10);
begin
  select oi.*, o.buyer_id, o.status ostatus into i from public.mkt_order_items oi join public.mkt_orders o on o.id = oi.order_id where oi.id = p_item;
  if i.id is null or i.buyer_id <> app.requesting_user_id() then raise exception 'not found' using errcode = 'P0002'; end if;
  if i.ostatus not in ('paid','delivered','completed') then raise exception 'not available' using errcode = '42501'; end if;
  if i.type not in ('digital','software_license','course_bundle') then raise exception 'not a digital item' using errcode = '22023'; end if;
  if i.downloads >= maxd then raise exception 'download limit reached' using errcode = 'P0001'; end if;
  update public.mkt_order_items set downloads = downloads + 1 where id = i.id;
  return jsonb_build_object('files', coalesce((select jsonb_agg(jsonb_build_object('path', a.storage_path, 'filename', a.filename)) from public.mkt_digital_assets a where a.product_id = i.product_id), '[]'),
                            'license_key', i.license_key, 'ttl_seconds', coalesce((app.setting('marketplace.download_ttl_seconds'))::int, 300));
end;
$$;

-- /go/<id>: log the click (service role, with hashed IP) and return the outbound URL.
create or replace function public.external_product_go(p_id uuid, p_user text default null, p_ip_hash text default null, p_referrer text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare u text; tag text;
begin
  perform app.require_backend();
  select url, affiliate_tag into u, tag from public.external_products where id = p_id and approved;
  if u is null then raise exception 'not found' using errcode = 'P0002'; end if;
  insert into public.external_product_clicks (product_id, user_id, ip_hash, referrer) values (p_id, p_user, p_ip_hash, left(p_referrer, 300));
  update public.external_products set clicks = clicks + 1 where id = p_id;
  return u;   -- TODO: append affiliate_tag per source once programmes approve the site
end;
$$;

-- Verified-purchase reviews only; aggregates kept on product + store.
create or replace function app.guard_mkt_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.user_id := coalesce(app.requesting_user_id(), new.user_id);
  if not exists (select 1 from public.mkt_orders o join public.mkt_order_items i on i.order_id = o.id
                  where o.id = new.order_id and o.buyer_id = new.user_id and i.product_id = new.product_id
                    and o.status in ('delivered','completed')) then
    raise exception 'only verified buyers can review' using errcode = '42501';
  end if;
  new.vendor_reply := null;
  return new;
end;
$$;
create trigger mkt_reviews_guard before insert on public.mkt_reviews for each row execute function app.guard_mkt_review();
create or replace function app.mkt_review_aggregates()
returns trigger language plpgsql security definer set search_path = '' as $$
declare pid uuid := coalesce(new.product_id, old.product_id);
begin
  update public.mkt_products p set rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.mkt_reviews where product_id = pid), 0),
         rating_count = (select count(*) from public.mkt_reviews where product_id = pid) where p.id = pid;
  update public.mkt_stores s set rating_avg = coalesce((select round(avg(r.rating)::numeric, 2) from public.mkt_reviews r join public.mkt_products p on p.id = r.product_id where p.store_id = s.id), 0),
         rating_count = (select count(*) from public.mkt_reviews r join public.mkt_products p on p.id = r.product_id where p.store_id = s.id)
   where s.id = (select store_id from public.mkt_products where id = pid);
  return null;
end;
$$;
create trigger mkt_reviews_agg after insert or update or delete on public.mkt_reviews for each row execute function app.mkt_review_aggregates();

create or replace function public.admin_set_store_kyc(p_store uuid, p_status public.mkt_kyc_status, p_note text default null)
returns public.mkt_stores language plpgsql security definer set search_path = '' as $$
declare s public.mkt_stores;
begin
  perform app.require_admin();
  update public.mkt_stores set kyc_status = p_status, kyc_note = p_note where id = p_store returning * into s;
  if s.id is null then raise exception 'store not found' using errcode = 'P0002'; end if;
  perform app.audit_action('admin.store_kyc', 'mkt_stores', s.id::text, jsonb_build_object('status', p_status));
  perform app.notify(s.owner_id, 'store.kyc', 'Store verification', 'Your store verification status is now ' || p_status::text || '.', '/seller.html');
  return s;
end;
$$;

-- =================================================================== RLS ======
create policy mkt_cat_read on public.mkt_categories for select to anon, authenticated using (true);
create policy mkt_cat_admin on public.mkt_categories for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy mkt_stores_read on public.mkt_stores for select to anon, authenticated using (kyc_status = 'verified' or owner_id = app.requesting_user_id() or app.is_admin());
create policy mkt_stores_insert on public.mkt_stores for insert to authenticated with check (app.is_member() and not app.caller_is_minor());
create policy mkt_stores_update on public.mkt_stores for update to authenticated using (owner_id = app.requesting_user_id() or app.is_admin()) with check (owner_id = app.requesting_user_id() or app.is_admin());
create policy mkt_store_private_rw on public.mkt_store_private for all to authenticated using (app.owns_store(store_id) or app.is_admin()) with check (app.owns_store(store_id) or app.is_admin());

create policy mkt_products_read on public.mkt_products for select to anon, authenticated using (app.can_view_mkt_product(id));
create policy mkt_products_write on public.mkt_products for all to authenticated using (app.owns_store(store_id) or app.is_admin()) with check (app.owns_store(store_id) or app.is_admin());
create policy mkt_variants_read on public.mkt_variants for select to anon, authenticated using (app.can_view_mkt_product(product_id));
create policy mkt_variants_write on public.mkt_variants for all to authenticated
  using (app.is_admin() or exists (select 1 from public.mkt_products p where p.id = product_id and app.owns_store(p.store_id)))
  with check (app.is_admin() or exists (select 1 from public.mkt_products p where p.id = product_id and app.owns_store(p.store_id)));
create policy mkt_tiers_read on public.mkt_price_tiers for select to anon, authenticated using (app.can_view_mkt_product(product_id));
create policy mkt_tiers_write on public.mkt_price_tiers for all to authenticated
  using (app.is_admin() or exists (select 1 from public.mkt_products p where p.id = product_id and app.owns_store(p.store_id)))
  with check (app.is_admin() or exists (select 1 from public.mkt_products p where p.id = product_id and app.owns_store(p.store_id)));
create policy mkt_assets_vendor on public.mkt_digital_assets for all to authenticated   -- buyers go through mkt_download()
  using (app.is_admin() or exists (select 1 from public.mkt_products p where p.id = product_id and app.owns_store(p.store_id)))
  with check (app.is_admin() or exists (select 1 from public.mkt_products p where p.id = product_id and app.owns_store(p.store_id)));

create policy mkt_zones_read on public.mkt_shipping_zones for select to anon, authenticated using (active or app.is_admin() or app.owns_store(store_id));
create policy mkt_zones_write on public.mkt_shipping_zones for all to authenticated using (app.is_admin() or (store_id is not null and app.owns_store(store_id)))
  with check (app.is_admin() or (store_id is not null and app.owns_store(store_id)));
create policy mkt_pickup_read on public.mkt_pickup_points for select to anon, authenticated using (active or app.is_admin());
create policy mkt_pickup_admin on public.mkt_pickup_points for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy mkt_cart_own on public.mkt_cart_items for all to authenticated using (user_id = app.requesting_user_id())
  with check (user_id = app.requesting_user_id() and app.can_view_mkt_product(product_id));
create policy mkt_wish_own on public.mkt_wishlist for all to authenticated using (user_id = app.requesting_user_id()) with check (user_id = app.requesting_user_id());
create policy mkt_coupons_vendor on public.mkt_coupons for all to authenticated using (app.is_admin() or (store_id is not null and app.owns_store(store_id)))
  with check (app.is_admin() or (store_id is not null and app.owns_store(store_id)));

create policy mkt_groups_read on public.mkt_order_groups for select to authenticated using (buyer_id = app.requesting_user_id() or app.is_admin());
create policy mkt_orders_read on public.mkt_orders for select to authenticated using (buyer_id = app.requesting_user_id() or app.owns_store(store_id) or app.is_admin());
create policy mkt_items_read on public.mkt_order_items for select to authenticated
  using (exists (select 1 from public.mkt_orders o where o.id = order_id and (o.buyer_id = app.requesting_user_id() or app.owns_store(o.store_id) or app.is_admin())));
create policy mkt_events_read on public.mkt_order_events for select to authenticated
  using (exists (select 1 from public.mkt_orders o where o.id = order_id and (o.buyer_id = app.requesting_user_id() or app.owns_store(o.store_id) or app.is_admin())));

create policy mkt_reviews_read on public.mkt_reviews for select to anon, authenticated using (app.can_view_mkt_product(product_id));
create policy mkt_reviews_insert on public.mkt_reviews for insert to authenticated with check (user_id = app.requesting_user_id());
create policy mkt_reviews_own on public.mkt_reviews for delete to authenticated using (user_id = app.requesting_user_id() or app.is_admin());
create policy mkt_q_read on public.mkt_questions for select to anon, authenticated using (app.can_view_mkt_product(product_id));
create policy mkt_q_ask on public.mkt_questions for insert to authenticated with check (user_id = app.requesting_user_id() and app.is_member() and answer is null);
create policy mkt_q_answer on public.mkt_questions for update to authenticated
  using (app.is_admin() or exists (select 1 from public.mkt_products p where p.id = product_id and app.owns_store(p.store_id)))
  with check (app.is_admin() or exists (select 1 from public.mkt_products p where p.id = product_id and app.owns_store(p.store_id)));

create policy mkt_disputes_read on public.mkt_disputes for select to authenticated
  using (opened_by = app.requesting_user_id() or app.is_admin() or exists (select 1 from public.mkt_orders o where o.id = order_id and app.owns_store(o.store_id)));

create policy mkt_rfq_read on public.mkt_rfqs for select to authenticated
  using (buyer_id = app.requesting_user_id() or app.is_admin() or (store_id is null and exists (select 1 from public.mkt_stores s where s.owner_id = app.requesting_user_id() and s.kyc_status = 'verified'))
         or (store_id is not null and app.owns_store(store_id)));
create policy mkt_rfq_insert on public.mkt_rfqs for insert to authenticated with check (buyer_id = app.requesting_user_id() and app.is_member());
create policy mkt_rfq_update on public.mkt_rfqs for update to authenticated using (buyer_id = app.requesting_user_id()) with check (buyer_id = app.requesting_user_id());
create policy mkt_quotes_read on public.mkt_rfq_quotes for select to authenticated
  using (app.owns_store(store_id) or app.is_admin() or exists (select 1 from public.mkt_rfqs r where r.id = rfq_id and r.buyer_id = app.requesting_user_id()));
create policy mkt_quotes_vendor on public.mkt_rfq_quotes for insert to authenticated
  with check (app.owns_store(store_id) and app.store_verified(store_id) and status = 'offered');
create policy mkt_quotes_vendor_upd on public.mkt_rfq_quotes for update to authenticated using (app.owns_store(store_id)) with check (app.owns_store(store_id));

create policy ext_products_read on public.external_products for select to anon, authenticated using (approved or app.is_admin());
create policy ext_products_admin on public.external_products for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy ext_clicks_admin on public.external_product_clicks for select to authenticated using (app.is_admin());

-- ================================================================ grants ======
revoke all on public.mkt_categories, public.mkt_stores, public.mkt_store_private, public.mkt_products, public.mkt_variants, public.mkt_price_tiers,
  public.mkt_digital_assets, public.mkt_shipping_zones, public.mkt_pickup_points, public.mkt_cart_items, public.mkt_wishlist, public.mkt_coupons,
  public.mkt_order_groups, public.mkt_orders, public.mkt_order_items, public.mkt_order_events, public.mkt_reviews, public.mkt_questions,
  public.mkt_disputes, public.mkt_rfqs, public.mkt_rfq_quotes, public.external_products, public.external_product_clicks from anon, authenticated;
grant select on public.mkt_categories, public.mkt_stores, public.mkt_products, public.mkt_variants, public.mkt_price_tiers, public.mkt_shipping_zones,
  public.mkt_pickup_points, public.mkt_reviews, public.mkt_questions, public.external_products to anon, authenticated;
grant select on public.mkt_store_private, public.mkt_digital_assets, public.mkt_cart_items, public.mkt_wishlist, public.mkt_coupons, public.mkt_order_groups,
  public.mkt_orders, public.mkt_order_items, public.mkt_order_events, public.mkt_disputes, public.mkt_rfqs, public.mkt_rfq_quotes, public.external_product_clicks to authenticated;
grant insert (owner_id, slug, name, description, logo_url) on public.mkt_stores to authenticated;
grant update (slug, name, description, logo_url, kyc_status, kyc_note, commission_pct) on public.mkt_stores to authenticated;   -- guard trigger blocks non-admin kyc/commission
grant insert, update, delete on public.mkt_store_private, public.mkt_products, public.mkt_variants, public.mkt_price_tiers, public.mkt_digital_assets,
  public.mkt_shipping_zones, public.mkt_cart_items, public.mkt_wishlist, public.mkt_coupons, public.mkt_categories, public.mkt_pickup_points, public.external_products to authenticated;
grant insert (product_id, user_id, order_id, rating, body) on public.mkt_reviews to authenticated;
grant delete on public.mkt_reviews to authenticated;
grant insert (product_id, user_id, body) on public.mkt_questions to authenticated;
grant update (answer, answered_by, answered_at) on public.mkt_questions to authenticated;
grant insert (buyer_id, product_id, store_id, title, details, qty, target_unit_ugx) on public.mkt_rfqs to authenticated;
grant update (status) on public.mkt_rfqs to authenticated;
grant insert (rfq_id, store_id, unit_price_ugx, moq, valid_until, note, status) on public.mkt_rfq_quotes to authenticated;
grant update (unit_price_ugx, moq, valid_until, note) on public.mkt_rfq_quotes to authenticated;
grant select, insert, update, delete on public.mkt_categories, public.mkt_stores, public.mkt_store_private, public.mkt_products, public.mkt_variants,
  public.mkt_price_tiers, public.mkt_digital_assets, public.mkt_shipping_zones, public.mkt_pickup_points, public.mkt_cart_items, public.mkt_wishlist,
  public.mkt_coupons, public.mkt_order_groups, public.mkt_orders, public.mkt_order_items, public.mkt_order_events, public.mkt_reviews, public.mkt_questions,
  public.mkt_disputes, public.mkt_rfqs, public.mkt_rfq_quotes, public.external_products, public.external_product_clicks to service_role;

grant execute on function app.owns_store(uuid), app.store_verified(uuid), app.can_view_mkt_product(uuid) to anon, authenticated, service_role;
grant execute on function public.mkt_checkout(jsonb, text), public.mkt_vendor_update_order(uuid, public.mkt_order_status, text, text, text),
  public.mkt_confirm_delivery(uuid), public.mkt_open_dispute(uuid, text, text), public.admin_resolve_dispute(uuid, text, bigint, text),
  public.mkt_download(uuid), public.admin_set_store_kyc(uuid, public.mkt_kyc_status, text) to authenticated;
grant execute on function public.mkt_release_due(), public.external_product_go(uuid, text, text, text) to service_role;

-- Private bucket for purchased digital goods; no client policies (signed URLs from the server only).
insert into storage.buckets (id, name, public, file_size_limit) values ('marketplace-private', 'marketplace-private', false, 524288000)
on conflict (id) do nothing;

select app.enable_rls_all();
