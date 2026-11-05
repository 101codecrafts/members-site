-- =============================================================================
-- Round 11 (plans): Learner + Tutor plans (Free/Standard/Plus/Pro), plan-based
-- access (lesson locks, course + student caps), tutor price requests with admin
-- approval, verified-only ratings, pluggable payment providers (sandbox only),
-- and a server-priced plan checkout (SR-17) that posts through the existing ledger.
--
-- WRITTEN, NOT APPLIED. The founder applies it. Depends on 20261105001000.
-- Every price and limit lives in DATA (plan_tiers.limits, subscription_plans.amount_ugx),
-- editable by admins; the seed values are SUGGESTIONS (see PLANS.md).
-- =============================================================================

-- --------------------------------------------------------------- helpers ----
create or replace function app.plan_rank(p public.member_plan)
returns int language sql immutable set search_path = '' as $$
  select coalesce(array_position(array['free','standard','plus','pro']::text[], p::text), 1) - 1
$$;

-- learner | tutor | admin | super_admin present = a full member (guests hold none of these)
create or replace function app.r11_has_member_role(p_user text default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = coalesce(p_user, app.requesting_user_id())
                   and ur.role::text in ('learner','tutor','admin','super_admin'))
$$;

-- -------------------------------------------------------- plan catalogue ----
create table public.plan_tiers (
  audience            text not null check (audience in ('learner','tutor')),
  tier                public.member_plan not null,
  name                text not null check (char_length(name) between 2 and 40),
  tagline             text check (char_length(tagline) <= 160),
  features            jsonb not null default '[]' check (jsonb_typeof(features) = 'array'),
  limits              jsonb not null default '{}' check (jsonb_typeof(limits) = 'object'),
  sort                smallint not null default 0,
  highlight           boolean not null default false,
  price_is_suggestion boolean not null default true,     -- shown as "suggested" in admin until the founder confirms
  is_active           boolean not null default true,
  updated_by          text references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (audience, tier)
);
create trigger plan_tiers_updated_at before update on public.plan_tiers for each row execute function app.set_updated_at();
create trigger plan_tiers_audit after insert or update or delete on public.plan_tiers for each row execute function app.audit_row();

alter table public.subscription_plans
  add column audience text check (audience in ('learner','tutor')),
  add column tier public.member_plan;
alter table public.subscription_plans
  add constraint subscription_plans_tier_fk foreign key (audience, tier) references public.plan_tiers (audience, tier) on update cascade,
  add constraint subscription_plans_tier_paid check (tier is null or tier <> 'free');
create unique index subscription_plans_one_price on public.subscription_plans (audience, tier, interval) where is_active and audience is not null;

-- one live subscription PER AUDIENCE (a tutor may also hold a learner plan)
alter table public.subscriptions add column audience text check (audience in ('learner','tutor'));
drop index if exists public.subscriptions_one_live;
create unique index subscriptions_one_live_per_audience on public.subscriptions (user_id, (coalesce(audience, 'learner'))) where status in ('active','past_due');

alter table public.profiles add column tutor_plan public.member_plan not null default 'free';

create or replace function app.guard_tutor_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.is_privileged() and new.tutor_plan is distinct from old.tutor_plan then
    raise exception 'plan is derived from your subscription' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_tutor_plan before update of tutor_plan on public.profiles for each row execute function app.guard_tutor_plan();

-- profiles.plan (learner) and profiles.tutor_plan = highest ACTIVE tier per audience.
-- Legacy "101 Pro" rows (audience null) still count as learner grants_plan.
create or replace function app.sync_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
declare uid text := coalesce(new.user_id, old.user_id);
begin
  update public.profiles p set
    plan = coalesce((select coalesce(sp.tier, sp.grants_plan) from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
                      where s.user_id = uid and s.status = 'active' and s.current_period_end > now() and coalesce(s.audience, sp.audience, 'learner') = 'learner'
                      order by coalesce(sp.tier, sp.grants_plan) desc limit 1), 'free'),
    tutor_plan = coalesce((select sp.tier from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
                      where s.user_id = uid and s.status = 'active' and s.current_period_end > now() and coalesce(s.audience, sp.audience) = 'tutor'
                      order by sp.tier desc limit 1), 'free')
   where p.id = uid;
  return null;
end;
$$;

-- a new active subscription supersedes the old one for the same audience (upgrade/downgrade; no proration this round)
create or replace function app.subscription_supersede()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.audience is null then
    new.audience := coalesce((select sp.audience from public.subscription_plans sp where sp.id = new.plan_id), 'learner');
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    update public.subscriptions set status = 'cancelled', cancelled_at = now(), cancel_at_period_end = false
     where user_id = new.user_id and coalesce(audience, 'learner') = new.audience and id <> new.id and status in ('active','past_due');
  end if;
  return new;
end;
$$;
create trigger subscriptions_supersede before insert or update of status on public.subscriptions for each row execute function app.subscription_supersede();

-- ads: launch promo first (unchanged), then any PAID learner tier is ad-free (was: only 'pro'), then age
create or replace function app.ad_tier(p_user text)
returns text language sql stable security definer set search_path = '' as $$
  select case when app.promo_active() then 'none'
              when p_user is null then 'standard'
              when (select plan from public.profiles where id = p_user) <> 'free' then 'none'
              when (select is_minor from public.profiles where id = p_user) then 'child_directed'
              else 'standard' end
$$;

create or replace function app.user_plan(p_user text, p_audience text)
returns public.member_plan language sql stable security definer set search_path = '' as $$
  select coalesce((select case when p_audience = 'tutor' then p.tutor_plan else p.plan end from public.profiles p where p.id = p_user), 'free')
$$;

-- tier used for LEARNING (a tutor who studies gets the better of the two). The launch promo (everyone is Pro,
-- no paywall; 20261102000997) wins while it runs.
create or replace function app.learning_tier(p_user text)
returns public.member_plan language sql stable security definer set search_path = '' as $$
  select case when app.promo_active() then 'pro'::public.member_plan
              else coalesce((select greatest(p.plan, p.tutor_plan) from public.profiles p where p.id = p_user), 'free') end
$$;

-- numeric limit: null = unlimited; missing row/key = 0 (fail closed); true = unlimited, false = 0
create or replace function app.plan_limit(p_audience text, p_tier public.member_plan, p_key text)
returns bigint language sql stable security definer set search_path = '' as $$
  select case
    when t.limits is null or not (t.limits ? p_key) then 0
    when jsonb_typeof(t.limits -> p_key) = 'null' then null
    when jsonb_typeof(t.limits -> p_key) = 'number' then (t.limits ->> p_key)::numeric::bigint
    when jsonb_typeof(t.limits -> p_key) = 'boolean' then case when (t.limits ->> p_key)::boolean then null else 0 end
    else 0 end
  from (select (select limits from public.plan_tiers where audience = p_audience and tier = p_tier and is_active) as limits) t
$$;

-- -------------------------------------------- lessons: plan-based locks ----
alter table public.courses add column all_lessons_free boolean not null default false;   -- admin-only: open every lesson to every plan
alter table public.lessons add column min_plan public.member_plan;                        -- tutor/admin override per lesson (null = default rule)

-- default rule: the first N lessons (N = learner free limit `lessons.free_per_course`) are free, the rest need Standard
create or replace function app.lesson_min_plan(p_lesson uuid)
returns public.member_plan language sql stable security definer set search_path = '' as $$
  select coalesce(l.min_plan,
    case when (select count(*) from public.lessons x where x.course_id = l.course_id and x.position < l.position)
              < coalesce(app.plan_limit('learner', 'free', 'lessons.free_per_course'), 2147483647)
         then 'free'::public.member_plan else 'standard'::public.member_plan end)
  from public.lessons l where l.id = p_lesson
$$;

create or replace function app.can_view_lesson(p_lesson uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lessons l join public.courses c on c.id = l.course_id
     where l.id = p_lesson and c.status = 'published' and c.deleted_at is null and app.age_ok(c.age_rating)
       and (l.is_preview
            or (app.is_enrolled(c.id) and (
                  not c.is_free                                   -- bought outright: the whole course is theirs
                  or c.all_lessons_free
                  or app.plan_rank(app.learning_tier(app.requesting_user_id())) >= app.plan_rank(app.lesson_min_plan(l.id))))))
$$;

drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select to anon, authenticated using (
  (select app.is_admin()) or app.owns_course(course_id) or app.can_view_lesson(id));

drop policy if exists course_media_select on public.course_media;
create policy course_media_select on public.course_media for select to authenticated using (
  (approved and lesson_id is not null and app.can_view_lesson(lesson_id))
  or (approved and lesson_id is null and app.is_enrolled(course_id))
  or app.owns_course(course_id) or (select app.is_admin()));

-- Public syllabus: every lesson's title + lock state (no content), so the UI can show locked lessons honestly.
create or replace function public.course_syllabus(p_course uuid)
returns table (lesson_id uuid, "position" int, title text, duration_minutes int, is_preview boolean, min_plan public.member_plan, locked boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, l.position, l.title, l.duration_minutes, l.is_preview, app.lesson_min_plan(l.id), not app.can_view_lesson(l.id)
    from public.lessons l join public.courses c on c.id = l.course_id
   where l.course_id = p_course and c.status = 'published' and c.deleted_at is null and app.age_ok(c.age_rating)
   order by l.position
$$;

-- ----------------------------------------- enrolment + tutor-capacity caps ----
create or replace function app.tutor_student_count(p_tutor text, p_except text default null)
returns bigint language sql stable security definer set search_path = '' as $$
  select count(distinct u) from (
    select e.user_id u from public.enrollments e join public.courses c on c.id = e.course_id
     where c.tutor_id = p_tutor and e.status in ('active','completed')
    union
    select b.learner_id from public.session_bookings b join public.tutor_sessions s on s.id = b.session_id
     where s.tutor_id = p_tutor and b.status in ('pending_payment','confirmed','attended')
  ) x where u <> p_tutor and (p_except is null or u <> p_except)
$$;

create or replace function app.is_student_of(p_tutor text, p_learner text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments e join public.courses c on c.id = e.course_id
                  where c.tutor_id = p_tutor and e.user_id = p_learner and e.status in ('active','completed'))
      or exists (select 1 from public.session_bookings b join public.tutor_sessions s on s.id = b.session_id
                  where s.tutor_id = p_tutor and b.learner_id = p_learner and b.status in ('pending_payment','confirmed','attended'))
$$;

-- Readable pre-check for the UI and the checkout service: {ok, reason, limit, used}
create or replace function public.can_enroll(p_course uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); c public.courses; tier public.member_plan; aud text; cap bigint; used bigint; tcap bigint;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'sign_in'); end if;
  select * into c from public.courses where id = p_course and status = 'published' and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if app.is_admin() then return jsonb_build_object('ok', true); end if;
  if app.is_enrolled(c.id) then return jsonb_build_object('ok', true, 'reason', 'already_enrolled'); end if;
  if not c.is_free and not app.r11_has_member_role(me) then return jsonb_build_object('ok', false, 'reason', 'guest_paid_course'); end if;
  if c.tutor_id is not null and c.tutor_id <> me and not app.is_student_of(c.tutor_id, me) then
    tcap := app.plan_limit('tutor', app.user_plan(c.tutor_id, 'tutor'), 'students.max');
    if tcap is not null and app.tutor_student_count(c.tutor_id) >= tcap then
      return jsonb_build_object('ok', false, 'reason', 'tutor_full', 'limit', tcap); end if;
  end if;
  if c.is_free then
    tier := app.learning_tier(me); aud := case when app.has_role('tutor') then 'tutor' else 'learner' end;
    cap := app.plan_limit(aud, tier, 'courses.active');
    select count(*) into used from public.enrollments e join public.courses c2 on c2.id = e.course_id
     where e.user_id = me and e.status = 'active' and c2.is_free and e.payment_id is null;
    if cap is not null and used >= cap then
      return jsonb_build_object('ok', false, 'reason', 'plan_limit', 'key', 'courses.active', 'limit', cap, 'used', used, 'plan', tier); end if;
  end if;
  return jsonb_build_object('ok', true, 'purchase_required', not c.is_free);
end;
$$;

-- Hard enforcement on the table (runs after app.guard_enrollment, which forces user_id/payment_id for API callers).
create or replace function app.guard_enrollment_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' then return new; end if;
  if new.payment_id is not null then return new; end if;            -- paid enrolment from the verified webhook: checked at checkout
  if app.is_privileged() and app.requesting_user_id() is null then return new; end if;   -- service/maintenance grants
  if app.is_admin() then return new; end if;
  -- evaluate as the enrolling user (requesting user == new.user_id for API inserts; guard_enrollment forces it)
  if new.user_id is distinct from app.requesting_user_id() then return new; end if;
  v := public.can_enroll(new.course_id);
  if (v ->> 'reason') = 'already_enrolled' then return new; end if;
  if not coalesce((v ->> 'ok')::boolean, false) then
    raise exception 'enrolment refused: %', coalesce(v ->> 'reason', 'not_allowed')
      using errcode = case when v ->> 'reason' in ('plan_limit','tutor_full') then 'P0001' else '42501' end, detail = v::text;
  end if;
  return new;
end;
$$;
create trigger enrollments_plan_guard before insert or update of status on public.enrollments for each row execute function app.guard_enrollment_plan();

-- Guests buy ONLY on the marketplace: no course / session / plan purchases (DB-level, whatever the client sends).
create or replace function app.guard_payment_buyer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is not null and new.purpose in ('course','tutor_session','subscription') and not app.r11_has_member_role(new.user_id) then
    raise exception 'guests can only buy on the marketplace: become a learner or tutor first' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger payments_buyer_guard before insert on public.payments for each row execute function app.guard_payment_buyer();

-- ------------------------------------------- course pricing (admin-approved) ----
-- NOT security definer: app.is_privileged() must see the real caller (inside a definer it is always the owner).
-- The admin RPCs below run as definer, so their own updates pass as privileged.
create or replace function app.guard_course_pricing()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    if not new.is_free or new.price_ugx <> 0 or new.all_lessons_free then
      raise exception 'course prices go through an admin-approved price request' using errcode = '42501'; end if;
  elsif new.is_free is distinct from old.is_free or new.price_ugx is distinct from old.price_ugx or new.all_lessons_free is distinct from old.all_lessons_free then
    raise exception 'course prices go through an admin-approved price request' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger courses_pricing_guard before insert or update on public.courses for each row execute function app.guard_course_pricing();

create table public.course_price_requests (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null references public.courses(id) on delete cascade,
  tutor_id       text not null references public.profiles(id) on delete cascade,
  make_free      boolean not null default false,
  price_ugx      bigint check (price_ugx is null or price_ugx between 1000 and 100000000),
  note           text check (char_length(note) <= 1000),
  status         public.review_status not null default 'pending',
  decided_by     text references public.profiles(id) on delete set null,
  decided_at     timestamptz,
  decision_note  text check (char_length(decision_note) <= 1000),
  created_at     timestamptz not null default now(),
  check ((make_free and price_ugx is null) or (not make_free and price_ugx is not null))
);
create unique index course_price_requests_one_pending on public.course_price_requests (course_id) where status = 'pending';
create index course_price_requests_queue on public.course_price_requests (status, created_at);
alter table public.course_price_requests enable row level security;
create policy cpr_select on public.course_price_requests for select to authenticated
  using (tutor_id = (select app.requesting_user_id()) or (select app.is_admin()));
-- writes only through the functions below
revoke insert, update, delete on public.course_price_requests from anon, authenticated;
grant select on public.course_price_requests to authenticated;

create or replace function public.request_course_price(p_course uuid, p_price_ugx bigint default null, p_make_free boolean default false, p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); cap bigint; rid uuid;
begin
  if me is null or not app.is_tutor() or not app.owns_course(p_course) then raise exception 'only the course tutor can request a price' using errcode = '42501'; end if;
  if not p_make_free then
    if p_price_ugx is null or p_price_ugx < 1000 then raise exception 'price must be at least UGX 1,000' using errcode = '22023'; end if;
    cap := app.plan_limit('tutor', app.user_plan(me, 'tutor'), 'price.max_ugx');
    if cap is not null and p_price_ugx > cap then
      raise exception 'your plan allows prices up to UGX %', to_char(cap, 'FM999,999,999') using errcode = 'P0001'; end if;
  end if;
  update public.course_price_requests set status = 'rejected', decided_at = now(), decision_note = 'superseded by a newer request'
   where course_id = p_course and status = 'pending';
  insert into public.course_price_requests (course_id, tutor_id, make_free, price_ugx, note)
  values (p_course, me, p_make_free, case when p_make_free then null else p_price_ugx end, p_note) returning id into rid;
  perform app.audit_action('course.price_request', 'course_price_requests', rid::text, jsonb_build_object('course_id', p_course, 'price_ugx', p_price_ugx, 'make_free', p_make_free));
  return rid;
end;
$$;

create or replace function public.decide_course_price(p_request uuid, p_approve boolean, p_note text default null)
returns public.course_price_requests language plpgsql security definer set search_path = '' as $$
declare r public.course_price_requests;
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select * into r from public.course_price_requests where id = p_request for update;
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'request already decided' using errcode = 'P0001'; end if;
  if p_approve then
    update public.courses set is_free = r.make_free, price_ugx = coalesce(r.price_ugx, 0) where id = r.course_id;
  end if;
  update public.course_price_requests set status = case when p_approve then 'approved'::public.review_status else 'rejected'::public.review_status end,
         decided_by = app.requesting_user_id(), decided_at = now(), decision_note = p_note where id = r.id returning * into r;
  perform app.notify(r.tutor_id, 'course.price_decided', case when p_approve then 'Course price approved' else 'Course price not approved' end,
                     coalesce(p_note, ''), '/tutor.html#courses', jsonb_build_object('course_id', r.course_id));
  perform app.audit_action('course.price_decide', 'course_price_requests', r.id::text, jsonb_build_object('approved', p_approve));
  return r;
end;
$$;

-- admin: make any course free or paid directly (and open all lessons)
create or replace function public.admin_set_course_pricing(p_course uuid, p_is_free boolean, p_price_ugx bigint default 0, p_all_lessons_free boolean default null)
returns public.courses language plpgsql security definer set search_path = '' as $$
declare c public.courses;
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  update public.courses set is_free = p_is_free, price_ugx = case when p_is_free then 0 else p_price_ugx end,
         all_lessons_free = coalesce(p_all_lessons_free, all_lessons_free)
   where id = p_course returning * into c;
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;
  update public.course_price_requests set status = 'rejected', decided_by = app.requesting_user_id(), decided_at = now(), decision_note = 'overridden by admin'
   where course_id = p_course and status = 'pending';
  perform app.audit_action('course.pricing_set', 'courses', p_course::text, jsonb_build_object('is_free', p_is_free, 'price_ugx', p_price_ugx, 'all_lessons_free', p_all_lessons_free));
  return c;
end;
$$;

-- admin: edit a plan tier's limits/features and its prices (one call for the admin console)
create or replace function public.admin_update_plan(p_audience text, p_tier public.member_plan, p_name text default null, p_tagline text default null,
                                                    p_limits jsonb default null, p_features jsonb default null,
                                                    p_monthly_ugx bigint default null, p_yearly_ugx bigint default null, p_confirm_prices boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.plan_tiers;
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if p_limits is not null and jsonb_typeof(p_limits) <> 'object' then raise exception 'limits must be an object' using errcode = '22023'; end if;
  update public.plan_tiers set name = coalesce(p_name, name), tagline = coalesce(p_tagline, tagline),
         limits = case when p_limits is null then limits else limits || p_limits end,
         features = coalesce(p_features, features), price_is_suggestion = case when p_confirm_prices then false else price_is_suggestion end,
         updated_by = app.requesting_user_id()
   where audience = p_audience and tier = p_tier returning * into t;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  if p_tier <> 'free' then
    if p_monthly_ugx is not null then
      update public.subscription_plans set amount_ugx = p_monthly_ugx, flw_payment_plan_id = null where audience = p_audience and tier = p_tier and interval = 'monthly' and is_active;
    end if;
    if p_yearly_ugx is not null then
      update public.subscription_plans set amount_ugx = p_yearly_ugx, flw_payment_plan_id = null where audience = p_audience and tier = p_tier and interval = 'yearly' and is_active;
    end if;
  end if;
  perform app.audit_action('plan.update', 'plan_tiers', p_audience || ':' || p_tier, jsonb_build_object('limits', p_limits, 'monthly', p_monthly_ugx, 'yearly', p_yearly_ugx));
  return public.plans_catalogue() -> p_audience;
end;
$$;

-- Public catalogue (prices + limits) for the pricing page; no secrets.
create or replace function app.plans_json(p_audience text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('tier', t.tier, 'name', t.name, 'tagline', t.tagline, 'features', t.features,
      'limits', t.limits, 'highlight', t.highlight, 'price_is_suggestion', t.price_is_suggestion,
      'monthly_ugx', (select sp.amount_ugx from public.subscription_plans sp where sp.audience = t.audience and sp.tier = t.tier and sp.interval = 'monthly' and sp.is_active),
      'yearly_ugx',  (select sp.amount_ugx from public.subscription_plans sp where sp.audience = t.audience and sp.tier = t.tier and sp.interval = 'yearly' and sp.is_active))
      order by t.sort), '[]'::jsonb)
    from public.plan_tiers t where t.audience = p_audience and t.is_active
$$;
create or replace function public.plans_catalogue()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('currency', 'UGX', 'learner', app.plans_json('learner'), 'tutor', app.plans_json('tutor'))
$$;

-- what the signed-in user has right now (front end: CCAccess.plan / .limit)
create or replace function public.my_entitlements()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'learner_plan', app.user_plan(app.requesting_user_id(), 'learner'),
    'tutor_plan', app.user_plan(app.requesting_user_id(), 'tutor'),
    'learner_limits', (select limits from public.plan_tiers where audience = 'learner' and tier = app.user_plan(app.requesting_user_id(), 'learner')),
    'tutor_limits', case when app.has_role('tutor') then (select limits from public.plan_tiers where audience = 'tutor' and tier = app.user_plan(app.requesting_user_id(), 'tutor')) end,
    'usage', jsonb_build_object(
      'courses.active', (select count(*) from public.enrollments e join public.courses c on c.id = e.course_id
                          where e.user_id = app.requesting_user_id() and e.status = 'active' and c.is_free and e.payment_id is null),
      'students', case when app.has_role('tutor') then app.tutor_student_count(app.requesting_user_id()) end),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('audience', coalesce(s.audience, 'learner'), 'tier', coalesce(sp.tier, sp.grants_plan), 'interval', sp.interval,
                         'status', s.status, 'current_period_end', s.current_period_end, 'cancel_at_period_end', s.cancel_at_period_end))
                       from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
                      where s.user_id = app.requesting_user_id() and s.status in ('active','past_due','pending')), '[]'))
$$;

-- ---------------------------------------------- ratings: verified use only ----
-- tutor_reviews carries course + tutor (+ session) ratings and feeds courses.rating_avg / tutor_profiles.rating_avg
create or replace function app.guard_verified_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_privileged() and app.requesting_user_id() is null then return new; end if;
  if tg_op = 'UPDATE' and new.learner_id = old.learner_id and new.course_id is not distinct from old.course_id
     and new.session_id is not distinct from old.session_id and new.tutor_id = old.tutor_id then
    return new;                                             -- editing your own verified rating
  end if;
  if new.course_id is not null then
    if not exists (select 1 from public.enrollments e join public.courses c on c.id = e.course_id
                    where e.course_id = new.course_id and e.user_id = new.learner_id and e.status in ('active','completed') and c.tutor_id = new.tutor_id) then
      raise exception 'only learners enrolled in this course can rate it' using errcode = '42501'; end if;
  elsif new.session_id is not null then
    if not exists (select 1 from public.session_bookings b join public.tutor_sessions s on s.id = b.session_id
                    where b.session_id = new.session_id and b.learner_id = new.learner_id and b.status in ('attended','confirmed')
                      and s.starts_at < now() and s.tutor_id = new.tutor_id) then
      raise exception 'only learners who attended this session can rate it' using errcode = '42501'; end if;
  elsif not app.is_student_of(new.tutor_id, new.learner_id) then
    raise exception 'only this tutor''s learners can rate them' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tutor_reviews_verified before insert or update on public.tutor_reviews for each row execute function app.guard_verified_review();

create or replace function app.guard_verified_mkt_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_privileged() and app.requesting_user_id() is null then return new; end if;
  if not exists (select 1 from public.mkt_orders o join public.mkt_order_items i on i.order_id = o.id
                  where o.id = new.order_id and o.buyer_id = new.user_id and i.product_id = new.product_id
                    and o.status in ('delivered','completed')) then
    raise exception 'only buyers with a delivered order can rate this product' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger mkt_reviews_verified before insert or update on public.mkt_reviews for each row execute function app.guard_verified_mkt_review();

-- Books, resources and external courses: "used" = opened through 101 while signed in (recorded server-side by /go),
-- at least 10 minutes before rating. One rating per user per item; never deleted for being negative (FTC 16 CFR 465
-- anti-suppression); admins may hide abusive ones (hidden_at) and every hide is audited.
create table public.item_usage (
  user_id      text not null references public.profiles(id) on delete cascade,
  item_kind    text not null check (item_kind in ('resource','book','external_course','ai_tool')),
  item_id      text not null check (char_length(item_id) between 1 and 120),
  first_used_at timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  uses         integer not null default 1,
  primary key (user_id, item_kind, item_id)
);
alter table public.item_usage enable row level security;
create policy item_usage_own on public.item_usage for select to authenticated using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
revoke insert, update, delete on public.item_usage from anon, authenticated;
grant select on public.item_usage to authenticated;

create or replace function public.record_item_use(p_kind text, p_item text)
returns void language sql security definer set search_path = '' as $$
  insert into public.item_usage (user_id, item_kind, item_id) select app.requesting_user_id(), p_kind, p_item where app.requesting_user_id() is not null
  on conflict (user_id, item_kind, item_id) do update set last_used_at = now(), uses = public.item_usage.uses + 1
$$;

create table public.item_ratings (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.profiles(id) on delete cascade,
  item_kind   text not null check (item_kind in ('resource','book','external_course','ai_tool')),
  item_id     text not null,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (char_length(body) <= 3000),
  hidden_at   timestamptz,
  hidden_by   text references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, item_kind, item_id)
);
create index item_ratings_item_idx on public.item_ratings (item_kind, item_id) where hidden_at is null;
create trigger item_ratings_updated_at before update on public.item_ratings for each row execute function app.set_updated_at();
alter table public.item_ratings enable row level security;
create policy item_ratings_read on public.item_ratings for select to anon, authenticated using (hidden_at is null or user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy item_ratings_insert on public.item_ratings for insert to authenticated with check (
  user_id = (select app.requesting_user_id()) and (select app.is_member()) and app.r11_has_member_role()
  and exists (select 1 from public.item_usage u where u.user_id = item_ratings.user_id and u.item_kind = item_ratings.item_kind
                and u.item_id = item_ratings.item_id and u.first_used_at < now() - interval '10 minutes'));
create policy item_ratings_update on public.item_ratings for update to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()))
  with check (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
grant select on public.item_ratings to anon, authenticated;
grant insert, update (rating, body, hidden_at, hidden_by) on public.item_ratings to authenticated;

create or replace function app.guard_item_rating()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if not app.is_admin() and (new.hidden_at is distinct from old.hidden_at or new.hidden_by is distinct from old.hidden_by) then
    raise exception 'only admins can hide ratings' using errcode = '42501'; end if;
  if app.is_admin() and new.user_id <> app.requesting_user_id() and (new.rating is distinct from old.rating or new.body is distinct from old.body) then
    raise exception 'admins can hide a rating but never rewrite it' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger item_ratings_guard before update on public.item_ratings for each row execute function app.guard_item_rating();
create trigger item_ratings_audit after update of hidden_at on public.item_ratings for each row execute function app.audit_row();

-- ---------------------------------------------- marketplace: approval + caps ----
-- Every listing goes through admin approval: sellers can submit (pending_review), never self-publish.
create or replace function app.guard_listing_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cap bigint; used bigint; owner text;
begin
  if app.is_privileged() and app.requesting_user_id() is null then return new; end if;
  if app.is_admin() then return new; end if;
  if not app.r11_has_member_role() then raise exception 'guests can buy but not sell: become a learner or tutor' using errcode = '42501'; end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    raise exception 'listings are published by an admin after review: submit it for review' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then
    select s.owner_id into owner from public.mkt_stores s where s.id = new.store_id;
    cap := greatest(coalesce(app.plan_limit('learner', app.user_plan(owner, 'learner'), 'listings.active'), 2147483647),
                    case when app.has_role('tutor') then coalesce(app.plan_limit('tutor', app.user_plan(owner, 'tutor'), 'listings.active'), 2147483647) else 0 end);
    select count(*) into used from public.mkt_products p join public.mkt_stores s on s.id = p.store_id
     where s.owner_id = owner and p.status in ('draft','pending_review','published');
    if used >= cap then raise exception 'your plan allows % listings: upgrade to list more', cap using errcode = 'P0001'; end if;
  end if;
  return new;
end;
$$;
create trigger mkt_products_approval before insert or update of status on public.mkt_products for each row execute function app.guard_listing_approval();

create or replace function app.guard_legacy_listing_approval()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_privileged() and app.requesting_user_id() is null then return new; end if;
  if app.is_admin() then return new; end if;
  if not app.r11_has_member_role() then raise exception 'guests can buy but not sell: become a learner or tutor' using errcode = '42501'; end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    raise exception 'listings go live after admin review' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger marketplace_listings_approval before insert or update of status on public.marketplace_listings for each row execute function app.guard_legacy_listing_approval();

-- ------------------------------------------------- payment providers (data) ----
create table public.payment_providers (
  code          text primary key check (code ~ '^[a-z_]{2,30}$'),
  display_name  text not null,
  methods       text[] not null default '{}' check (methods <@ array['mtn_momo','airtel_money','card','bank','wallet']::text[]),
  status        text not null check (status in ('active','stub','planned')),   -- code readiness (mirrors lib/payments)
  enabled       boolean not null default false,                                 -- root admin switch
  sort          smallint not null default 50,
  notes         text check (char_length(notes) <= 500),
  updated_by    text references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  check (enabled = false or status = 'active')                                  -- stubs/slots can never be switched on
);
create trigger payment_providers_updated_at before update on public.payment_providers for each row execute function app.set_updated_at();
create trigger payment_providers_audit after insert or update or delete on public.payment_providers for each row execute function app.audit_row();
alter table public.payment_providers enable row level security;
create policy payment_providers_read on public.payment_providers for select to anon, authenticated using (true);
revoke insert, update, delete on public.payment_providers from anon, authenticated;
grant select on public.payment_providers to anon, authenticated;

insert into public.payment_providers (code, display_name, methods, status, enabled, sort, notes) values
  ('flutterwave',  'Flutterwave',           '{mtn_momo,airtel_money,card}', 'active',  true,  10, 'Default. MTN + Airtel Mobile Money Uganda and Visa/Mastercard. Sandbox keys only in this build.'),
  ('pesapal',      'Pesapal',               '{mtn_momo,airtel_money,card}', 'stub',    false, 20, 'API 3.0, demo host cybqa.pesapal.com. Needs demo credentials + RegisterIPN.'),
  ('dpo',          'DPO Pay',               '{mtn_momo,airtel_money,card}', 'stub',    false, 30, 'API v6 XML; test and live share one host, the company token decides.'),
  ('mtn_momo',     'MTN MoMo (direct)',     '{mtn_momo}',                   'stub',    false, 40, 'MTN Open API Collections; sandbox.momodeveloper.mtn.com.'),
  ('airtel_money', 'Airtel Money (direct)', '{airtel_money}',               'stub',    false, 50, 'Airtel Africa Open API; UAT openapiuat.airtel.africa.'),
  ('payway',       'Payway',                '{mtn_momo,airtel_money,card,wallet}', 'planned', false, 60, 'Founder to confirm: PayWay Uganda (payway.ug)? Needs merchant API + test credentials.')
on conflict (code) do nothing;

create or replace function public.admin_set_payment_provider(p_code text, p_enabled boolean, p_sort smallint default null)
returns public.payment_providers language plpgsql security definer set search_path = '' as $$
declare r public.payment_providers;
begin
  if not app.has_role('super_admin') then raise exception 'root admin only' using errcode = '42501'; end if;
  update public.payment_providers set enabled = p_enabled, sort = coalesce(p_sort, sort), updated_by = app.requesting_user_id()
   where code = p_code returning * into r;
  if not found then raise exception 'unknown provider' using errcode = 'P0002'; end if;
  return r;
end;
$$;

-- payments: more providers, the method used, the provider's own ids, and the mode
alter table public.payments drop constraint if exists payments_provider_check;
alter table public.payments add constraint payments_provider_check
  check (provider in ('flutterwave','coupon','manual','pesapal','dpo','mtn_momo','airtel_money','payway'));
alter table public.payments
  add column method          text check (method in ('mtn_momo','airtel_money','card','bank','wallet')),
  add column provider_ref    text check (char_length(provider_ref) <= 200),        -- e.g. Pesapal order_tracking_id, DPO TransToken
  add column provider_txn_id text check (char_length(provider_txn_id) <= 200),
  add column mode            text not null default 'sandbox' check (mode in ('sandbox','live'));
create unique index payments_provider_txn_uniq on public.payments (provider, provider_txn_id) where provider_txn_id is not null;

-- ------------------------------------------------ server-priced plan checkout ----
-- SR-17: the price comes ONLY from subscription_plans; the client names a plan, interval and method.
create or replace function public.create_plan_checkout(p_audience text, p_tier public.member_plan, p_interval public.billing_interval, p_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me text := app.requesting_user_id(); pt public.plan_tiers; pl public.subscription_plans; prov text; cur public.member_plan;
  sub uuid := gen_random_uuid(); ref text; p public.payments;
begin
  if me is null or not app.is_member() then raise exception 'active account required' using errcode = '42501'; end if;
  if p_audience not in ('learner','tutor') then raise exception 'unknown audience' using errcode = '22023'; end if;
  if p_audience = 'learner' and not (app.has_role('learner') or app.has_role('tutor')) then
    raise exception 'become a learner first' using errcode = '42501'; end if;
  if p_audience = 'tutor' and not app.has_role('tutor') then raise exception 'tutor plans are for tutors' using errcode = '42501'; end if;
  if p_tier = 'free' then raise exception 'the free plan needs no checkout' using errcode = '22023'; end if;
  if p_method is null or p_method not in ('mtn_momo','airtel_money','card') then raise exception 'unsupported payment method' using errcode = '22023'; end if;
  select * into pt from public.plan_tiers where audience = p_audience and tier = p_tier and is_active;
  if not found then raise exception 'plan not found' using errcode = 'P0002'; end if;
  select * into pl from public.subscription_plans where audience = p_audience and tier = p_tier and interval = p_interval and is_active;
  if not found then raise exception 'no price set for this plan and interval' using errcode = 'P0002'; end if;
  cur := app.user_plan(me, p_audience);
  if cur = p_tier then raise exception 'you are already on this plan' using errcode = '23505'; end if;
  select code into prov from public.payment_providers where enabled and status = 'active' and p_method = any (methods) order by sort limit 1;
  if prov is null then raise exception 'no payment provider is enabled for this method' using errcode = 'P0001'; end if;

  update public.subscriptions set status = 'expired' where user_id = me and status = 'pending' and coalesce(audience, 'learner') = p_audience;
  ref := 'sub-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.subscriptions (id, user_id, plan_id, status, audience) values (sub, me, pl.id, 'pending', p_audience);
  insert into public.payments (user_id, tx_ref, provider, purpose, reference_id, quantity, list_price_ugx, discount_ugx, amount_ugx, method, mode, flw_plan_id)
  values (me, ref, prov, 'subscription', sub, 1, pl.amount_ugx, 0, pl.amount_ugx, p_method,
          'sandbox',                                   -- this build: sandbox only (live needs a new migration + founder sign-off)
          case when prov = 'flutterwave' then pl.flw_payment_plan_id end)
  returning * into p;
  return jsonb_build_object('payment_id', p.id, 'tx_ref', p.tx_ref, 'amount_ugx', p.amount_ugx, 'currency', 'UGX', 'provider', prov,
    'method', p_method, 'mode', p.mode, 'subscription_id', sub, 'audience', p_audience, 'tier', p_tier, 'interval', p_interval,
    'description', '101 ' || pt.name || ' · ' || initcap(p_audience) || ' · ' || p_interval, 'payment_plan', p.flw_plan_id, 'free', false);
end;
$$;

-- Service role only: apply a VERIFIED result from any provider (Flutterwave keeps apply_flutterwave_payment).
create or replace function public.apply_provider_payment(p_provider text, p_tx_ref text, p_provider_txn_id text, p_status text,
                                                         p_amount numeric, p_currency text, p_method text default null, p_raw jsonb default null)
returns public.payments language plpgsql security definer set search_path = '' as $$
declare p public.payments; r public.payments;
begin
  perform app.require_backend();
  select * into p from public.payments where tx_ref = p_tx_ref for update;
  if not found then raise exception 'unknown tx_ref %', p_tx_ref using errcode = 'P0002'; end if;
  if p.provider <> p_provider then raise exception 'provider mismatch' using errcode = '42501'; end if;
  if p.mode <> 'sandbox' then raise exception 'live payments are disabled in this build' using errcode = '42501'; end if;
  update public.payments set provider_txn_id = coalesce(provider_txn_id, left(p_provider_txn_id, 200)) where id = p.id;
  r := app.apply_payment_internal(p_tx_ref, null, p_status, p_amount, p_currency, p_method, p_raw);
  -- apply_payment_internal books cash to platform:cash_flutterwave; move it to this provider's cash account
  if r.status = 'successful' and p_provider <> 'flutterwave' and r.amount_ugx > 0
     and not exists (select 1 from public.ledger_transactions t where t.payment_id = r.id and t.kind = 'adjustment' and t.memo like 'provider cash:%') then
    perform app.post_ledger('adjustment', jsonb_build_array(
      jsonb_build_object('account', app.ledger_account('platform:cash_' || p_provider, 'asset', null, initcap(p_provider) || ' balance'), 'direction', 'debit', 'amount', r.amount_ugx),
      jsonb_build_object('account', app.ledger_account('platform:cash_flutterwave', 'asset', null, 'Flutterwave balance'), 'direction', 'credit', 'amount', r.amount_ugx)),
      r.id, null, null, 'provider cash: ' || p_provider);
  end if;
  return r;
end;
$$;

-- ------------------------------------------------------------------ seed ----
-- SUGGESTED defaults (PLANS.md). Admin edits them via admin_update_plan; nothing in code depends on these numbers.
insert into public.plan_tiers (audience, tier, name, tagline, sort, highlight, limits, features) values
  ('learner','free','Free','Start learning at no cost', 0, false,
   '{"courses.active":1,"lessons.free_per_course":3,"ai.daily":10,"projects.active":2,"listings.active":3,"seller.fee_pct":15,"certificates":false,"offline":false,"sessions.discount_pct":0,"sessions.included_monthly":0}',
   '["1 active 101 course (first 3 lessons + previews)","Every external course, free","Buy and sell on the marketplace","10 AI messages a day"]'),
  ('learner','standard','Standard','Unlock every lesson', 1, true,
   '{"courses.active":3,"lessons.free_per_course":null,"ai.daily":50,"projects.active":5,"listings.active":10,"seller.fee_pct":12,"certificates":true,"offline":false,"sessions.discount_pct":0,"sessions.included_monthly":0}',
   '["3 active 101 courses, every lesson","Certificates","No ads","50 AI messages a day"]'),
  ('learner','plus','Plus','Learn more, faster', 2, false,
   '{"courses.active":10,"lessons.free_per_course":null,"ai.daily":200,"projects.active":20,"listings.active":25,"seller.fee_pct":10,"certificates":true,"offline":true,"sessions.discount_pct":10,"sessions.included_monthly":0}',
   '["10 active courses","Offline downloads","10% off 1:1 sessions","200 AI messages a day"]'),
  ('learner','pro','Pro','Everything, plus a mentor', 3, false,
   '{"courses.active":null,"lessons.free_per_course":null,"ai.daily":1000,"projects.active":null,"listings.active":100,"seller.fee_pct":8,"certificates":true,"offline":true,"sessions.discount_pct":15,"sessions.included_monthly":1}',
   '["Unlimited courses","1 mentor session a month","15% off more sessions","Career review"]'),
  ('tutor','free','Free','Teach your first students', 0, false,
   '{"students.max":2,"courses.published":1,"sessions.per_month":4,"commission.pct":30,"price.max_ugx":50000,"listings.active":3,"seller.fee_pct":15,"coupons":false,"featured.monthly":0,"payout.min_ugx":50000,"courses.active":1,"lessons.free_per_course":3}',
   '["Up to 2 students","1 published course","30% commission"]'),
  ('tutor','standard','Standard','Grow a class', 1, true,
   '{"students.max":25,"courses.published":3,"sessions.per_month":20,"commission.pct":20,"price.max_ugx":150000,"listings.active":10,"seller.fee_pct":12,"coupons":true,"featured.monthly":0,"payout.min_ugx":20000,"courses.active":3,"lessons.free_per_course":null}',
   '["Up to 25 students","3 published courses","20% commission","Coupons"]'),
  ('tutor','plus','Plus','Run a school', 2, false,
   '{"students.max":150,"courses.published":10,"sessions.per_month":60,"commission.pct":15,"price.max_ugx":300000,"listings.active":25,"seller.fee_pct":10,"coupons":true,"featured.monthly":1,"payout.min_ugx":10000,"courses.active":10,"lessons.free_per_course":null}',
   '["Up to 150 students","10 courses","15% commission","1 featured slot a month"]'),
  ('tutor','pro','Pro','No limits', 3, false,
   '{"students.max":null,"courses.published":null,"sessions.per_month":null,"commission.pct":10,"price.max_ugx":500000,"listings.active":100,"seller.fee_pct":8,"coupons":true,"featured.monthly":3,"payout.min_ugx":10000,"courses.active":null,"lessons.free_per_course":null}',
   '["Unlimited students and courses","10% commission","3 featured slots a month","Analytics export"]')
on conflict (audience, tier) do nothing;

insert into public.subscription_plans (code, name, description, interval, amount_ugx, audience, tier, grants_plan, features) values
  ('learner-standard-monthly', '101 Standard (Learner)', 'Suggested price, founder to confirm', 'monthly', 15000,  'learner', 'standard', 'standard', '{}'),
  ('learner-standard-yearly',  '101 Standard (Learner)', 'Suggested price, founder to confirm', 'yearly',  150000, 'learner', 'standard', 'standard', '{}'),
  ('learner-plus-monthly',     '101 Plus (Learner)',     'Suggested price, founder to confirm', 'monthly', 35000,  'learner', 'plus', 'plus', '{}'),
  ('learner-plus-yearly',      '101 Plus (Learner)',     'Suggested price, founder to confirm', 'yearly',  350000, 'learner', 'plus', 'plus', '{}'),
  ('learner-pro-monthly',      '101 Pro (Learner)',      'Suggested price, founder to confirm', 'monthly', 75000,  'learner', 'pro', 'pro', '{}'),
  ('learner-pro-yearly',       '101 Pro (Learner)',      'Suggested price, founder to confirm', 'yearly',  750000, 'learner', 'pro', 'pro', '{}'),
  ('tutor-standard-monthly',   '101 Standard (Tutor)',   'Suggested price, founder to confirm', 'monthly', 25000,  'tutor', 'standard', 'standard', '{}'),
  ('tutor-standard-yearly',    '101 Standard (Tutor)',   'Suggested price, founder to confirm', 'yearly',  250000, 'tutor', 'standard', 'standard', '{}'),
  ('tutor-plus-monthly',       '101 Plus (Tutor)',       'Suggested price, founder to confirm', 'monthly', 60000,  'tutor', 'plus', 'plus', '{}'),
  ('tutor-plus-yearly',        '101 Plus (Tutor)',       'Suggested price, founder to confirm', 'yearly',  600000, 'tutor', 'plus', 'plus', '{}'),
  ('tutor-pro-monthly',        '101 Pro (Tutor)',        'Suggested price, founder to confirm', 'monthly', 120000, 'tutor', 'pro', 'pro', '{}'),
  ('tutor-pro-yearly',         '101 Pro (Tutor)',        'Suggested price, founder to confirm', 'yearly',  1200000,'tutor', 'pro', 'pro', '{}')
on conflict (code) do nothing;

-- RLS on the catalogue: public read, writes only through admin_update_plan
alter table public.plan_tiers enable row level security;
create policy plan_tiers_read on public.plan_tiers for select to anon, authenticated using (is_active or (select app.is_admin()));
revoke insert, update, delete on public.plan_tiers from anon, authenticated;
grant select on public.plan_tiers to anon, authenticated;

-- ---------------------------------------------------------------- grants ----
revoke all on function app.plan_rank(public.member_plan), app.r11_has_member_role(text), app.user_plan(text, text), app.learning_tier(text),
  app.plan_limit(text, public.member_plan, text), app.lesson_min_plan(uuid), app.can_view_lesson(uuid), app.tutor_student_count(text, text),
  app.is_student_of(text, text) from public;
grant execute on function app.plan_rank(public.member_plan), app.r11_has_member_role(text), app.user_plan(text, text), app.learning_tier(text),
  app.plan_limit(text, public.member_plan, text), app.lesson_min_plan(uuid), app.can_view_lesson(uuid), app.tutor_student_count(text, text),
  app.is_student_of(text, text) to anon, authenticated;

-- SR-04: neither is added to anon's public RPC allow-list. Visitors get the catalogue through GET /api/v1/plans
-- (served with the service client); the syllabus is for signed-in users only (visitors cannot open courses).
revoke all on function public.course_syllabus(uuid), public.plans_catalogue(), app.plans_json(text) from public, anon;
grant execute on function app.plans_json(text), public.course_syllabus(uuid), public.plans_catalogue() to authenticated;

revoke all on function public.can_enroll(uuid), public.my_entitlements(), public.create_plan_checkout(text, public.member_plan, public.billing_interval, text),
  public.request_course_price(uuid, bigint, boolean, text), public.decide_course_price(uuid, boolean, text),
  public.admin_set_course_pricing(uuid, boolean, bigint, boolean),
  public.admin_update_plan(text, public.member_plan, text, text, jsonb, jsonb, bigint, bigint, boolean),
  public.admin_set_payment_provider(text, boolean, smallint), public.record_item_use(text, text) from public, anon;
grant execute on function public.can_enroll(uuid), public.my_entitlements(), public.create_plan_checkout(text, public.member_plan, public.billing_interval, text),
  public.request_course_price(uuid, bigint, boolean, text), public.decide_course_price(uuid, boolean, text),
  public.admin_set_course_pricing(uuid, boolean, bigint, boolean),
  public.admin_update_plan(text, public.member_plan, text, text, jsonb, jsonb, bigint, bigint, boolean),
  public.admin_set_payment_provider(text, boolean, smallint), public.record_item_use(text, text) to authenticated;

revoke all on function public.apply_provider_payment(text, text, text, text, numeric, text, text, jsonb) from public, anon, authenticated;

revoke all on function app.guard_tutor_plan(), app.subscription_supersede(), app.guard_enrollment_plan(), app.guard_payment_buyer(),
  app.guard_course_pricing(), app.guard_verified_review(), app.guard_verified_mkt_review(), app.guard_item_rating(),
  app.guard_listing_approval(), app.guard_legacy_listing_approval() from public, anon, authenticated;
