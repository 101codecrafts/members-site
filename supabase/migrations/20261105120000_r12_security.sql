-- Round 12 security hardening. NOT APPLIED to staging: the founder applies it (after 20261105040000).
-- Idempotent (create or replace / revoke), safe to re-run. No data changes except one site_settings row.
--
-- A. R12-SEC-04  Staff MFA enforced in the database, not only in the API.
--    The API checks REQUIRE_MFA_FOR_STAFF in lib/auth.ts, but a staff member's Clerk session token is accepted by
--    PostgREST directly (Supabase third-party auth), so admin RPCs and admin RLS reads could be reached without the
--    API's check. Clerk v2 session tokens carry fva = [minutes since first factor, minutes since second factor]
--    with -1 meaning "no second factor in this session". When site setting security.require_staff_mfa is true,
--    app.is_admin(), app.admin_has() and app.require_root() also require fva[1] >= 0.
--    Default false: no behaviour change until the founder turns on Clerk 2FA AND this flag (with REQUIRE_MFA_FOR_STAFF).
--    security.* settings change only through the root admin (or the service role / SQL editor).
--
-- B. R12-SEC-07  Least privilege on table grants. Supabase's default privileges gave `authenticated` TRUNCATE,
--    REFERENCES, TRIGGER (and MAINTAIN on PG17) on every new public table; TRUNCATE is not subject to RLS.
--    PostgREST cannot issue these today, so this is defence in depth (OWASP ASVS 4.0 V1.4.3 / 5.0 V8 least privilege).

-- ---------------------------------------------------------------- A. staff MFA --
insert into public.site_settings (key, value, is_public, description)
values ('security.require_staff_mfa', 'false'::jsonb, false,
        'r12: when true, admin powers in the database need a second factor in the current Clerk session (fva[1] >= 0)')
on conflict (key) do nothing;

create or replace function app.staff_mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((app.setting('security.require_staff_mfa') #>> '{}')::boolean, false) is not true
      or coalesce(case when jsonb_typeof(auth.jwt() -> 'fva') = 'array' then (auth.jwt() -> 'fva' ->> 1)::int end, -1) >= 0
$$;
revoke execute on function app.staff_mfa_ok() from public;
grant execute on function app.staff_mfa_ok() to anon, authenticated, service_role;

-- same body as 20261105001200_admin_console.sql + the MFA condition
create or replace function app.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur
                  join public.profiles p on p.id = ur.user_id and p.account_status = 'active'
                 where ur.user_id = app.requesting_user_id() and ur.role in ('admin','super_admin')
                   and not exists (select 1 from public.admin_grants g where g.user_id = ur.user_id and g.status = 'suspended'))
     and app.staff_mfa_ok()
$$;

create or replace function app.admin_has(p_scope text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.staff_mfa_ok() and (app.is_root() or (app.is_admin() and coalesce(
    (select g.status = 'active' and p_scope = any(g.scopes) from public.admin_grants g where g.user_id = app.requesting_user_id()),
    true)))
$$;

create or replace function app.require_root()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not app.is_root() then raise exception 'root admin only' using errcode = '42501'; end if;
  if not app.staff_mfa_ok() then raise exception 'two-factor authentication required for staff actions' using errcode = '42501'; end if;
end;
$$;

-- security.* settings: root admin, service role or SQL editor only (admin_set_setting runs as definer, so the check
-- reads the CALLER's JWT, not current_user)
create or replace function app.guard_security_settings()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (case when tg_op = 'DELETE' then old.key else new.key end) like 'security.%'
     and not (auth.jwt() is null or coalesce(auth.jwt() ->> 'role', '') = 'service_role' or (app.is_root() and app.staff_mfa_ok())) then
    raise exception 'security settings are changed by the root admin only' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
drop trigger if exists site_settings_security_guard on public.site_settings;
create trigger site_settings_security_guard before insert or update or delete on public.site_settings
  for each row execute function app.guard_security_settings();

-- ---------------------------------------------------------------- B. grants --
do $$
declare r record; privs text := 'truncate, references, trigger';
begin
  if current_setting('server_version_num')::int >= 170000 then privs := privs || ', maintain'; end if;
  for r in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname in ('public', 'app', 'analytics') and c.relkind in ('r', 'p', 'v', 'm', 'f') loop
    execute format('revoke %s on table %I.%I from anon, authenticated', privs, r.nspname, r.relname);
  end loop;
  execute format('alter default privileges for role postgres in schema public revoke %s on tables from anon, authenticated', privs);
end $$;
