-- =============================================================================
-- Round 11 (auth): guest role, root-admin lock, /auth onboarding fields,
-- guardian consent evidence, and restrictions for guests and unconsented minors.
-- WRITTEN, NOT APPLIED. The founder applies it (supabase db push). Tests:
-- supabase/tests/auth_r11.test.mjs.
--
-- Role names: the DB keeps `super_admin` (existing enum + RLS helpers); the shared
-- contract (src/data/access-policy.json) calls it `root_admin`. Only the verified
-- 101codecrafts@gmail.com account may hold it.
-- =============================================================================

-- 1. guest role ---------------------------------------------------------------
-- ADD VALUE can't be used in the same transaction, so nothing below casts 'guest'::app_role;
-- comparisons use role::text.
alter type public.app_role add value if not exists 'guest';

-- 2. root admin lock -----------------------------------------------------------
create or replace function app.root_email()
returns text language sql immutable set search_path = '' as $$ select '101codecrafts@gmail.com'::text $$;

-- super_admin may only be granted to the verified root email, and nobody (not even the
-- backend) can strip the root account's super_admin/admin rows while that profile exists.
create or replace function app.guard_root_role()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_email text; v_verified boolean;
begin
  if tg_op in ('INSERT','UPDATE') and new.role::text = 'super_admin' then
    select lower(pp.email) into v_email from public.profile_private pp where pp.user_id = new.user_id;
    select o.email_verified into v_verified from public.onboarding_state o where o.user_id = new.user_id;
    if v_email is distinct from app.root_email() or coalesce(v_verified, false) is not true then
      raise exception 'super_admin (root) is reserved for the verified root account' using errcode = '42501';
    end if;
  end if;
  if tg_op in ('DELETE','UPDATE') and old.role::text in ('super_admin','admin')
     and exists (select 1 from public.profiles p where p.id = old.user_id)           -- cascades from account erasure still pass
     and exists (select 1 from public.user_roles ur where ur.user_id = old.user_id and ur.role::text = 'super_admin') then
    raise exception 'the root admin cannot be removed or demoted' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists user_roles_root_guard on public.user_roles;
create trigger user_roles_root_guard before insert or update or delete on public.user_roles
  for each row execute function app.guard_root_role();

-- root email can't be changed away while it holds root (would orphan the lock)
create or replace function app.guard_root_email()
returns trigger language plpgsql set search_path = '' as $$
begin
  if lower(old.email) = app.root_email() and lower(coalesce(new.email,'')) <> app.root_email()
     and exists (select 1 from public.user_roles ur where ur.user_id = old.user_id and ur.role::text = 'super_admin') then
    raise exception 'root account email is fixed' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_private_root_email on public.profile_private;
create trigger profile_private_root_email before update of email on public.profile_private
  for each row execute function app.guard_root_email();

create or replace function app.is_guest_only()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.requesting_user_id() is not null
     and not exists (select 1 from public.user_roles ur where ur.user_id = app.requesting_user_id() and ur.role::text <> 'guest')
$$;

-- minor without a verified guardian consent
create or replace function app.minor_restricted()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.caller_is_minor() and not app.has_guardian_consent(app.requesting_user_id())
$$;

-- 3. onboarding fields (save-and-resume + learner extras) --------------------------
alter table public.onboarding_state
  add column if not exists path text check (path in ('guest','learner','tutor','admin')),
  add column if not exists step text check (step ~ '^[a-z_]{2,24}$'),
  add column if not exists draft jsonb check (draft is null or pg_column_size(draft) <= 16384),
  add column if not exists gender text check (gender in ('female','male','other','prefer_not_to_say')),
  add column if not exists heard_from text check (heard_from in ('friend','whatsapp','school','social','event','search','tutor','other')),
  add column if not exists consent_version text check (char_length(consent_version) <= 20),
  add column if not exists terms_accepted_at timestamptz;

-- path / completion are set by the server only (users may still save drafts through the API)
create or replace function app.guard_onboarding_r11()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if tg_op = 'UPDATE' and (new.path is distinct from old.path or new.completed_at is distinct from old.completed_at
     or new.consent_version is distinct from old.consent_version or new.terms_accepted_at is distinct from old.terms_accepted_at) then
    raise exception 'onboarding is completed through the API' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.path := null; new.completed_at := null; new.consent_version := null; new.terms_accepted_at := null; end if;
  return new;
end;
$$;
drop trigger if exists onboarding_state_guard_r11 on public.onboarding_state;
create trigger onboarding_state_guard_r11 before insert or update on public.onboarding_state
  for each row execute function app.guard_onboarding_r11();

-- 4. guardian consent evidence (DPPA 2019 s.8) -------------------------------------
alter table public.guardian_consents
  add column if not exists consent_version text check (char_length(consent_version) <= 20),
  add column if not exists scope text[] not null default '{account}' check (cardinality(scope) <= 10),
  add column if not exists requested_ip_hash text check (char_length(requested_ip_hash) <= 128),
  add column if not exists guardian_email_verified boolean not null default false,
  add column if not exists confirmation_sent_at timestamptz;

-- 5. tutor application fields ----------------------------------------------------
alter table public.tutor_applications
  add column if not exists levels text[] not null default '{}' check (cardinality(levels) <= 5),
  add column if not exists credentials jsonb not null default '[]'::jsonb check (jsonb_typeof(credentials) = 'array' and jsonb_array_length(credentials) <= 8),
  add column if not exists payout_network text check (payout_network in ('MTN','AIRTEL')),
  add column if not exists payout_phone_last4 text check (payout_phone_last4 ~ '^[0-9]{4}$');

-- The payout number given at sign-up never leaves the server: its ciphertext lives in a service-only table
-- (a column REVOKE would not beat the table-level SELECT grant on tutor_applications).
create table if not exists public.tutor_payout_intents (
  user_id      text primary key references public.profiles(id) on delete cascade,
  network      text not null check (network in ('MTN','AIRTEL')),
  last4        text not null check (last4 ~ '^[0-9]{4}$'),
  ciphertext   text check (char_length(ciphertext) between 20 and 1000),   -- null until PAYOUT_ENCRYPTION_KEY is configured
  created_at   timestamptz not null default now()
);
alter table public.tutor_payout_intents enable row level security;
create policy tutor_payout_intents_none on public.tutor_payout_intents for all to authenticated using (false) with check (false);
revoke all on public.tutor_payout_intents from anon, authenticated;

-- 6. my_access(): minor + consent for lib/auth.requireCan ----------------------------
create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', app.requesting_user_id(),
    'roles', coalesce((select jsonb_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id = app.requesting_user_id()), '[]'::jsonb),
    'account_status', (select p.account_status from public.profiles p where p.id = app.requesting_user_id()),
    'tutor_verification', (select t.verification_status from public.tutor_profiles t where t.user_id = app.requesting_user_id()),
    'mfa_enabled', coalesce((select pp.mfa_enabled from public.profile_private pp where pp.user_id = app.requesting_user_id()), false),
    'is_minor', app.caller_is_minor(),
    'guardian_consent', app.has_guardian_consent(app.requesting_user_id()))
$$;
grant execute on function public.my_access() to authenticated;

-- 7. RLS: guests and unconsented minors (RESTRICTIVE = ANDed with every permissive policy) --
-- Guests: buy and browse only. No selling, projects, courses, reviews/ratings, 1:1 bookings, posts or DMs.
-- Minors before guardian consent: read-only (no buying, booking, posting, messaging, rating, projects).
-- Minors always: no marketplace selling (and existing is_minor rules keep profiles private).
do $$
declare t text; v_ok boolean;
begin
  foreach t in array array['mkt_stores','mkt_products','marketplace_listings','projects','courses','lessons','tutor_reviews','mkt_reviews','session_bookings','posts','post_comments','messages','launch_products','test_campaigns'] loop
    select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) into v_ok;
    continue when not v_ok;
    execute format('drop policy if exists r11_no_guest_write on public.%I', t);
    execute format('create policy r11_no_guest_write on public.%I as restrictive for insert to authenticated with check (not app.is_guest_only())', t);
  end loop;
  foreach t in array array['mkt_order_groups','mkt_orders','session_bookings','posts','post_comments','messages','tutor_reviews','mkt_reviews','projects','event_registrations'] loop
    select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) into v_ok;
    continue when not v_ok;
    execute format('drop policy if exists r11_minor_consent on public.%I', t);
    execute format('create policy r11_minor_consent on public.%I as restrictive for insert to authenticated with check (not app.minor_restricted())', t);
  end loop;
  foreach t in array array['mkt_stores','mkt_products','marketplace_listings'] loop
    select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) into v_ok;
    continue when not v_ok;
    execute format('drop policy if exists r11_no_minor_sell on public.%I', t);
    execute format('create policy r11_no_minor_sell on public.%I as restrictive for insert to authenticated with check (not app.caller_is_minor())', t);
  end loop;
end $$;

-- helpers are internal
revoke all on function app.guard_root_role() from public, anon, authenticated;
revoke all on function app.guard_root_email() from public, anon, authenticated;
revoke all on function app.guard_onboarding_r11() from public, anon, authenticated;
grant execute on function app.is_guest_only() to authenticated;
grant execute on function app.minor_restricted() to authenticated;
grant execute on function app.root_email() to authenticated;

select app.enable_rls_all();
