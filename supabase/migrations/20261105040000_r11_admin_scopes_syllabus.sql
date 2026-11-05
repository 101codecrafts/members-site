-- Round 11 finish (integrate): two defects found in the merged branches.
--
-- A. DB-level admin SCOPE checks on the plans-branch admin RPCs. They only
--    checked app.is_admin(), so a scoped admin (e.g. {audit}) could edit plan
--    prices, make courses free/paid, or decide price requests by calling the RPC
--    directly (PostgREST) or through /api/v1/admin/price-requests/:id, which had
--    no route-level scope check. Now:
--      admin_update_plan        -> scope 'plans'
--      admin_set_course_pricing -> scope 'plans'
--      decide_course_price      -> scope 'approvals' (it is an approval-queue item)
--    app.require_scope comes from 20261105001200_admin_console.sql (root has every
--    scope; legacy admins without a grant row keep every non-root scope).
--
-- B. course_syllabus listed lessons that are not approved yet (a tutor's new,
--    in-review lessons on a live course) as "locked". They are now hidden until
--    an admin approves them, matching lessons_select (approved AND can_view_lesson).
--
-- Bodies are otherwise identical to 20261105001100_plans_access.sql. Grants are
-- unchanged (create or replace keeps them). Apply AFTER 20261105030000.

create or replace function public.decide_course_price(p_request uuid, p_approve boolean, p_note text default null)
returns public.course_price_requests language plpgsql security definer set search_path = '' as $$
declare r public.course_price_requests;
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  perform app.require_scope('approvals');   -- r11 finish: DB-level admin scope (root has every scope)
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

create or replace function public.admin_set_course_pricing(p_course uuid, p_is_free boolean, p_price_ugx bigint default 0, p_all_lessons_free boolean default null)
returns public.courses language plpgsql security definer set search_path = '' as $$
declare c public.courses;
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  perform app.require_scope('plans');   -- r11 finish: DB-level admin scope (root has every scope)
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

create or replace function public.admin_update_plan(p_audience text, p_tier public.member_plan, p_name text default null, p_tagline text default null,
                                                    p_limits jsonb default null, p_features jsonb default null,
                                                    p_monthly_ugx bigint default null, p_yearly_ugx bigint default null, p_confirm_prices boolean default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t public.plan_tiers;
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  perform app.require_scope('plans');   -- r11 finish: DB-level admin scope (root has every scope)
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

create or replace function public.course_syllabus(p_course uuid)
returns table (lesson_id uuid, "position" int, title text, duration_minutes int, is_preview boolean, min_plan public.member_plan, locked boolean)
language sql stable security definer set search_path = '' as $$
  select l.id, l.position, l.title, l.duration_minutes, l.is_preview, app.lesson_min_plan(l.id), not app.can_view_lesson(l.id)
    from public.lessons l join public.courses c on c.id = l.course_id
   where l.course_id = p_course and c.status = 'published' and c.deleted_at is null and app.age_ok(c.age_rating)
     and l.approved                                     -- r11 finish: unapproved (in-review) lessons are hidden, not shown locked
   order by l.position
$$;
