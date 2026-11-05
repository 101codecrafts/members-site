-- =============================================================================
-- Round 11 · ADMIN CONSOLE (branch r11/admin-api). NOT applied to any database:
-- the founder applies it. Idempotent where practical.
--
--   A. Root admin: ONLY 101codecrafts@gmail.com, bound server-side to one Clerk
--      user id from the Clerk-VERIFIED email (backend_bind_root, service role).
--      Contract role `root_admin` == DB role `super_admin` held by that id.
--      Nobody (admins, service role, triggers, cascades) can demote, suspend,
--      delete or remove root. Break-glass rebind: SQL editor only (see below).
--   B. Scoped admins: invite by email → accept (verified email must match),
--      per-admin scopes, suspend / reinstate / remove (root only).
--   C. Approval queue for everything learners & tutors publish (courses,
--      lessons, books, links, videos, projects, campaigns, events, listings,
--      price changes) with link-risk flags. Nothing is public until approved.
--   D. Plans & pricing as DATA (plan_catalog, user_plans) + course free/paid.
--   E. Feature flags (scope-gated), F. append-only audit with before→after,
--   G. stats from real tables (zeros when empty), H. read-only support view.
-- =============================================================================

-- ============================================================ A. ROOT ========
create or replace function app.root_email()
returns text language sql immutable set search_path = '' as $$ select '101codecrafts@gmail.com'::text $$;

create table if not exists app.root_identity (
  singleton  boolean primary key default true check (singleton),
  user_id    text not null unique references public.profiles(id) on delete restrict,
  email      text not null check (email = '101codecrafts@gmail.com'),
  bound_at   timestamptz not null default now()
);
alter table app.root_identity enable row level security;
drop policy if exists root_identity_service_only on app.root_identity;
create policy root_identity_service_only on app.root_identity for select to authenticated using (false);
revoke all on app.root_identity from anon, authenticated;

-- The binding can only change from the SQL editor (postgres/supabase_admin
-- session, no JWT) with the explicit break-glass setting:
--   begin; set local app.break_glass = 'rebind-root'; delete from app.root_identity; commit;
create or replace function app.guard_root_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then return new; end if;
  if coalesce(current_setting('app.break_glass', true), '') = 'rebind-root'
     and auth.jwt() is null and session_user in ('postgres','supabase_admin') then
    return coalesce(new, old);
  end if;
  raise exception 'root identity is immutable (break-glass only)' using errcode = '42501';
end;
$$;
drop trigger if exists root_identity_guard on app.root_identity;
create trigger root_identity_guard before update or delete on app.root_identity for each row execute function app.guard_root_identity();

create or replace function app.root_user_id()
returns text language sql stable security definer set search_path = '' as $$
  select r.user_id from app.root_identity r where r.singleton
$$;

create or replace function app.is_root(p_user text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(coalesce(p_user, app.requesting_user_id()) = app.root_user_id(), false)
$$;

-- Called by the backend (Clerk webhook / first admin-console load) with the
-- Clerk-VERIFIED primary email. Never from client input.
create or replace function public.backend_bind_root(p_user text, p_verified_email text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cur text;
begin
  perform app.require_backend();
  if lower(btrim(coalesce(p_verified_email, ''))) <> app.root_email() then
    raise exception 'not the root email' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  cur := app.root_user_id();
  if cur is not null and cur <> p_user then
    raise exception 'root is already bound to another account (break-glass rebind only)' using errcode = '42501';
  end if;
  if cur is null then
    insert into app.root_identity (user_id, email) values (p_user, app.root_email());
  end if;
  insert into public.user_roles (user_id, role) values (p_user, 'super_admin'), (p_user, 'admin') on conflict do nothing;
  update public.profiles set account_status = 'active', status_reason = null, suspended_until = null,
         joined_at = coalesce(joined_at, now())
   where id = p_user and (account_status <> 'active' or joined_at is null);
  delete from public.admin_grants where user_id = p_user;   -- root has every scope implicitly
  if cur is null then
    insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, new_data, context)
    values (p_user, 'server', 'root.bind', 'root_identity', p_user, jsonb_build_object('user_id', p_user), '{}');
  end if;
  return jsonb_build_object('user_id', p_user, 'root', true, 'newly_bound', cur is null);
end;
$$;

-- Roles: replaces the round-2 guard. super_admin is reserved for the bound root
-- id; root's super_admin/admin rows can never be deleted or changed by anyone
-- (this also blocks deleting root's profile, which cascades here).
create or replace function app.guard_user_roles()
returns trigger language plpgsql set search_path = '' as $$
declare root text := app.root_user_id();
begin
  if not app.is_privileged() then
    raise exception 'roles change only via admin RPCs' using errcode = '42501';
  end if;
  if tg_op in ('UPDATE','DELETE') and old.role in ('super_admin','admin') and old.user_id = root
     and coalesce(current_setting('app.break_glass', true), '') <> 'rebind-root' then
    raise exception 'the root admin cannot be removed or demoted' using errcode = '42501';
  end if;
  if tg_op in ('INSERT','UPDATE') and new.role = 'super_admin' and new.user_id is distinct from root then
    raise exception 'super_admin is reserved for the root account (%)', app.root_email() using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.role = 'super_admin'
     and (select count(*) from public.user_roles where role = 'super_admin') <= 1 then
    raise exception 'the root admin cannot be removed or demoted (last super_admin)' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

-- Root's account can't be suspended, banned, soft-deleted or hard-deleted.
create or replace function app.guard_root_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.id is distinct from app.root_user_id() then return coalesce(new, old); end if;
  if coalesce(current_setting('app.break_glass', true), '') = 'rebind-root' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then raise exception 'the root account cannot be deleted' using errcode = '42501'; end if;
  if new.account_status <> 'active' or new.deleted_at is not null or new.id <> old.id then
    raise exception 'the root account cannot be suspended, banned or deleted' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_root_guard on public.profiles;
create trigger profiles_root_guard before update or delete on public.profiles for each row execute function app.guard_root_profile();

-- Root's verified email can't be edited by anyone through the API, and nobody
-- else may claim it in profile_private (the claim alone grants nothing, but it
-- keeps the admin views unambiguous).
create or replace function app.guard_root_email()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if lower(coalesce(new.email, '')) = app.root_email() and new.user_id is distinct from app.root_user_id() then
    raise exception 'that email belongs to the root account' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.user_id = app.root_user_id() and new.email is distinct from old.email then
    raise exception 'root email is synced from the identity provider only' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists profile_private_root_email on public.profile_private;
create trigger profile_private_root_email before insert or update on public.profile_private for each row execute function app.guard_root_email();

-- ================================================== B. SCOPED ADMINS ========
create or replace function app.admin_scope_list()
returns text[] language sql immutable set search_path = '' as $$
  select array['approvals','users','plans','flags','audit','stats','support_view','payments','moderation','content','settings']::text[]
$$;

create table if not exists public.admin_grants (
  user_id        text primary key references public.profiles(id) on delete cascade,
  scopes         text[] not null default '{}',
  status         text not null default 'active' check (status in ('active','suspended')),
  status_reason  text check (char_length(status_reason) <= 500),
  granted_by     text references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (scopes <@ array['approvals','users','plans','flags','audit','stats','support_view','payments','moderation','content','settings']::text[])
);
drop trigger if exists admin_grants_updated_at on public.admin_grants;
create trigger admin_grants_updated_at before update on public.admin_grants for each row execute function app.set_updated_at();

create or replace function app.guard_admin_grants()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.is_privileged() then raise exception 'admin grants change only via root RPCs' using errcode = '42501'; end if;
  if tg_op <> 'DELETE' and new.user_id = app.root_user_id() then
    raise exception 'root has every scope; it cannot be scoped or suspended' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists admin_grants_guard on public.admin_grants;
create trigger admin_grants_guard before insert or update or delete on public.admin_grants for each row execute function app.guard_admin_grants();

-- A suspended admin is not an admin anywhere (RLS + every require_admin()).
create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur
                  join public.profiles p on p.id = ur.user_id and p.account_status = 'active'
                 where ur.user_id = app.requesting_user_id() and ur.role in ('admin','super_admin')
                   and not exists (select 1 from public.admin_grants g where g.user_id = ur.user_id and g.status = 'suspended'))
$$;

-- Root: every scope. Admin with a grant row: its scopes. Legacy admin (no row,
-- granted before round 11): every non-root scope, kept for backward compatibility.
create or replace function app.admin_has(p_scope text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_root() or (app.is_admin() and coalesce(
    (select g.status = 'active' and p_scope = any(g.scopes) from public.admin_grants g where g.user_id = app.requesting_user_id()),
    true))
$$;

create or replace function app.require_scope(p_scope text)
returns void language plpgsql stable set search_path = '' as $$
begin
  if not app.admin_has(p_scope) then raise exception 'admin scope "%" required', p_scope using errcode = '42501'; end if;
end;
$$;

create or replace function app.require_root()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not app.is_root() then raise exception 'root admin only' using errcode = '42501'; end if;
end;
$$;

create or replace function app.clean_scopes(p_scopes text[])
returns text[] language plpgsql immutable set search_path = '' as $$
declare s text[] := array(select distinct x from unnest(coalesce(p_scopes, '{}')) x order by 1);
begin
  if not (s <@ app.admin_scope_list()) then
    raise exception 'unknown scope; allowed: %', array_to_string(app.admin_scope_list(), ', ') using errcode = '22023';
  end if;
  return s;
end;
$$;

-- Audit helper with before → after (OWASP: who, what, object, result).
create or replace function app.audit_change(p_action text, p_table text, p_record text, p_before jsonb, p_after jsonb, p_context jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, old_data, new_data, context)
  values (app.requesting_user_id(),
          case when app.is_root() then 'root_admin' when app.is_admin() then 'admin' else coalesce(auth.jwt() ->> 'role', session_user::text) end,
          p_action, p_table, p_record, app.redact(p_before), app.redact(p_after), coalesce(p_context, '{}'))
$$;

-- Append-only, for every caller (grants already revoke UPDATE/DELETE from the API roles).
create or replace function app.guard_audit_log()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;
drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only before update or delete on public.audit_log for each row execute function app.guard_audit_log();

create table if not exists public.admin_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null check (email = lower(btrim(email)) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  scopes       text[] not null default '{}',
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status       text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by   text references public.profiles(id) on delete set null,
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_by  text references public.profiles(id) on delete set null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create unique index if not exists admin_invites_one_pending on public.admin_invites (email) where status = 'pending';

create or replace function app.sha256_hex(p text)
returns text language sql immutable set search_path = '' as $$ select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

-- Root invites an admin by email. Returns the raw token ONCE (the server emails
-- the accept link); only its sha256 is stored.
create or replace function public.admin_invite(p_email text, p_scopes text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e text := lower(btrim(p_email)); tok text; inv public.admin_invites; sc text[] := app.clean_scopes(p_scopes);
begin
  perform app.require_root();
  if e = app.root_email() then raise exception 'that is the root account' using errcode = '22023'; end if;
  if cardinality(sc) = 0 then raise exception 'pick at least one scope' using errcode = '22023'; end if;
  if exists (select 1 from public.profile_private pp join public.user_roles ur on ur.user_id = pp.user_id and ur.role = 'admin'
              where lower(pp.email) = e) then
    raise exception 'already an admin' using errcode = 'P0001';
  end if;
  update public.admin_invites set status = 'revoked' where email = e and status = 'pending';
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.admin_invites (email, scopes, token_hash, invited_by) values (e, sc, app.sha256_hex(tok), app.requesting_user_id())
  returning * into inv;
  perform app.audit_change('admin.invite', 'admin_invites', inv.id::text, null, jsonb_build_object('email', e, 'scopes', sc, 'expires_at', inv.expires_at));
  return jsonb_build_object('id', inv.id, 'email', e, 'scopes', sc, 'expires_at', inv.expires_at, 'token', tok);
end;
$$;

create or replace function public.admin_revoke_invite(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_root();
  update public.admin_invites set status = 'revoked' where id = p_id and status = 'pending';
  if not found then raise exception 'invite not pending' using errcode = 'P0001'; end if;
  perform app.audit_change('admin.invite_revoke', 'admin_invites', p_id::text, jsonb_build_object('status','pending'), jsonb_build_object('status','revoked'));
end;
$$;

-- Accept: the route verifies the Clerk session and passes the Clerk-VERIFIED
-- primary email; the DB checks it against the invite. Service role only.
create or replace function public.backend_accept_admin_invite(p_user text, p_verified_email text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare inv public.admin_invites; p public.profiles;
begin
  perform app.require_backend();
  select * into inv from public.admin_invites where token_hash = app.sha256_hex(coalesce(p_token, '')) for update;
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
  if inv.status <> 'pending' then raise exception 'invite is %', inv.status using errcode = 'P0001'; end if;
  if inv.expires_at < now() then
    update public.admin_invites set status = 'expired' where id = inv.id;
    raise exception 'invite expired' using errcode = 'P0001';
  end if;
  if lower(btrim(coalesce(p_verified_email, ''))) <> inv.email then
    raise exception 'sign in with the invited email (%)', inv.email using errcode = '42501';
  end if;
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'profile not found' using errcode = 'P0002'; end if;
  if p.is_minor then raise exception 'admins must be adults' using errcode = 'P0001'; end if;
  if p.account_status in ('suspended','banned') or p.deleted_at is not null then raise exception 'account not in good standing' using errcode = 'P0001'; end if;
  update public.profiles set account_status = 'active', joined_at = coalesce(joined_at, now()) where id = p_user and account_status = 'pending';
  insert into public.user_roles (user_id, role, granted_by) values (p_user, 'admin', inv.invited_by) on conflict do nothing;
  insert into public.admin_grants (user_id, scopes, granted_by) values (p_user, inv.scopes, inv.invited_by)
  on conflict (user_id) do update set scopes = excluded.scopes, status = 'active', status_reason = null, granted_by = excluded.granted_by;
  update public.admin_invites set status = 'accepted', accepted_by = p_user, accepted_at = now() where id = inv.id;
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, old_data, new_data, context)
  values (p_user, 'server', 'admin.invite_accept', 'admin_grants', p_user, null, jsonb_build_object('scopes', inv.scopes), jsonb_build_object('invite_id', inv.id, 'invited_by', inv.invited_by));
  perform app.notify(inv.invited_by, 'account.admin_joined', coalesce(nullif(p.display_name, ''), inv.email) || ' accepted the admin invite', null, '/admin.html#admins');
  return jsonb_build_object('user_id', p_user, 'scopes', inv.scopes);
end;
$$;

create or replace function app.assert_manageable_admin(p_user text)
returns void language plpgsql stable set search_path = '' as $$
begin
  if p_user = app.root_user_id() then raise exception 'the root admin cannot be changed by anyone' using errcode = '42501'; end if;
  if p_user = app.requesting_user_id() then raise exception 'you cannot change your own admin access' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_roles where user_id = p_user and role = 'admin') then
    raise exception 'not an admin' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_set_scopes(p_user text, p_scopes text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare before text[]; sc text[] := app.clean_scopes(p_scopes);
begin
  perform app.require_root();
  perform app.assert_manageable_admin(p_user);
  select scopes into before from public.admin_grants where user_id = p_user;
  insert into public.admin_grants (user_id, scopes, granted_by) values (p_user, sc, app.requesting_user_id())
  on conflict (user_id) do update set scopes = excluded.scopes, granted_by = excluded.granted_by;
  perform app.audit_change('admin.set_scopes', 'admin_grants', p_user, jsonb_build_object('scopes', before), jsonb_build_object('scopes', sc));
  perform app.notify(p_user, 'account.admin_scopes', 'Your admin permissions changed', array_to_string(sc, ', '), '/admin.html');
  return jsonb_build_object('user_id', p_user, 'scopes', sc);
end;
$$;

create or replace function public.admin_set_admin_status(p_user text, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare before text;
begin
  perform app.require_root();
  perform app.assert_manageable_admin(p_user);
  if p_status not in ('active','suspended') then raise exception 'status must be active or suspended' using errcode = '22023'; end if;
  if p_status = 'suspended' and coalesce(char_length(btrim(p_reason)), 0) < 3 then raise exception 'a reason is required' using errcode = '22023'; end if;
  select status into before from public.admin_grants where user_id = p_user;
  insert into public.admin_grants (user_id, scopes, status, status_reason, granted_by)
  values (p_user, app.admin_scope_list(), p_status, p_reason, app.requesting_user_id())
  on conflict (user_id) do update set status = excluded.status, status_reason = excluded.status_reason;
  perform app.audit_change('admin.set_status', 'admin_grants', p_user, jsonb_build_object('status', coalesce(before, 'active')),
                           jsonb_build_object('status', p_status, 'reason', p_reason));
  perform app.notify(p_user, 'account.admin_status', 'Admin access ' || case when p_status = 'active' then 'restored' else 'suspended' end, p_reason, '/dashboard.html');
  return jsonb_build_object('user_id', p_user, 'status', p_status);
end;
$$;

create or replace function public.admin_remove_admin(p_user text, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare before jsonb;
begin
  perform app.require_root();
  perform app.assert_manageable_admin(p_user);
  select jsonb_build_object('scopes', g.scopes, 'status', g.status) into before from public.admin_grants g where g.user_id = p_user;
  delete from public.user_roles where user_id = p_user and role = 'admin';
  delete from public.admin_grants where user_id = p_user;
  perform app.audit_change('admin.remove', 'user_roles', p_user, coalesce(before, '{}'::jsonb) || jsonb_build_object('role','admin'), jsonb_build_object('role', null, 'reason', p_reason));
  perform app.notify(p_user, 'account.admin_removed', 'Your admin access was removed', p_reason, '/dashboard.html');
end;
$$;

-- Round-2 RPC kept for callers, now root-aware: super_admin can't be granted or
-- revoked here (root is bound by backend_bind_root); new admins get a grant row.
create or replace function public.admin_set_role(p_user text, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_root();
  if p_role = 'super_admin' then
    raise exception 'the root admin cannot be removed or demoted; super_admin is bound to %', app.root_email() using errcode = '42501';
  end if;
  if p_user = app.root_user_id() then raise exception 'the root admin cannot be removed or demoted' using errcode = '42501'; end if;
  if p_grant then
    if p_role = 'tutor' and not exists (select 1 from public.tutor_profiles where user_id = p_user) then
      raise exception 'verify the tutor via admin_review_tutor first' using errcode = 'P0001';
    end if;
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, app.requesting_user_id()) on conflict do nothing;
    if p_role = 'admin' then
      insert into public.admin_grants (user_id, scopes, granted_by) values (p_user, app.admin_scope_list(), app.requesting_user_id()) on conflict do nothing;
    end if;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
    if p_role = 'admin' then delete from public.admin_grants where user_id = p_user; end if;
  end if;
  perform app.audit_change('admin.set_role', 'user_roles', p_user, jsonb_build_object('role', p_role, 'had', not p_grant), jsonb_build_object('role', p_role, 'has', p_grant));
end;
$$;

create or replace function public.admin_me()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user_id', app.requesting_user_id(),
    'is_admin', app.is_admin(),
    'is_root', app.is_root(),
    'role', case when app.is_root() then 'root_admin' when app.is_admin() then 'admin' else null end,
    'scopes', case when app.is_root() then to_jsonb(app.admin_scope_list())
                   when app.is_admin() then to_jsonb(coalesce((select g.scopes from public.admin_grants g where g.user_id = app.requesting_user_id()), app.admin_scope_list()))
                   else '[]'::jsonb end,
    'all_scopes', to_jsonb(app.admin_scope_list()))
$$;

create or replace function public.admin_list_admins()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'admins', coalesce((select jsonb_agg(x order by x->>'is_root' desc, x->>'display_name') from (
      select jsonb_build_object('user_id', p.id, 'display_name', p.display_name, 'username', p.username, 'avatar_url', p.avatar_url,
             'email', pp.email, 'is_root', p.id = app.root_user_id(),
             'scopes', case when p.id = app.root_user_id() then to_jsonb(app.admin_scope_list()) else to_jsonb(coalesce(g.scopes, app.admin_scope_list())) end,
             'status', coalesce(g.status, 'active'), 'status_reason', g.status_reason, 'since', coalesce(g.created_at, ur.granted_at)) x
        from public.user_roles ur join public.profiles p on p.id = ur.user_id
        left join public.profile_private pp on pp.user_id = p.id
        left join public.admin_grants g on g.user_id = p.id
       where ur.role = 'admin' or (ur.role = 'super_admin' and not exists (select 1 from public.user_roles u2 where u2.user_id = ur.user_id and u2.role = 'admin'))) s), '[]'::jsonb),
    'invites', case when app.is_root() then coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'email', i.email, 'scopes', i.scopes, 'status',
                 case when i.status = 'pending' and i.expires_at < now() then 'expired' else i.status end, 'expires_at', i.expires_at, 'created_at', i.created_at) order by i.created_at desc)
               from public.admin_invites i where i.created_at > now() - interval '90 days'), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;

-- ================================================ C. APPROVAL QUEUE =========
do $$ begin
  if not exists (select 1 from pg_type where typname = 'submission_kind') then
    create type public.submission_kind as enum ('course','lesson','book','link','video','project','campaign','event','listing','price_change');
  end if;
  if not exists (select 1 from pg_type where typname = 'submission_status') then
    create type public.submission_status as enum ('pending','approved','rejected','changes_requested','withdrawn');
  end if;
end $$;

create table if not exists public.submissions (
  id               uuid primary key default gen_random_uuid(),
  kind             public.submission_kind not null,
  entity_ref       text not null check (char_length(entity_ref) between 1 and 120),
  submitter_id     text not null references public.profiles(id) on delete cascade,
  title            text not null check (char_length(title) between 2 and 200),
  summary          text check (char_length(summary) <= 2000),
  payload          jsonb not null default '{}' check (pg_column_size(payload) <= 200000),
  urls             text[] not null default '{}' check (cardinality(urls) <= 50),
  status           public.submission_status not null default 'pending',
  risk_level       text not null default 'unchecked' check (risk_level in ('unchecked','low','medium','high','blocked')),
  risk_flags       jsonb not null default '[]',
  checked_at       timestamptz,
  version          integer not null default 1 check (version >= 1),
  decision_reason  text check (char_length(decision_reason) <= 2000),
  required_fixes   jsonb not null default '[]',
  decided_by       text references public.profiles(id) on delete set null,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists submissions_one_open on public.submissions (kind, entity_ref) where status in ('pending','changes_requested');
create index if not exists submissions_queue_idx on public.submissions (status, created_at);
create index if not exists submissions_submitter_idx on public.submissions (submitter_id, created_at desc);
drop trigger if exists submissions_updated_at on public.submissions;
create trigger submissions_updated_at before update on public.submissions for each row execute function app.set_updated_at();

create or replace function app.guard_submissions()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.is_privileged() then raise exception 'submissions change only via submit_for_review / admin_decide_submission' using errcode = '42501'; end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists submissions_guard on public.submissions;
create trigger submissions_guard before insert or update or delete on public.submissions for each row execute function app.guard_submissions();

-- Owner check per kind (where the row lives in a known table).
create or replace function app.submission_owner_ok(p_kind public.submission_kind, p_ref text, p_user text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare id uuid := app.try_uuid(p_ref);
begin
  case p_kind
    when 'course' then return exists (select 1 from public.courses where courses.id = id and tutor_id = p_user);
    when 'price_change' then return exists (select 1 from public.courses where courses.id = id and tutor_id = p_user);
    when 'lesson' then return exists (select 1 from public.lessons l join public.courses c on c.id = l.course_id where l.id = id and c.tutor_id = p_user);
    when 'event' then return exists (select 1 from public.events where events.id = id and created_by = p_user);
    when 'project' then return exists (select 1 from public.projects where projects.id = id and owner_id = p_user);
    when 'listing' then return exists (select 1 from public.mkt_products pr join public.mkt_stores s on s.id = pr.store_id where pr.id = id and s.owner_id = p_user);
    else return true;   -- book / link / video / campaign: the submission IS the item (payload); owned by its submitter
  end case;
end;
$$;

-- Learners & tutors submit (guests can't publish). Resubmitting an open item
-- bumps its version and resets the checks (Udemy-style "fix and resubmit").
create or replace function public.submit_for_review(p_kind public.submission_kind, p_entity_ref text, p_title text,
                                                    p_summary text default null, p_payload jsonb default '{}', p_urls text[] default '{}')
returns public.submissions language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); s public.submissions; u text[];
begin
  if me is null or not app.is_member() then raise exception 'members only' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_roles where user_id = me and role in ('learner','tutor','admin','super_admin')) then
    raise exception 'become a learner or tutor to publish' using errcode = '42501';
  end if;
  if p_kind = 'course' and not app.has_role('tutor') then raise exception 'only tutors publish courses' using errcode = '42501'; end if;
  if not app.submission_owner_ok(p_kind, p_entity_ref, me) then raise exception 'not your item' using errcode = '42501'; end if;
  if p_kind = 'price_change' then
    if jsonb_typeof(p_payload -> 'is_free') <> 'boolean' or jsonb_typeof(p_payload -> 'price_ugx') <> 'number' then
      raise exception 'price change needs is_free and price_ugx' using errcode = '22023';
    end if;
    if not (p_payload ->> 'is_free')::boolean and (p_payload ->> 'price_ugx')::bigint < 1000 then
      raise exception 'paid courses cost at least UGX 1,000' using errcode = '22023';
    end if;
  end if;
  u := array(select distinct btrim(x) from unnest(coalesce(p_urls, '{}')) x where btrim(x) ~ '^https?://' limit 50);
  select * into s from public.submissions where kind = p_kind and entity_ref = p_entity_ref and status in ('pending','changes_requested') for update;
  if found then
    if s.submitter_id <> me then raise exception 'not your item' using errcode = '42501'; end if;
    update public.submissions set title = p_title, summary = p_summary, payload = coalesce(p_payload, '{}'), urls = u, status = 'pending',
           risk_level = 'unchecked', risk_flags = '[]', checked_at = null, version = version + 1
     where id = s.id returning * into s;
  else
    insert into public.submissions (kind, entity_ref, submitter_id, title, summary, payload, urls)
    values (p_kind, p_entity_ref, me, p_title, p_summary, coalesce(p_payload, '{}'), u) returning * into s;
  end if;
  if p_kind = 'course' then
    update public.courses set status = 'pending_review' where id = app.try_uuid(p_entity_ref) and status in ('draft','rejected','published');
  end if;
  return s;
end;
$$;

create or replace function public.withdraw_submission(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.submissions set status = 'withdrawn' where id = p_id and submitter_id = app.requesting_user_id() and status in ('pending','changes_requested');
  if not found then raise exception 'nothing to withdraw' using errcode = 'P0001'; end if;
end;
$$;

-- Server-side link checks (services/link-check.ts) write their verdict here.
create or replace function public.backend_set_submission_risk(p_id uuid, p_level text, p_flags jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  update public.submissions set risk_level = p_level, risk_flags = coalesce(p_flags, '[]'), checked_at = now() where id = p_id;
end;
$$;

-- Approved? Other areas use this in their public read paths ("nothing is
-- public until approved"). Items never submitted are not approved.
create or replace function public.is_approved(p_kind public.submission_kind, p_entity_ref text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.submissions s where s.kind = p_kind and s.entity_ref = p_entity_ref and s.status = 'approved')
$$;

create or replace function public.admin_review_queue(p_status public.submission_status default 'pending', p_kind public.submission_kind default null,
                                                     p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_scope('approvals');
  return jsonb_build_object(
    'total', (select count(*) from public.submissions s where s.status = p_status and (p_kind is null or s.kind = p_kind)),
    'counts', coalesce((select jsonb_object_agg(k, n) from (select s.kind::text k, count(*) n from public.submissions s where s.status = p_status group by s.kind) c), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('submitter', jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username, 'is_minor', p.is_minor))
                       order by case s.risk_level when 'blocked' then 0 when 'high' then 1 when 'medium' then 2 else 3 end, s.created_at)
               from (select * from public.submissions s where s.status = p_status and (p_kind is null or s.kind = p_kind)
                     order by s.created_at limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) s
               join public.profiles p on p.id = s.submitter_id), '[]'::jsonb));
end;
$$;

create or replace function public.admin_decide_submission(p_id uuid, p_decision text, p_reason text default null, p_fixes jsonb default '[]')
returns public.submissions language plpgsql security definer set search_path = '' as $$
declare s public.submissions; before jsonb; st public.submission_status; cid uuid; link text;
begin
  perform app.require_scope('approvals');
  if p_decision not in ('approve','reject','request_changes') then raise exception 'decision must be approve, reject or request_changes' using errcode = '22023'; end if;
  select * into s from public.submissions where id = p_id for update;
  if not found then raise exception 'submission not found' using errcode = 'P0002'; end if;
  if s.status <> 'pending' then raise exception 'submission is %', s.status using errcode = 'P0001'; end if;
  if s.submitter_id = app.requesting_user_id() and not app.is_root() then raise exception 'you cannot review your own submission' using errcode = '42501'; end if;
  if p_decision <> 'approve' and coalesce(char_length(btrim(p_reason)), 0) < 5 then
    raise exception 'give the submitter a reason (5+ characters)' using errcode = '22023';
  end if;
  if p_decision = 'approve' and s.risk_level = 'blocked' then
    raise exception 'a blocked link must be removed before approval' using errcode = 'P0001';
  end if;
  if p_decision = 'approve' and s.risk_level in ('high','unchecked') and s.urls <> '{}' and coalesce(char_length(btrim(p_reason)), 0) < 5 then
    raise exception 'links are % risk: add an override note to approve', s.risk_level using errcode = '22023';
  end if;
  before := jsonb_build_object('status', s.status, 'version', s.version);
  st := case p_decision when 'approve' then 'approved' when 'reject' then 'rejected' else 'changes_requested' end::public.submission_status;
  update public.submissions set status = st, decision_reason = p_reason, required_fixes = coalesce(p_fixes, '[]'),
         decided_by = app.requesting_user_id(), decided_at = now()
   where id = s.id returning * into s;
  cid := app.try_uuid(s.entity_ref);
  -- side effects on the owning tables
  if s.kind = 'course' then
    update public.courses set status = case st when 'approved' then 'published' when 'rejected' then 'rejected' else 'draft' end::public.content_status,
           review_note = p_reason, reviewed_by = app.requesting_user_id(),
           published_at = case when st = 'approved' then coalesce(published_at, now()) else published_at end
     where id = cid;
  elsif s.kind = 'price_change' and st = 'approved' then
    update public.courses set is_free = (s.payload ->> 'is_free')::boolean,
           price_ugx = case when (s.payload ->> 'is_free')::boolean then 0 else (s.payload ->> 'price_ugx')::bigint end
     where id = cid;
  elsif s.kind = 'event' then
    update public.events set status = case when st = 'approved' then 'published' else 'draft' end::public.event_status where id = cid;
  elsif s.kind = 'listing' then
    update public.mkt_products set status = case st when 'approved' then 'published' when 'rejected' then 'rejected' else 'draft' end::public.content_status where id = cid;
  end if;
  link := case s.kind when 'course' then '/tutor.html#courses' when 'listing' then '/seller.html' else '/dashboard.html#submissions' end;
  perform app.notify(s.submitter_id, 'review.' || p_decision,
                     '"' || s.title || '" ' || case st when 'approved' then 'is approved and live' when 'rejected' then 'was not approved' else 'needs changes' end,
                     p_reason, link, jsonb_build_object('submission_id', s.id, 'kind', s.kind, 'fixes', coalesce(p_fixes, '[]')));
  perform app.audit_change('admin.review_' || p_decision, 'submissions', s.id::text, before,
                           jsonb_build_object('status', st, 'reason', p_reason, 'fixes', p_fixes),
                           jsonb_build_object('kind', s.kind, 'entity_ref', s.entity_ref, 'risk_level', s.risk_level));
  return s;
end;
$$;

-- ================================================== D. PLANS AS DATA =========
create table if not exists public.plan_catalog (
  audience         text not null check (audience in ('learner','tutor')),
  plan             text not null check (plan in ('free','standard','plus','pro')),
  name             text not null check (char_length(name) between 2 and 40),
  tagline          text check (char_length(tagline) <= 160),
  price_ugx_month  bigint not null default 0 check (price_ugx_month between 0 and 10000000),
  price_ugx_year   bigint not null default 0 check (price_ugx_year between 0 and 100000000),
  limits           jsonb not null default '{}' check (jsonb_typeof(limits) = 'object'),
  features         text[] not null default '{}' check (cardinality(features) <= 30),
  status           text not null default 'draft' check (status in ('draft','published','archived')),
  sort             smallint not null default 0,
  updated_by       text references public.profiles(id) on delete set null,
  updated_at       timestamptz not null default now(),
  primary key (audience, plan),
  check (plan <> 'free' or (price_ugx_month = 0 and price_ugx_year = 0))
);
drop trigger if exists plan_catalog_updated_at on public.plan_catalog;
create trigger plan_catalog_updated_at before update on public.plan_catalog for each row execute function app.set_updated_at();

-- Limit keys (kept in sync with src/data/access-policy.json "limits"). -1 = unlimited.
create or replace function app.plan_limit_spec()
returns jsonb language sql immutable set search_path = '' as $$
  select '{
    "learner.courses_max":"int", "learner.locked_lessons":"bool", "learner.sessions_per_month":"int",
    "tutor.students_max":"int", "tutor.courses_max":"int", "tutor.sessions_per_month":"int", "tutor.commission_pct":"num",
    "market.sell":"bool", "market.listings_max":"int", "ai.daily_requests":"int", "projects.max":"int"
  }'::jsonb
$$;

create or replace function app.validate_limits(p jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; t text; spec jsonb := app.plan_limit_spec();
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'limits must be an object' using errcode = '22023'; end if;
  for k, v in select * from jsonb_each(p) loop
    t := spec ->> k;
    if t is null then raise exception 'unknown limit key "%"', k using errcode = '22023'; end if;
    if t = 'bool' and jsonb_typeof(v) <> 'boolean' then raise exception '% must be true/false', k using errcode = '22023'; end if;
    if t in ('int','num') and jsonb_typeof(v) <> 'number' then raise exception '% must be a number', k using errcode = '22023'; end if;
    if t = 'int' and ((v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) or (v #>> '{}')::numeric < -1) then
      raise exception '% must be a whole number (-1 = unlimited)', k using errcode = '22023';
    end if;
    if k = 'tutor.commission_pct' and ((v #>> '{}')::numeric < 0 or (v #>> '{}')::numeric > 100) then raise exception 'commission must be 0-100' using errcode = '22023'; end if;
  end loop;
  return p;
end;
$$;

-- Seeds: founder rules for Free; paid prices are DRAFT placeholders (not public)
-- until the founder sets them in the console.
insert into public.plan_catalog (audience, plan, name, tagline, price_ugx_month, price_ugx_year, limits, features, status, sort) values
  ('learner','free','Free','Start learning at 101', 0, 0,
   '{"learner.courses_max":1,"learner.locked_lessons":true,"learner.sessions_per_month":0,"market.sell":true,"market.listings_max":2,"ai.daily_requests":20,"projects.max":2}',
   '{"1 course (some lessons locked)","Free external courses","Marketplace: buy and sell"}', 'published', 0),
  ('learner','standard','Standard','More courses, all lessons', 15000, 150000,
   '{"learner.courses_max":3,"learner.locked_lessons":false,"learner.sessions_per_month":1,"market.sell":true,"market.listings_max":10,"ai.daily_requests":60,"projects.max":10}',
   '{"3 courses, every lesson","1 tutor session a month"}', 'draft', 1),
  ('learner','plus','Plus','For serious learners', 30000, 300000,
   '{"learner.courses_max":10,"learner.locked_lessons":false,"learner.sessions_per_month":4,"market.sell":true,"market.listings_max":30,"ai.daily_requests":150,"projects.max":30}',
   '{"10 courses","4 tutor sessions a month"}', 'draft', 2),
  ('learner','pro','Pro','Everything, no limits', 60000, 600000,
   '{"learner.courses_max":-1,"learner.locked_lessons":false,"learner.sessions_per_month":8,"market.sell":true,"market.listings_max":-1,"ai.daily_requests":400,"projects.max":-1}',
   '{"Unlimited courses","8 tutor sessions a month"}', 'draft', 3),
  ('tutor','free','Free','Start teaching', 0, 0,
   '{"tutor.students_max":2,"tutor.courses_max":1,"tutor.sessions_per_month":4,"tutor.commission_pct":30,"market.sell":true,"market.listings_max":2,"ai.daily_requests":40,"projects.max":5}',
   '{"Up to 2 students","1 course"}', 'published', 0),
  ('tutor','standard','Standard','Grow a class', 20000, 200000,
   '{"tutor.students_max":25,"tutor.courses_max":3,"tutor.sessions_per_month":20,"tutor.commission_pct":25,"market.sell":true,"market.listings_max":10,"ai.daily_requests":100,"projects.max":20}',
   '{"Up to 25 students","3 courses"}', 'draft', 1),
  ('tutor','plus','Plus','Run a school', 50000, 500000,
   '{"tutor.students_max":100,"tutor.courses_max":10,"tutor.sessions_per_month":60,"tutor.commission_pct":20,"market.sell":true,"market.listings_max":30,"ai.daily_requests":250,"projects.max":50}',
   '{"Up to 100 students","10 courses"}', 'draft', 2),
  ('tutor','pro','Pro','No limits', 100000, 1000000,
   '{"tutor.students_max":-1,"tutor.courses_max":-1,"tutor.sessions_per_month":-1,"tutor.commission_pct":15,"market.sell":true,"market.listings_max":-1,"ai.daily_requests":500,"projects.max":-1}',
   '{"Unlimited students and courses","Lowest commission"}', 'draft', 3)
on conflict (audience, plan) do nothing;

create table if not exists public.user_plans (
  user_id       text primary key references public.profiles(id) on delete cascade,
  learner_plan  text not null default 'free' check (learner_plan in ('free','standard','plus','pro')),
  tutor_plan    text not null default 'free' check (tutor_plan in ('free','standard','plus','pro')),
  source        text not null default 'default' check (source in ('default','admin','subscription','promo')),
  expires_at    timestamptz,
  set_by        text references public.profiles(id) on delete set null,
  reason        text check (char_length(reason) <= 500),
  updated_at    timestamptz not null default now()
);
drop trigger if exists user_plans_updated_at on public.user_plans;
create trigger user_plans_updated_at before update on public.user_plans for each row execute function app.set_updated_at();
create or replace function app.guard_user_plans()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.is_privileged() then raise exception 'plans change only via checkout or admin RPCs' using errcode = '42501'; end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists user_plans_guard on public.user_plans;
create trigger user_plans_guard before insert or update or delete on public.user_plans for each row execute function app.guard_user_plans();

create or replace function app.user_plan(p_user text, p_audience text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select case when up.expires_at is not null and up.expires_at < now() then 'free'
                               when p_audience = 'tutor' then up.tutor_plan else up.learner_plan end
                     from public.user_plans up where up.user_id = p_user), 'free')
$$;

-- The policy reads limits from data: app.plan_limit(user, 'learner', 'learner.courses_max').
create or replace function app.plan_limit(p_user text, p_audience text, p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pc.limits -> p_key from public.plan_catalog pc where pc.audience = p_audience and pc.plan = app.user_plan(p_user, p_audience)
$$;

create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'learner', jsonb_build_object('plan', app.user_plan(app.requesting_user_id(), 'learner'),
                                  'limits', (select limits from public.plan_catalog where audience = 'learner' and plan = app.user_plan(app.requesting_user_id(), 'learner'))),
    'tutor',   jsonb_build_object('plan', app.user_plan(app.requesting_user_id(), 'tutor'),
                                  'limits', (select limits from public.plan_catalog where audience = 'tutor' and plan = app.user_plan(app.requesting_user_id(), 'tutor'))),
    'expires_at', (select expires_at from public.user_plans where user_id = app.requesting_user_id()))
$$;

create or replace function public.admin_upsert_plan(p_audience text, p_plan text, p_name text, p_price_month bigint, p_price_year bigint,
                                                    p_limits jsonb, p_features text[] default '{}', p_status text default 'draft', p_tagline text default null)
returns public.plan_catalog language plpgsql security definer set search_path = '' as $$
declare before public.plan_catalog; r public.plan_catalog;
begin
  perform app.require_scope('plans');
  perform app.validate_limits(p_limits);
  select * into before from public.plan_catalog where audience = p_audience and plan = p_plan;
  insert into public.plan_catalog (audience, plan, name, tagline, price_ugx_month, price_ugx_year, limits, features, status, updated_by, sort)
  values (p_audience, p_plan, p_name, p_tagline, p_price_month, p_price_year, p_limits, coalesce(p_features, '{}'), p_status, app.requesting_user_id(),
          array_position(array['free','standard','plus','pro'], p_plan) - 1)
  on conflict (audience, plan) do update set name = excluded.name, tagline = excluded.tagline, price_ugx_month = excluded.price_ugx_month,
     price_ugx_year = excluded.price_ugx_year, limits = excluded.limits, features = excluded.features, status = excluded.status, updated_by = excluded.updated_by
  returning * into r;
  perform app.audit_change('admin.plan_upsert', 'plan_catalog', p_audience || ':' || p_plan, to_jsonb(before), to_jsonb(r));
  return r;
end;
$$;

create or replace function public.admin_set_user_plan(p_user text, p_audience text, p_plan text, p_reason text, p_expires_at timestamptz default null)
returns public.user_plans language plpgsql security definer set search_path = '' as $$
declare before public.user_plans; r public.user_plans;
begin
  perform app.require_scope('users');
  if p_audience not in ('learner','tutor') or p_plan not in ('free','standard','plus','pro') then raise exception 'bad audience or plan' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then raise exception 'a reason is required' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'user not found' using errcode = 'P0002'; end if;
  select * into before from public.user_plans where user_id = p_user;
  insert into public.user_plans (user_id, learner_plan, tutor_plan, source, expires_at, set_by, reason)
  values (p_user, case when p_audience = 'learner' then p_plan else 'free' end, case when p_audience = 'tutor' then p_plan else 'free' end,
          'admin', p_expires_at, app.requesting_user_id(), p_reason)
  on conflict (user_id) do update set
    learner_plan = case when p_audience = 'learner' then p_plan else public.user_plans.learner_plan end,
    tutor_plan   = case when p_audience = 'tutor' then p_plan else public.user_plans.tutor_plan end,
    source = 'admin', expires_at = p_expires_at, set_by = excluded.set_by, reason = excluded.reason
  returning * into r;
  perform app.audit_change('admin.set_user_plan', 'user_plans', p_user, to_jsonb(before), to_jsonb(r));
  perform app.notify(p_user, 'account.plan', 'Your ' || p_audience || ' plan is now ' || initcap(p_plan), p_reason, '/settings-apps.html#plan');
  return r;
end;
$$;

-- Admin makes any course free or paid (tutor price changes go through the queue).
create or replace function public.admin_set_course_pricing(p_course uuid, p_is_free boolean, p_price_ugx bigint, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c public.courses;
begin
  if not (app.admin_has('plans') or app.admin_has('content')) then raise exception 'admin scope "plans" or "content" required' using errcode = '42501'; end if;
  if not p_is_free and coalesce(p_price_ugx, 0) < 1000 then raise exception 'paid courses cost at least UGX 1,000' using errcode = '22023'; end if;
  select * into c from public.courses where id = p_course for update;
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;
  update public.courses set is_free = p_is_free, price_ugx = case when p_is_free then 0 else p_price_ugx end where id = p_course;
  perform app.audit_change('admin.course_pricing', 'courses', p_course::text,
                           jsonb_build_object('is_free', c.is_free, 'price_ugx', c.price_ugx),
                           jsonb_build_object('is_free', p_is_free, 'price_ugx', case when p_is_free then 0 else p_price_ugx end), jsonb_build_object('reason', p_reason));
  perform app.notify(c.tutor_id, 'course.pricing', '"' || c.title || '" is now ' || case when p_is_free then 'free' else 'UGX ' || p_price_ugx end, p_reason, '/tutor.html#courses');
  return jsonb_build_object('course_id', p_course, 'is_free', p_is_free, 'price_ugx', case when p_is_free then 0 else p_price_ugx end);
end;
$$;

-- ======================================================= E. FLAGS ===========
create or replace function public.admin_set_flag(p_key text, p_enabled boolean, p_rollout_pct int default 100, p_roles public.app_role[] default null)
returns void language plpgsql security definer set search_path = '' as $$
declare before public.feature_flags; r public.feature_flags;
begin
  perform app.require_scope('flags');
  select * into before from public.feature_flags where key = p_key;
  insert into public.feature_flags (key, enabled, rollout_pct, allowed_roles, updated_by)
  values (p_key, p_enabled, p_rollout_pct, p_roles, app.requesting_user_id())
  on conflict (key) do update set enabled = excluded.enabled, rollout_pct = excluded.rollout_pct, allowed_roles = excluded.allowed_roles, updated_by = excluded.updated_by
  returning * into r;
  perform app.audit_change('admin.set_flag', 'feature_flags', p_key, to_jsonb(before), to_jsonb(r));
end;
$$;

-- ================================================== F. AUDIT SEARCH =========
create or replace function public.admin_audit_search(p_actor text default null, p_action text default null, p_table text default null,
                                                     p_from timestamptz default null, p_to timestamptz default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_scope('audit');
  return jsonb_build_object(
    'total', (select count(*) from public.audit_log a where (p_actor is null or a.actor_id = p_actor) and (p_action is null or a.action ilike p_action || '%')
               and (p_table is null or a.table_name = p_table) and (p_from is null or a.created_at >= p_from) and (p_to is null or a.created_at <= p_to)),
    'items', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('actor_name', p.display_name) order by a.created_at desc, a.id desc)
       from (select * from public.audit_log a where (p_actor is null or a.actor_id = p_actor) and (p_action is null or a.action ilike p_action || '%')
               and (p_table is null or a.table_name = p_table) and (p_from is null or a.created_at >= p_from) and (p_to is null or a.created_at <= p_to)
             order by a.created_at desc, a.id desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) a
       left join public.profiles p on p.id = a.actor_id), '[]'::jsonb));
end;
$$;

-- ======================================================= G. STATS ============
create or replace function public.admin_console_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.admin_has('stats') or app.admin_has('approvals')) then raise exception 'admin scope "stats" required' using errcode = '42501'; end if;
  return public.admin_overview() || jsonb_build_object(
    'guests', (select count(*) from public.profiles p where p.deleted_at is null and not exists (select 1 from public.user_roles ur where ur.user_id = p.id)),
    'admins', (select count(distinct user_id) from public.user_roles where role in ('admin','super_admin')),
    'admins_suspended', (select count(*) from public.admin_grants where status = 'suspended'),
    'submissions_pending', (select count(*) from public.submissions where status = 'pending'),
    'submissions_high_risk', (select count(*) from public.submissions where status = 'pending' and risk_level in ('high','blocked')),
    'submissions_by_kind', coalesce((select jsonb_object_agg(kind, n) from (select kind::text, count(*) n from public.submissions where status = 'pending' group by kind) x), '{}'::jsonb),
    'decided_7d', (select count(*) from public.submissions where decided_at > now() - interval '7 days'),
    'guardian_pending', (select count(*) from public.guardian_consents where verified_at is null and revoked_at is null),
    'plans', coalesce((select jsonb_object_agg(k, n) from (
               select 'learner:' || app.user_plan(p.id, 'learner') k, count(*) n from public.profiles p where p.deleted_at is null group by 1
               union all
               select 'tutor:' || app.user_plan(ur.user_id, 'tutor'), count(*) from public.user_roles ur where ur.role = 'tutor' group by 1) x), '{}'::jsonb),
    'courses_published', (select count(*) from public.courses where status = 'published' and deleted_at is null),
    'courses_paid', (select count(*) from public.courses where status = 'published' and not is_free and deleted_at is null),
    'enrollments_total', (select count(*) from public.enrollments),
    'support_views_7d', (select count(*) from public.support_view_sessions where started_at > now() - interval '7 days'));
end;
$$;

-- =========================================== H. USERS + SUPPORT VIEW ========
create or replace function public.admin_search_users(p_q text default null, p_role text default null, p_status text default null,
                                                     p_minor boolean default null, p_limit int default 25, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform app.require_scope('users');
  return (with base as (
      select p.*, pp.email,
             coalesce((select array_agg(ur.role::text order by ur.role) from public.user_roles ur where ur.user_id = p.id), '{}') roles
        from public.profiles p left join public.profile_private pp on pp.user_id = p.id
       where p.deleted_at is null
         and (q is null or p.display_name ilike '%' || q || '%' or p.username ilike '%' || q || '%' or pp.email ilike '%' || q || '%' or p.id = q)
         and (p_status is null or p.account_status::text = p_status)
         and (p_minor is null or p.is_minor = p_minor)),
    f as (select * from base b where p_role is null
             or (p_role = 'guest' and b.roles = '{}')
             or (p_role = 'root_admin' and b.id = app.root_user_id())
             or (p_role = any(b.roles)))
    select jsonb_build_object('total', (select count(*) from f), 'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'display_name', f.display_name, 'username', f.username, 'avatar_url', f.avatar_url, 'email', f.email,
        'roles', to_jsonb(f.roles), 'is_root', f.id = app.root_user_id(),
        'role', case when f.id = app.root_user_id() then 'root_admin' when 'admin' = any(f.roles) then 'admin' when 'tutor' = any(f.roles) then 'tutor'
                     when 'learner' = any(f.roles) then 'learner' else 'guest' end,
        'account_status', f.account_status, 'status_reason', f.status_reason, 'is_minor', f.is_minor, 'education_level', f.education_level,
        'guardian', (select jsonb_build_object('id', g.id, 'state', case when g.revoked_at is not null then 'revoked' when g.verified_at is not null then 'verified' else 'pending' end,
                            'relationship', g.relationship, 'created_at', g.created_at)
                       from public.guardian_consents g where g.user_id = f.id order by g.created_at desc limit 1),
        'learner_plan', app.user_plan(f.id, 'learner'), 'tutor_plan', app.user_plan(f.id, 'tutor'),
        'joined_at', f.joined_at, 'created_at', f.created_at, 'last_seen_at', f.last_seen_at) order by f.created_at desc)
      from (select * from f order by f.created_at desc limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)) f), '[]'::jsonb)));
end;
$$;

-- Non-admin roles only (admins come from invites). Tutors need an adult account.
create or replace function public.admin_set_user_role(p_user text, p_role text, p_grant boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare had boolean;
begin
  perform app.require_scope('users');
  if p_role not in ('learner','tutor') then raise exception 'only learner/tutor here; admins are invited by root' using errcode = '22023'; end if;
  if p_user = app.root_user_id() then raise exception 'the root admin cannot be changed' using errcode = '42501'; end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role in ('admin','super_admin')) and not app.is_root() then
    raise exception 'only root can change another admin' using errcode = '42501';
  end if;
  had := exists (select 1 from public.user_roles where user_id = p_user and role = p_role::public.app_role);
  if p_grant then
    if p_role = 'tutor' then
      if exists (select 1 from public.profiles where id = p_user and is_minor) then raise exception 'tutors must be adults' using errcode = 'P0001'; end if;
      insert into public.tutor_profiles (user_id, verification_status, verified_at, verified_by) values (p_user, 'verified', now(), app.requesting_user_id())
      on conflict (user_id) do update set verification_status = 'verified', verified_at = now(), verified_by = excluded.verified_by;
    end if;
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role::public.app_role, app.requesting_user_id()) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role::public.app_role;
  end if;
  perform app.audit_change('admin.set_user_role', 'user_roles', p_user, jsonb_build_object('role', p_role, 'has', had), jsonb_build_object('role', p_role, 'has', p_grant), jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_set_user_status(p_user text, p_status public.account_status, p_reason text default null, p_until timestamptz default null)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare before public.account_status; r public.profiles;
begin
  perform app.require_scope('users');
  if p_user = app.root_user_id() then raise exception 'the root account cannot be suspended, banned or deleted' using errcode = '42501'; end if;
  select account_status into before from public.profiles where id = p_user;
  r := public.admin_set_account_status(p_user, p_status, p_reason, p_until);
  perform app.audit_change('admin.set_user_status', 'profiles', p_user, jsonb_build_object('account_status', before),
                           jsonb_build_object('account_status', p_status, 'reason', p_reason, 'until', p_until));
  return r;
end;
$$;

create or replace function public.admin_revoke_guardian(p_consent_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare u text;
begin
  perform app.require_scope('users');
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then raise exception 'a reason is required' using errcode = '22023'; end if;
  update public.guardian_consents set revoked_at = now() where id = p_consent_id and revoked_at is null returning user_id into u;
  if not found then raise exception 'consent not active' using errcode = 'P0001'; end if;
  perform app.audit_change('admin.revoke_guardian', 'guardian_consents', p_consent_id::text, jsonb_build_object('revoked', false), jsonb_build_object('revoked', true, 'reason', p_reason));
end;
$$;

create table if not exists public.support_view_sessions (
  id          uuid primary key default gen_random_uuid(),
  admin_id    text not null references public.profiles(id) on delete cascade,
  target_id   text not null references public.profiles(id) on delete cascade,
  reason      text not null check (char_length(reason) between 5 and 500),
  ticket      text check (char_length(ticket) <= 80),
  started_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 minutes',
  ended_at    timestamptz,
  views       integer not null default 0
);
create index if not exists support_view_admin_idx on public.support_view_sessions (admin_id, started_at desc);
create index if not exists support_view_target_idx on public.support_view_sessions (target_id, started_at desc);
create or replace function app.guard_support_view()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.is_privileged() then raise exception 'support views change only via admin RPCs' using errcode = '42501'; end if;
  if tg_op = 'DELETE' then raise exception 'support view sessions are kept for audit' using errcode = '42501'; end if;
  return new;
end;
$$;
drop trigger if exists support_view_guard on public.support_view_sessions;
create trigger support_view_guard before insert or update or delete on public.support_view_sessions for each row execute function app.guard_support_view();

create or replace function public.admin_start_support_view(p_target text, p_reason text, p_ticket text default null)
returns public.support_view_sessions language plpgsql security definer set search_path = '' as $$
declare s public.support_view_sessions; me text := app.requesting_user_id();
begin
  perform app.require_scope('support_view');
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then raise exception 'say why (5+ characters)' using errcode = '22023'; end if;
  if p_target = me then raise exception 'use your own dashboard' using errcode = '22023'; end if;
  if p_target = app.root_user_id() then raise exception 'the root account cannot be viewed' using errcode = '42501'; end if;
  if exists (select 1 from public.user_roles where user_id = p_target and role in ('admin','super_admin')) and not app.is_root() then
    raise exception 'only root can view another admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_target and deleted_at is null) then raise exception 'user not found' using errcode = 'P0002'; end if;
  update public.support_view_sessions set ended_at = now() where admin_id = me and ended_at is null;
  insert into public.support_view_sessions (admin_id, target_id, reason, ticket) values (me, p_target, btrim(p_reason), p_ticket) returning * into s;
  perform app.audit_change('admin.support_view_start', 'support_view_sessions', s.id::text, null,
                           jsonb_build_object('target_id', p_target, 'reason', s.reason, 'ticket', p_ticket, 'expires_at', s.expires_at));
  perform app.notify(p_target, 'account.support_view', '101 support viewed your dashboard (read-only)',
                     'A 101 admin opened a read-only view of your account to help with support. Reason: ' || s.reason, '/settings-apps.html#security');
  return s;
end;
$$;

create or replace function public.admin_end_support_view(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.support_view_sessions set ended_at = now() where id = p_id and admin_id = app.requesting_user_id() and ended_at is null;
  if found then perform app.audit_change('admin.support_view_end', 'support_view_sessions', p_id::text, null, jsonb_build_object('ended', true)); end if;
end;
$$;

-- Read-only snapshot of what the user's dashboard shows. Only SELECTs on the
-- target's data; the only writes are the session counter + the audit row.
create or replace function public.admin_support_snapshot(p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.support_view_sessions; t text; role text; snap jsonb;
begin
  perform app.require_scope('support_view');
  select * into s from public.support_view_sessions where id = p_session and admin_id = app.requesting_user_id();
  if not found then raise exception 'support view not found' using errcode = 'P0002'; end if;
  if s.ended_at is not null or s.expires_at < now() then raise exception 'support view ended; start a new one' using errcode = 'P0001'; end if;
  t := s.target_id;
  role := case when exists (select 1 from public.user_roles where user_id = t and role in ('admin','super_admin')) then 'admin'
               when exists (select 1 from public.user_roles where user_id = t and role = 'tutor') then 'tutor'
               when exists (select 1 from public.user_roles where user_id = t and role = 'learner') then 'learner' else 'guest' end;
  snap := jsonb_build_object(
    'session', jsonb_build_object('id', s.id, 'expires_at', s.expires_at, 'reason', s.reason, 'read_only', true),
    'role', role,
    'profile', (select jsonb_build_object('id', p.id, 'display_name', p.display_name, 'username', p.username, 'avatar_url', p.avatar_url,
                 'headline', p.headline, 'account_status', p.account_status, 'is_minor', p.is_minor, 'education_level', p.education_level,
                 'joined_at', p.joined_at, 'last_seen_at', p.last_seen_at,
                 'email_masked', (select regexp_replace(pp.email, '^(.).*(@.*)$', '\1•••\2') from public.profile_private pp where pp.user_id = p.id))
                from public.profiles p where p.id = t),
    'plans', jsonb_build_object('learner', app.user_plan(t, 'learner'), 'tutor', app.user_plan(t, 'tutor')),
    'enrollments', coalesce((select jsonb_agg(jsonb_build_object('course', c.title, 'status', e.status, 'progress_pct', e.progress_pct, 'enrolled_at', e.enrolled_at) order by e.enrolled_at desc)
                     from public.enrollments e join public.courses c on c.id = e.course_id where e.user_id = t), '[]'::jsonb),
    'courses_taught', coalesce((select jsonb_agg(jsonb_build_object('title', c.title, 'status', c.status, 'is_free', c.is_free, 'price_ugx', c.price_ugx, 'learners', c.enrollments_count) order by c.created_at desc)
                     from public.courses c where c.tutor_id = t and c.deleted_at is null), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'title', x.title, 'status', x.status, 'risk_level', x.risk_level, 'created_at', x.created_at) order by x.created_at desc)
                     from (select * from public.submissions where submitter_id = t order by created_at desc limit 20) x), '[]'::jsonb),
    'notifications_unread', (select count(*) from public.notifications n where n.user_id = t and n.read_at is null),
    'guardian', (select jsonb_build_object('state', case when g.revoked_at is not null then 'revoked' when g.verified_at is not null then 'verified' else 'pending' end)
                   from public.guardian_consents g where g.user_id = t order by g.created_at desc limit 1));
  update public.support_view_sessions set views = views + 1 where id = s.id;
  perform app.audit_change('admin.support_view_read', 'support_view_sessions', s.id::text, null, jsonb_build_object('target_id', t), '{}');
  return snap;
end;
$$;

-- ================================================================ RLS ========
alter table public.admin_grants enable row level security;
alter table public.admin_invites enable row level security;
alter table public.submissions enable row level security;
alter table public.plan_catalog enable row level security;
alter table public.user_plans enable row level security;
alter table public.support_view_sessions enable row level security;

drop policy if exists admin_grants_read on public.admin_grants;
create policy admin_grants_read on public.admin_grants for select to authenticated using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
drop policy if exists admin_invites_root on public.admin_invites;
create policy admin_invites_root on public.admin_invites for select to authenticated using ((select app.is_root()));
drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select to authenticated
  using (submitter_id = (select app.requesting_user_id()) or (select app.admin_has('approvals')));
drop policy if exists plan_catalog_public on public.plan_catalog;
create policy plan_catalog_public on public.plan_catalog for select to anon, authenticated using (status = 'published' or (select app.is_admin()));
drop policy if exists user_plans_read on public.user_plans;
create policy user_plans_read on public.user_plans for select to authenticated using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
drop policy if exists support_view_read on public.support_view_sessions;
create policy support_view_read on public.support_view_sessions for select to authenticated
  using (admin_id = (select app.requesting_user_id()) or target_id = (select app.requesting_user_id()) or (select app.admin_has('audit')));

-- ============================================================= grants ========
revoke all on public.admin_grants, public.admin_invites, public.submissions, public.plan_catalog, public.user_plans, public.support_view_sessions from anon, authenticated;
grant select on public.admin_grants, public.admin_invites, public.submissions, public.user_plans, public.support_view_sessions to authenticated;
grant select on public.plan_catalog to anon, authenticated;
grant select, insert, update, delete on public.admin_grants, public.admin_invites, public.submissions, public.plan_catalog, public.user_plans, public.support_view_sessions to service_role;

revoke execute on function public.backend_bind_root(text, text), public.backend_accept_admin_invite(text, text, text),
  public.backend_set_submission_risk(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.backend_bind_root(text, text), public.backend_accept_admin_invite(text, text, text),
  public.backend_set_submission_risk(uuid, text, jsonb) to service_role;

grant execute on function app.root_email(), app.root_user_id(), app.is_root(text), app.admin_has(text), app.admin_scope_list(),
  app.user_plan(text, text), app.plan_limit(text, text, text) to anon, authenticated, service_role;
grant execute on function public.is_approved(public.submission_kind, text) to anon, authenticated, service_role;
grant execute on function public.admin_me(), public.admin_list_admins(), public.admin_invite(text, text[]), public.admin_revoke_invite(uuid),
  public.admin_set_scopes(text, text[]), public.admin_set_admin_status(text, text, text), public.admin_remove_admin(text, text),
  public.admin_set_role(text, public.app_role, boolean),
  public.submit_for_review(public.submission_kind, text, text, text, jsonb, text[]), public.withdraw_submission(uuid),
  public.admin_review_queue(public.submission_status, public.submission_kind, int, int), public.admin_decide_submission(uuid, text, text, jsonb),
  public.my_plan(), public.admin_upsert_plan(text, text, text, bigint, bigint, jsonb, text[], text, text),
  public.admin_set_user_plan(text, text, text, text, timestamptz), public.admin_set_course_pricing(uuid, boolean, bigint, text),
  public.admin_set_flag(text, boolean, int, public.app_role[]), public.admin_audit_search(text, text, text, timestamptz, timestamptz, int, int),
  public.admin_console_stats(), public.admin_search_users(text, text, text, boolean, int, int), public.admin_set_user_role(text, text, boolean, text),
  public.admin_set_user_status(text, public.account_status, text, timestamptz), public.admin_revoke_guardian(uuid, text),
  public.admin_start_support_view(text, text, text), public.admin_end_support_view(uuid), public.admin_support_snapshot(uuid) to authenticated;

select app.enable_rls_all();
