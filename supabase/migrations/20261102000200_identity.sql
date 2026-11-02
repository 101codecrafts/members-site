-- =============================================================================
-- Identity & RBAC: profiles (PK = Clerk user id), private contact data, roles,
-- membership applications, tutor profiles/applications/payout methods,
-- role helpers and column guards.
-- =============================================================================

create table public.profiles (
  id                  text primary key check (id ~ '^[A-Za-z0-9_\-]{3,64}$'),
  username            text unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name        text not null default '' check (char_length(display_name) <= 80),
  avatar_url          text check (avatar_url is null or avatar_url ~ '^https://'),
  headline            text check (char_length(headline) <= 140),
  bio                 text check (char_length(bio) <= 2000),
  location            text default 'Kampala, Uganda' check (char_length(location) <= 80),
  country_code        char(2) not null default 'UG',
  skills              text[] not null default '{}' check (cardinality(skills) <= 30),
  github_username     text check (github_username ~ '^[A-Za-z0-9-]{1,39}$'),
  linkedin_url        text check (linkedin_url is null or linkedin_url ~ '^https://'),
  website_url         text check (website_url is null or website_url ~ '^https?://'),
  is_public           boolean not null default true,
  email_opt_in        boolean not null default true,
  account_status      public.account_status not null default 'pending',
  status_reason       text check (char_length(status_reason) <= 500),
  suspended_until     timestamptz,
  member_number       bigint generated always as identity unique,
  joined_at           timestamptz,
  last_seen_at        timestamptz,
  search_tsv          tsvector generated always as (
                        setweight(to_tsvector('simple'::regconfig, coalesce(display_name,'') || ' ' || coalesce(username,'')), 'A') ||
                        setweight(to_tsvector('simple'::regconfig, coalesce(headline,'')), 'B') ||
                        setweight(to_tsvector('simple'::regconfig, app.tags_to_text(skills) || ' ' || coalesce(location,'')), 'C')
                      ) stored,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
comment on table public.profiles is 'One row per Clerk user; id = Clerk user id (JWT sub). Upserted by the Clerk webhook.';
create index profiles_status_idx    on public.profiles (account_status) where deleted_at is null;
create index profiles_joined_idx    on public.profiles (joined_at desc) where deleted_at is null;
create index profiles_created_idx   on public.profiles (created_at desc);
create index profiles_last_seen_idx on public.profiles (last_seen_at desc);
create index profiles_search_idx    on public.profiles using gin (search_tsv);
create index profiles_name_trgm_idx on public.profiles using gin (display_name extensions.gin_trgm_ops);
create trigger profiles_updated_at before update on public.profiles for each row execute function app.set_updated_at();

-- PII kept apart (and minimal) so public profile reads never expose it.
create table public.profile_private (
  user_id     text primary key references public.profiles(id) on delete cascade,
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone       text check (phone is null or phone ~ '^\+?[0-9]{7,15}$'),
  mfa_enabled boolean not null default false,       -- mirrored from Clerk webhook
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profile_private_email_idx on public.profile_private (lower(email));
create trigger profile_private_updated_at before update on public.profile_private for each row execute function app.set_updated_at();

create table public.user_roles (
  user_id     text not null references public.profiles(id) on delete cascade,
  role        public.app_role not null,
  granted_by  text references public.profiles(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);

create table public.membership_applications (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null references public.profiles(id) on delete cascade,
  motivation        text not null check (char_length(motivation) between 20 and 4000),
  skills            text[] not null default '{}' check (cardinality(skills) <= 30),
  experience_level  public.skill_level not null default 'beginner',
  github_url        text check (github_url is null or github_url ~ '^https://'),
  portfolio_url     text check (portfolio_url is null or portfolio_url ~ '^https?://'),
  referral          text check (char_length(referral) <= 200),
  status            public.application_status not null default 'pending',
  reviewed_by       text references public.profiles(id) on delete set null,
  reviewed_at       timestamptz,
  review_note       text check (char_length(review_note) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index membership_applications_one_pending on public.membership_applications (user_id) where status = 'pending';
create index membership_applications_status_idx on public.membership_applications (status, created_at desc);
create trigger membership_applications_updated_at before update on public.membership_applications for each row execute function app.set_updated_at();

-- -------------------------------------------------------------- tutors ----
create table public.tutor_profiles (
  user_id                 text primary key references public.profiles(id) on delete cascade,
  bio                     text check (char_length(bio) <= 5000),
  expertise               text[] not null default '{}' check (cardinality(expertise) <= 20),
  years_experience        integer check (years_experience between 0 and 60),
  hourly_rate_ugx         bigint check (hourly_rate_ugx is null or hourly_rate_ugx >= 0),
  languages               text[] not null default '{en}',
  verification_status     public.tutor_verification not null default 'unverified',
  verified_at             timestamptz,
  verified_by             text references public.profiles(id) on delete set null,
  rating_avg              numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count            integer not null default 0 check (rating_count >= 0),
  learners_count          integer not null default 0 check (learners_count >= 0),
  commission_pct_override numeric(5,2) check (commission_pct_override between 0 and 100),
  flw_subaccount_id       text,          -- Flutterwave subaccount (split payments)
  default_payout_method_id uuid,
  accepting_sessions      boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index tutor_profiles_verified_idx on public.tutor_profiles (rating_avg desc) where verification_status = 'verified';
create trigger tutor_profiles_updated_at before update on public.tutor_profiles for each row execute function app.set_updated_at();

create table public.tutor_applications (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null references public.profiles(id) on delete cascade,
  bio               text not null check (char_length(bio) between 50 and 5000),
  expertise         text[] not null check (cardinality(expertise) between 1 and 20),
  years_experience  integer check (years_experience between 0 and 60),
  sample_url        text check (sample_url is null or sample_url ~ '^https://'),
  linkedin_url      text check (linkedin_url is null or linkedin_url ~ '^https://'),
  id_document_path  text,              -- private storage: tutor-docs/{user_id}/...
  status            public.application_status not null default 'pending',
  reviewed_by       text references public.profiles(id) on delete set null,
  reviewed_at       timestamptz,
  review_note       text check (char_length(review_note) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index tutor_applications_one_pending on public.tutor_applications (user_id) where status = 'pending';
create index tutor_applications_status_idx on public.tutor_applications (status, created_at);
create trigger tutor_applications_updated_at before update on public.tutor_applications for each row execute function app.set_updated_at();

-- Payout destinations. Full account numbers are encrypted in the server
-- (AES-256-GCM, key in PAYOUT_ENCRYPTION_KEY) before insert; the DB only ever
-- holds ciphertext + last 4 digits. Rows are written by the server only.
create table public.payout_methods (
  id                  uuid primary key default gen_random_uuid(),
  tutor_id            text not null references public.profiles(id) on delete cascade,
  kind                public.payout_method_kind not null,
  provider_code       text not null check (provider_code ~ '^[A-Z0-9_]{2,20}$'),  -- MPS (MTN/Airtel) or bank code
  network             text check (network in ('MTN','AIRTEL')),
  account_name        text not null check (char_length(account_name) between 2 and 120),
  account_last4       text not null check (account_last4 ~ '^[0-9]{4}$'),
  account_ciphertext  text not null check (char_length(account_ciphertext) between 20 and 1000),
  currency            char(3) not null default 'UGX' check (currency = 'UGX'),
  is_default          boolean not null default false,
  verified_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  check (kind <> 'mobile_money' or network is not null)
);
create unique index payout_methods_one_default on public.payout_methods (tutor_id) where is_default and deleted_at is null;
create trigger payout_methods_updated_at before update on public.payout_methods for each row execute function app.set_updated_at();
alter table public.tutor_profiles add constraint tutor_profiles_payout_fk
  foreign key (default_payout_method_id) references public.payout_methods(id) on delete set null;

-- ------------------------------------------------------- role helpers ----
-- SECURITY DEFINER so policies can read roles without RLS recursion.
create or replace function app.has_role(r public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = app.requesting_user_id() and ur.role = r)
$$;

create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur
                  join public.profiles p on p.id = ur.user_id and p.account_status = 'active'
                 where ur.user_id = app.requesting_user_id() and ur.role in ('admin','super_admin'))
$$;

create or replace function app.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur
                  join public.profiles p on p.id = ur.user_id and p.account_status = 'active'
                 where ur.user_id = app.requesting_user_id() and ur.role = 'super_admin')
$$;

-- Active account (learner/tutor/admin) — suspended/banned users lose access.
create or replace function app.is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p
                 where p.id = app.requesting_user_id() and p.account_status = 'active' and p.deleted_at is null)
$$;

-- Verified tutor with an active account.
create or replace function app.is_tutor()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_member() and app.has_role('tutor') and exists (
    select 1 from public.tutor_profiles t where t.user_id = app.requesting_user_id() and t.verification_status = 'verified')
$$;

-- Tutors and admins (moderation queue, content tooling).
create or replace function app.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_tutor() or app.is_admin()
$$;

-- Exposed RPC: caller's own roles + status (route guards / UI).
create or replace function public.my_access()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', app.requesting_user_id(),
    'roles', coalesce((select jsonb_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id = app.requesting_user_id()), '[]'::jsonb),
    'account_status', (select p.account_status from public.profiles p where p.id = app.requesting_user_id()),
    'tutor_verification', (select t.verification_status from public.tutor_profiles t where t.user_id = app.requesting_user_id()),
    'mfa_enabled', coalesce((select pp.mfa_enabled from public.profile_private pp where pp.user_id = app.requesting_user_id()), false))
$$;

-- ---------------------------------------------------- column guards ----
create or replace function app.guard_profile_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if new.id is distinct from old.id
     or new.account_status is distinct from old.account_status
     or new.status_reason is distinct from old.status_reason
     or new.suspended_until is distinct from old.suspended_until
     or new.member_number is distinct from old.member_number
     or new.joined_at is distinct from old.joined_at
     or new.deleted_at is distinct from old.deleted_at then
    raise exception 'protected profile fields change only through admin functions' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles for each row execute function app.guard_profile_update();

create or replace function app.guard_profile_private()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if new.mfa_enabled is distinct from old.mfa_enabled or new.user_id is distinct from old.user_id then
    raise exception 'mfa status is synced from Clerk' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profile_private_guard before update on public.profile_private for each row execute function app.guard_profile_private();

-- Roles change ONLY through public.admin_set_role() (super_admin) or the backend.
create or replace function app.guard_user_roles()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.is_privileged() then
    raise exception 'roles change only via admin_set_role()' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.role = 'super_admin'
     and (select count(*) from public.user_roles where role = 'super_admin') <= 1 then
    raise exception 'cannot remove the last super_admin' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger user_roles_guard before insert or update or delete on public.user_roles for each row execute function app.guard_user_roles();

-- Tutors edit their public tutor fields; verification, rating, commission and
-- Flutterwave subaccount are server/admin controlled.
create or replace function app.guard_tutor_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    raise exception 'tutor profiles are created on verification' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id
     or new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at or new.verified_by is distinct from old.verified_by
     or new.rating_avg is distinct from old.rating_avg or new.rating_count is distinct from old.rating_count
     or new.learners_count is distinct from old.learners_count
     or new.commission_pct_override is distinct from old.commission_pct_override
     or new.flw_subaccount_id is distinct from old.flw_subaccount_id then
    raise exception 'protected tutor fields' using errcode = '42501';
  end if;
  if new.default_payout_method_id is not null and not exists (
       select 1 from public.payout_methods m where m.id = new.default_payout_method_id and m.tutor_id = new.user_id and m.deleted_at is null) then
    raise exception 'payout method does not belong to you' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tutor_profiles_guard before insert or update on public.tutor_profiles for each row execute function app.guard_tutor_profile();

-- Applications: applicants insert (forced pending) and may withdraw; reviews
-- go through admin RPCs.
create or replace function app.guard_application()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.user_id := app.requesting_user_id();
    new.status := 'pending'; new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
  elsif new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at
     or new.review_note is distinct from old.review_note or new.user_id is distinct from old.user_id
     or (new.status is distinct from old.status and new.status <> 'withdrawn') then
    raise exception 'applications are reviewed by admins' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger membership_applications_guard before insert or update on public.membership_applications for each row execute function app.guard_application();
create trigger tutor_applications_guard before insert or update on public.tutor_applications for each row execute function app.guard_application();
