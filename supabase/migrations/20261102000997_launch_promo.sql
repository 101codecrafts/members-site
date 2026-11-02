-- =============================================================================
-- Launch promotion: for the promo window EVERYONE is treated as 101 Pro
-- (all features, no paywall on courses, no ads). Promo is evaluated first;
-- afterwards: free tier with ads, Pro is paid.
-- Tutors are not paid for promo enrolments (no payment happens); see BACKEND.md.
-- =============================================================================
insert into public.site_settings (key, value, is_public, description) values
  ('launch_promo', jsonb_build_object('enabled', false, 'starts_at', null, 'ends_at', null,
     'banner_text', 'Launch month: everything on 101 Codecrafts is free for everyone 🎉', 'reminders_sent', '[]'::jsonb),
   true, 'Launch promo window. ends_at defaults to starts_at + 1 month. Set with admin_set_launch_promo().')
on conflict (key) do nothing;

create or replace function app.promo_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select (v ->> 'enabled')::boolean and now() >= (v ->> 'starts_at')::timestamptz and now() < (v ->> 'ends_at')::timestamptz
      from (select value v from public.site_settings where key = 'launch_promo') s), false)
$$;

-- Effective tier: promo first, then plan, then age.
create or replace function app.ad_tier(p_user text)
returns text language sql stable security definer set search_path = '' as $$
  select case when app.promo_active() then 'none'
              when p_user is null then 'standard'
              when (select plan from public.profiles where id = p_user) = 'pro' then 'none'
              when (select is_minor from public.profiles where id = p_user) then 'child_directed'
              else 'standard' end
$$;

create or replace function app.has_pro(p_user text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.promo_active() or coalesce((select plan = 'pro' from public.profiles where id = p_user), false)
$$;

create or replace function public.my_plan()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'plan', coalesce((select plan::text from public.profiles where id = app.requesting_user_id()), 'free'),
    'effective_plan', case when app.has_pro(app.requesting_user_id()) then 'pro' else 'free' end,
    'promo_active', app.promo_active(),
    'promo_ends_at', case when app.promo_active() then (select value ->> 'ends_at' from public.site_settings where key = 'launch_promo') end,
    'ad_tier', app.ad_tier(app.requesting_user_id()),
    'pro_until', (select max(s.current_period_end) from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
                   where s.user_id = app.requesting_user_id() and s.status = 'active' and sp.grants_plan = 'pro'))
$$;
revoke execute on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

create or replace function public.admin_set_launch_promo(p_enabled boolean, p_starts_at timestamptz default null,
                                                         p_ends_at timestamptz default null, p_banner_text text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cur jsonb; s timestamptz; e timestamptz; v jsonb;
begin
  perform app.require_admin();
  select value into cur from public.site_settings where key = 'launch_promo';
  s := coalesce(p_starts_at, (cur ->> 'starts_at')::timestamptz, now());
  e := coalesce(p_ends_at, case when p_starts_at is not null then s + interval '1 month' end, (cur ->> 'ends_at')::timestamptz, s + interval '1 month');
  if e <= s then raise exception 'ends_at must be after starts_at' using errcode = '22023'; end if;
  if e > s + interval '6 months' then raise exception 'promo cannot exceed 6 months' using errcode = '22023'; end if;
  v := jsonb_build_object('enabled', p_enabled, 'starts_at', s, 'ends_at', e,
         'banner_text', left(coalesce(p_banner_text, cur ->> 'banner_text', 'Launch month: everything is free'), 200),
         -- extending the window re-arms the reminder emails
         'reminders_sent', case when (cur ->> 'ends_at')::timestamptz is distinct from e then '[]'::jsonb else coalesce(cur -> 'reminders_sent', '[]'::jsonb) end);
  update public.site_settings set value = v, updated_by = app.requesting_user_id() where key = 'launch_promo';
  return v;
end;
$$;
revoke execute on function public.admin_set_launch_promo(boolean, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.admin_set_launch_promo(boolean, timestamptz, timestamptz, text) to authenticated;

-- Cron helper: which reminder (7d / 1d) is due now, marking it sent atomically.
create or replace function public.claim_promo_reminder()
returns text language plpgsql security definer set search_path = '' as $$
declare v jsonb; e timestamptz; sent jsonb; due text;
begin
  perform app.require_backend();
  select value into v from public.site_settings where key = 'launch_promo' for update;
  if not coalesce((v ->> 'enabled')::boolean, false) then return null; end if;
  e := (v ->> 'ends_at')::timestamptz; sent := coalesce(v -> 'reminders_sent', '[]'::jsonb);
  if e is null or e < now() then return null; end if;
  if e - now() <= interval '1 day' and not sent ? '1d' then due := '1d';
  elsif e - now() <= interval '7 days' and e - now() > interval '1 day' and not sent ? '7d' then due := '7d';
  end if;
  if due is not null then
    update public.site_settings set value = jsonb_set(v, '{reminders_sent}', sent || to_jsonb(due)) where key = 'launch_promo';
  end if;
  return due;
end;
$$;
revoke execute on function public.claim_promo_reminder() from public, anon, authenticated;
grant execute on function public.claim_promo_reminder() to service_role;

-- No paywall during the promo: members may enrol in ANY published course
-- directly, and lessons/media of all published courses are readable.
create policy enrollments_insert_promo on public.enrollments for insert to authenticated with check (
  app.promo_active() and user_id = (select app.requesting_user_id()) and (select app.is_member())
  and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published' and c.deleted_at is null and app.age_ok(c.age_rating)));
create policy lessons_select_promo on public.lessons for select to authenticated using (
  app.promo_active() and (select app.is_member())
  and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published' and c.deleted_at is null and app.age_ok(c.age_rating)));
create policy course_media_select_promo on public.course_media for select to authenticated using (
  approved and app.promo_active() and (select app.is_member())
  and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published' and c.deleted_at is null and app.age_ok(c.age_rating)));
