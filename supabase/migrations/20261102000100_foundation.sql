-- =============================================================================
-- 101 Codecrafts — foundation: extensions, private schemas, enums, helpers
-- Identity comes from Clerk via Supabase third-party auth: auth.jwt()->>'sub'
-- is the Clerk user id (TEXT, e.g. "user_2abc..."). Never use auth.uid():
-- Clerk ids are not UUIDs.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto  with schema extensions;
create extension if not exists pg_trgm   with schema extensions;

-- Private schemas: NOT exposed through the Data API. Roles only get USAGE so
-- RLS policies can call helpers. `analytics` holds materialized views that are
-- read exclusively through admin-checked RPCs.
create schema if not exists app;
create schema if not exists analytics;
revoke all on schema app, analytics from public;
grant usage on schema app to anon, authenticated, service_role;
grant usage on schema analytics to service_role;

-- SR-04: no implicit grants. Functions are NOT executable by API roles unless
-- granted explicitly; anon gets nothing on new tables by default (RLS +
-- explicit grants in 0990 decide).
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- ---------------------------------------------------------------- enums ----
create type public.app_role              as enum ('learner','tutor','admin','super_admin');
create type public.account_status        as enum ('pending','active','suspended','banned');
create type public.application_status    as enum ('pending','approved','rejected','withdrawn');
create type public.tutor_verification    as enum ('unverified','pending','verified','rejected','suspended');
create type public.content_status        as enum ('draft','pending_review','published','rejected','archived');
create type public.visibility            as enum ('public','members','group','private');
create type public.education_level       as enum ('primary','o_level','a_level','university','professional');
create type public.age_rating            as enum ('all','13_plus','16_plus','18_plus');
create type public.skill_level           as enum ('beginner','intermediate','advanced');
create type public.enrollment_status     as enum ('active','completed','dropped','refunded');
create type public.listing_kind          as enum ('digital','service','physical');
create type public.listing_status        as enum ('draft','active','sold_out','archived');
create type public.order_status          as enum ('pending_payment','paid','fulfilled','cancelled','refunded');
create type public.payment_status        as enum ('pending','successful','failed','cancelled','abandoned','refunded','partially_refunded');
create type public.payment_purpose       as enum ('course','subscription','event_ticket','marketplace_order','tutor_session','donation');
create type public.event_status          as enum ('draft','published','cancelled','completed');
create type public.registration_status   as enum ('registered','waitlisted','cancelled','attended','refunded');
create type public.session_kind          as enum ('one_on_one','group');
create type public.session_status        as enum ('scheduled','cancelled','completed');
create type public.booking_status        as enum ('pending_payment','confirmed','cancelled','attended','no_show','refunded');
create type public.group_role            as enum ('owner','moderator','member');
create type public.flag_target           as enum ('post','post_comment','project','project_comment','listing','message','profile','resource','event','course','review','launch_product','launch_comment','test_feedback','competition_submission','group','job');
create type public.flag_status           as enum ('open','reviewing','resolved','dismissed');
create type public.announcement_audience as enum ('public','members','learners','tutors','admins');
create type public.resource_kind         as enum ('article','video','doc','repo','dataset','template','course','other');
create type public.review_status         as enum ('pending','approved','rejected');
create type public.tool_pricing          as enum ('free','freemium','paid','open_source');
create type public.conversation_kind     as enum ('direct','group');
create type public.coupon_kind           as enum ('percent','fixed');
create type public.billing_interval      as enum ('monthly','quarterly','yearly');
create type public.subscription_status   as enum ('pending','active','past_due','cancelled','expired');
create type public.refund_status         as enum ('requested','processing','completed','failed','rejected');
create type public.payout_status         as enum ('requested','approved','held','processing','paid','failed','rejected');
create type public.payout_method_kind    as enum ('mobile_money','bank');
create type public.ledger_account_kind   as enum ('asset','liability','revenue','expense','contra_revenue');
create type public.ledger_direction      as enum ('debit','credit');

-- ------------------------------------------------------- generic helpers ----
create or replace function app.requesting_user_id()
returns text language sql stable set search_path = '' as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

-- True for trusted backend roles (service key, migrations) and for statements
-- issued inside SECURITY DEFINER functions (current_user = owner there).
create or replace function app.is_privileged()
returns boolean language sql stable set search_path = '' as $$
  select current_user in ('service_role','postgres','supabase_admin')
$$;

-- Trusted BACKEND caller (service-role key, migrations/SQL editor). Unlike
-- is_privileged() this does NOT trust definer context; use it as the first
-- line of every service-only function.
create or replace function app.is_backend()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or (auth.jwt() is null and session_user in ('postgres','supabase_admin'))
$$;

create or replace function app.require_backend()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not app.is_backend() then raise exception 'service role only' using errcode = '42501'; end if;
end;
$$;

-- SR-01: called at the end of EVERY migration so no table is ever committed
-- without RLS. A CI check (supabase/tests) fails if any table lacks it.
create or replace function app.enable_rls_all()
returns void language plpgsql set search_path = '' as $$
declare t record;
begin
  for t in select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('r','p') and n.nspname in ('public','app','analytics') and not c.relrowsecurity loop
    execute format('alter table %I.%I enable row level security', t.nspname, t.relname);
  end loop;
end;
$$;

create or replace function app.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;

create or replace function app.tags_to_text(arr text[])
returns text language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_to_string(arr, ' '), '')
$$;

-- Search-as-you-type: "reac nat" -> 'reac':* & 'nat':*
create or replace function app.prefix_tsquery(cfg regconfig, q text)
returns tsquery language sql stable parallel safe set search_path = '' as $$
  select case when count(*) = 0 then null
              else pg_catalog.to_tsquery(cfg, string_agg(quote_literal(w) || ':*', ' & ')) end
  from (select regexp_replace(lower(t), '[^[:alnum:]_]+', '', 'g') as w
          from regexp_split_to_table(coalesce(q, ''), '\s+') as t) s
  where w <> ''
$$;

create or replace function app.try_uuid(v text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin return v::uuid; exception when others then return null; end;
$$;
