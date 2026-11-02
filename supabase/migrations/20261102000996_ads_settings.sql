-- =============================================================================
-- Plans + ads.
--   free  → ads (landing, news, resources, dashboard, between lessons, anchor, vignette)
--   pro   → "101 Pro" subscription (Flutterwave payment plan through the ledger) → ad-free
-- Under-18s on free: child-directed, NON-personalised ads only.
-- Never on checkout, payment, payout, admin or certificate-verify routes.
-- AdSense client id is a TODO placeholder (no account yet).
-- =============================================================================
create type public.member_plan as enum ('free','pro');

alter table public.profiles add column plan public.member_plan not null default 'free';
alter table public.subscription_plans add column grants_plan public.member_plan not null default 'pro';

-- plan is derived from subscriptions; only the server/derivation may change it
create or replace function app.guard_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.is_privileged() and new.plan is distinct from old.plan then
    raise exception 'plan is derived from your subscription' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_plan before update of plan on public.profiles for each row execute function app.guard_plan();

create or replace function app.sync_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid text := coalesce(new.user_id, old.user_id);
begin
  update public.profiles p set plan = case when exists (
      select 1 from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
       where s.user_id = uid and s.status = 'active' and s.current_period_end > now() and sp.grants_plan = 'pro')
    then 'pro'::public.member_plan else 'free'::public.member_plan end
   where p.id = uid;
  return null;
end;
$$;
create trigger subscriptions_sync_plan after insert or update or delete on public.subscriptions for each row execute function app.sync_plan();

-- 'none' (Pro), 'child_directed' (free, under 18: non-personalised, COPPA/TFCD tags), 'standard' (free adult)
create or replace function app.ad_tier(p_user text)
returns text language sql stable security definer set search_path = '' as $$
  select case when p_user is null then 'standard'
              when p.plan = 'pro' then 'none'
              when p.is_minor then 'child_directed'
              else 'standard' end
    from public.profiles p where p.id = p_user
$$;

create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', coalesce((select plan from public.profiles where id = app.requesting_user_id()), 'free'),
    'ad_tier', coalesce(app.ad_tier(app.requesting_user_id()), 'standard'),
    'pro_until', (select max(s.current_period_end) from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
                   where s.user_id = app.requesting_user_id() and s.status = 'active' and sp.grants_plan = 'pro'))
$$;
revoke execute on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

update public.subscription_plans set name = replace(name, '101 Pro', '101 Pro'), features = features || '{"ad_free": true}'::jsonb where code like 'pro-%';

-- Daily maintenance must also downgrade expired Pro members.
create or replace function app.recompute_all_plans()
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.profiles p set plan = 'free' where p.plan = 'pro' and not exists (
    select 1 from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
     where s.user_id = p.id and s.status = 'active' and s.current_period_end > now() and sp.grants_plan = 'pro');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function app.recompute_all_plans() from public, anon, authenticated;

insert into public.site_settings (key, value, is_public, description) values
  ('ads', jsonb_build_object(
     'enabled', false,
     'adsense_client', null,                       -- TODO: "ca-pub-XXXXXXXXXXXXXXXX" once the AdSense account is approved
     'slots', jsonb_build_object('landing', null, 'news', null, 'resources', null, 'dashboard', null, 'between_lessons', null),
     'placements', jsonb_build_object('landing', true, 'news', true, 'resources', true, 'launchpad', true, 'external_courses', true, 'jobs', true,
                                      'dashboard', true, 'between_lessons', true, 'anchor', true, 'vignette', true),
     'never_on', jsonb_build_array('checkout','payments','payouts','wallet','admin','verify','guardian','onboarding')
   ), true, 'Ad configuration. Free plan sees ads; 101 Pro is ad-free; minors get child-directed non-personalised ads only.')
on conflict (key) do update set value = excluded.value, description = excluded.description;

-- run_daily_maintenance also downgrades lapsed Pro members
create or replace function public.run_daily_plan_sync()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  return app.recompute_all_plans();
end;
$$;
revoke execute on function public.run_daily_plan_sync() from public, anon, authenticated;
grant execute on function public.run_daily_plan_sync() to service_role;
