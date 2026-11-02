-- =============================================================================
-- Admin analytics: materialized views in the private `analytics` schema
-- (no API access; read only through admin-checked RPCs), refreshed by cron.
-- =============================================================================

create materialized view analytics.daily_kpis as
with days as (select generate_series(((now() at time zone 'Africa/Kampala')::date - 365), (now() at time zone 'Africa/Kampala')::date, '1 day')::date as day)
select d.day,
  (select count(*) from public.user_activity_daily a where a.day = d.day)                                                   as dau,
  (select count(distinct a.user_id) from public.user_activity_daily a where a.day between d.day - 6 and d.day)              as wau,
  (select count(distinct a.user_id) from public.user_activity_daily a where a.day between d.day - 29 and d.day)             as mau,
  (select count(*) from public.profiles p where (p.created_at at time zone 'Africa/Kampala')::date = d.day)                 as signups,
  (select count(*) from public.enrollments e where (e.enrolled_at at time zone 'Africa/Kampala')::date = d.day)             as enrollments,
  (select count(*) from public.enrollments e where (e.completed_at at time zone 'Africa/Kampala')::date = d.day)            as completions,
  (select coalesce(sum(p.amount_ugx), 0) from public.payments p where p.status in ('successful','partially_refunded','refunded')
      and (p.verified_at at time zone 'Africa/Kampala')::date = d.day)                                                     as gross_ugx,
  (select coalesce(sum(p.platform_fee_ugx) + sum(case when p.payee_id is null then p.amount_ugx else 0 end), 0) from public.payments p
    where p.status in ('successful','partially_refunded','refunded') and (p.verified_at at time zone 'Africa/Kampala')::date = d.day) as platform_revenue_ugx,
  (select coalesce(sum(r.amount_ugx), 0) from public.refunds r where r.status = 'completed' and (r.completed_at at time zone 'Africa/Kampala')::date = d.day) as refunds_ugx,
  (select coalesce(sum(po.amount_ugx), 0) from public.payouts po where po.status = 'paid' and (po.processed_at at time zone 'Africa/Kampala')::date = d.day) as payouts_ugx
from days d;
create unique index daily_kpis_day on analytics.daily_kpis (day);

create materialized view analytics.revenue_by_product_month as
select date_trunc('month', p.verified_at at time zone 'Africa/Kampala')::date as month, p.purpose,
       count(*) as transactions, sum(p.amount_ugx) as gross_ugx, sum(p.platform_fee_ugx) as commission_ugx,
       sum(p.payee_share_ugx) as payee_share_ugx, sum(p.refunded_ugx) as refunded_ugx, sum(p.discount_ugx) as discounts_ugx
  from public.payments p where p.status in ('successful','partially_refunded','refunded')
 group by 1, 2;
create unique index revenue_by_product_month_key on analytics.revenue_by_product_month (month, purpose);

create materialized view analytics.revenue_by_tutor_month as
select date_trunc('month', p.verified_at at time zone 'Africa/Kampala')::date as month, p.payee_id as tutor_id,
       count(*) as transactions, sum(p.amount_ugx) as gross_ugx, sum(p.platform_fee_ugx) as commission_ugx,
       sum(p.payee_share_ugx) as tutor_share_ugx, sum(p.refunded_ugx) as refunded_ugx
  from public.payments p where p.status in ('successful','partially_refunded','refunded') and p.payee_id is not null
 group by 1, 2;
create unique index revenue_by_tutor_month_key on analytics.revenue_by_tutor_month (month, tutor_id);

create materialized view analytics.course_performance as
select c.id as course_id, c.title, c.tutor_id, c.levels, c.status,
       count(e.*) filter (where e.status in ('active','completed','refunded')) as enrollments,
       count(e.*) filter (where e.status = 'completed') as completions,
       round(100.0 * count(e.*) filter (where e.status = 'completed') / nullif(count(e.*) filter (where e.status in ('active','completed')), 0), 1) as completion_rate_pct,
       round(avg(e.progress_pct), 1) as avg_progress_pct, c.rating_avg, c.rating_count,
       (select coalesce(sum(p.amount_ugx - p.refunded_ugx), 0) from public.payments p where p.purpose = 'course' and p.reference_id = c.id
          and p.status in ('successful','partially_refunded')) as net_revenue_ugx
  from public.courses c left join public.enrollments e on e.course_id = c.id
 where c.deleted_at is null
 group by c.id;
create unique index course_performance_key on analytics.course_performance (course_id);

create materialized view analytics.tutor_performance as
select t.user_id as tutor_id, p.display_name, t.rating_avg, t.rating_count, t.learners_count, t.levels_taught,
       (select count(*) from public.courses c where c.tutor_id = t.user_id and c.status = 'published') as courses_published,
       (select count(*) from public.session_bookings b join public.tutor_sessions s on s.id = b.session_id where s.tutor_id = t.user_id and b.status in ('confirmed','attended')) as sessions_booked,
       (select coalesce(sum(payee_share_ugx), 0) from public.payments where payee_id = t.user_id and status in ('successful','partially_refunded')) as earnings_ugx
  from public.tutor_profiles t join public.profiles p on p.id = t.user_id
 where t.verification_status = 'verified';
create unique index tutor_performance_key on analytics.tutor_performance (tutor_id);

create materialized view analytics.event_attendance as
select e.id as event_id, e.title, e.starts_at, e.capacity, e.price_ugx,
       count(r.*) filter (where r.status in ('registered','attended')) as registered,
       count(r.*) filter (where r.status = 'attended') as attended,
       count(r.*) filter (where r.status = 'waitlisted') as waitlisted,
       round(100.0 * count(r.*) filter (where r.status = 'attended') / nullif(count(r.*) filter (where r.status in ('registered','attended')), 0), 1) as show_rate_pct
  from public.events e left join public.event_registrations r on r.event_id = e.id
 where e.deleted_at is null group by e.id;
create unique index event_attendance_key on analytics.event_attendance (event_id);

create materialized view analytics.subscription_churn as
with months as (select generate_series(date_trunc('month', now() - interval '12 months'), date_trunc('month', now()), '1 month')::date as month)
select m.month,
  (select count(*) from public.subscriptions s where s.started_at < m.month and coalesce(s.cancelled_at, 'infinity') >= m.month and s.status <> 'pending') as active_start,
  (select count(*) from public.subscriptions s where date_trunc('month', s.started_at)::date = m.month) as new_subs,
  (select count(*) from public.subscriptions s where s.status in ('cancelled','expired') and date_trunc('month', coalesce(s.cancelled_at, s.current_period_end))::date = m.month) as churned
from months m;
create unique index subscription_churn_key on analytics.subscription_churn (month);

create materialized view analytics.level_breakdown as
select coalesce(p.education_level::text, 'unknown') as level,
       count(*) filter (where p.account_status = 'active') as active_members,
       count(*) filter (where p.is_minor) as minors,
       count(*) filter (where exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'learner')) as learners,
       count(*) filter (where exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'tutor')) as tutors,
       (select count(*) from public.enrollments e join public.profiles pp on pp.id = e.user_id where pp.education_level is not distinct from p.education_level) as enrollments
  from public.profiles p where p.deleted_at is null group by p.education_level;
create unique index level_breakdown_key on analytics.level_breakdown (level);

create or replace function public.refresh_analytics()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  refresh materialized view concurrently analytics.daily_kpis;
  refresh materialized view concurrently analytics.revenue_by_product_month;
  refresh materialized view concurrently analytics.revenue_by_tutor_month;
  refresh materialized view concurrently analytics.course_performance;
  refresh materialized view concurrently analytics.tutor_performance;
  refresh materialized view concurrently analytics.event_attendance;
  refresh materialized view concurrently analytics.subscription_churn;
  refresh materialized view concurrently analytics.level_breakdown;
end;
$$;

-- Live headline numbers for the admin dashboard.
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'Africa/Kampala')::date;
begin
  perform app.require_admin();
  return jsonb_build_object(
    'members_total', (select count(*) from public.profiles where account_status = 'active' and deleted_at is null),
    'members_pending', (select count(*) from public.profiles where account_status = 'pending' and deleted_at is null),
    'learners', (select count(*) from public.user_roles where role = 'learner'),
    'tutors', (select count(*) from public.user_roles where role = 'tutor'),
    'minors', (select count(*) from public.profiles where is_minor and deleted_at is null),
    'dau', (select count(*) from public.user_activity_daily where day = today),
    'wau', (select count(distinct user_id) from public.user_activity_daily where day > today - 7),
    'mau', (select count(distinct user_id) from public.user_activity_daily where day > today - 30),
    'signups_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'applications_pending', (select count(*) from public.membership_applications where status = 'pending'),
    'tutor_applications_pending', (select count(*) from public.tutor_applications where status = 'pending'),
    'courses_pending_review', (select count(*) from public.courses where status = 'pending_review'),
    'launches_pending_review', (select count(*) from public.launch_products where status = 'pending_review'),
    'jobs_pending', (select count(*) from public.jobs where status = 'pending'),
    'flags_open', (select count(*) from public.moderation_flags where status in ('open','reviewing')),
    'safeguarding_open', (select count(*) from public.safeguarding_reports where status in ('open','investigating','escalated')),
    'payouts_requested', (select count(*) from public.payouts where status in ('requested','held')),
    'payouts_requested_ugx', (select coalesce(sum(amount_ugx), 0) from public.payouts where status in ('requested','held','approved')),
    'refunds_requested', (select count(*) from public.refunds where status = 'requested'),
    'gross_ugx_30d', (select coalesce(sum(amount_ugx), 0) from public.payments where status in ('successful','partially_refunded','refunded') and verified_at > now() - interval '30 days'),
    'commission_ugx_30d', (select coalesce(sum(platform_fee_ugx), 0) from public.payments where status in ('successful','partially_refunded','refunded') and verified_at > now() - interval '30 days'),
    'active_subscriptions', (select count(*) from public.subscriptions where status = 'active'),
    'data_requests_open', (select count(*) from public.data_requests where status in ('received','processing')),
    'generated_at', now());
end;
$$;

-- One RPC for every chart/table. Ranges are clamped; metrics whitelisted.
create or replace function public.admin_analytics(p_metric text, p_from date default null, p_to date default null, p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare f date := coalesce(p_from, (now() at time zone 'Africa/Kampala')::date - 30);
        t date := coalesce(p_to, (now() at time zone 'Africa/Kampala')::date);
        lim int := least(greatest(coalesce(p_limit, 20), 1), 200);
        res jsonb;
begin
  perform app.require_admin();
  if t - f > 731 then raise exception 'range too large (max 2 years)' using errcode = '22023'; end if;
  case p_metric
    when 'daily_kpis' then select coalesce(jsonb_agg(to_jsonb(k) order by k.day), '[]') into res from analytics.daily_kpis k where k.day between f and t;
    when 'revenue_by_product' then select coalesce(jsonb_agg(to_jsonb(r) order by r.month, r.purpose), '[]') into res from analytics.revenue_by_product_month r where r.month between date_trunc('month', f)::date and t;
    when 'revenue_by_tutor' then
      select coalesce(jsonb_agg(x), '[]') into res from (
        select r.tutor_id, p.display_name, sum(r.gross_ugx) gross_ugx, sum(r.commission_ugx) commission_ugx, sum(r.tutor_share_ugx) tutor_share_ugx, sum(r.refunded_ugx) refunded_ugx
          from analytics.revenue_by_tutor_month r left join public.profiles p on p.id = r.tutor_id
         where r.month between date_trunc('month', f)::date and t group by r.tutor_id, p.display_name order by 3 desc limit lim) x;
    when 'top_courses' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into res from (select * from analytics.course_performance order by enrollments desc limit lim) c;
    when 'top_tutors' then select coalesce(jsonb_agg(to_jsonb(c)), '[]') into res from (select * from analytics.tutor_performance order by earnings_ugx desc, rating_avg desc limit lim) c;
    when 'event_attendance' then select coalesce(jsonb_agg(to_jsonb(e) order by e.starts_at desc), '[]') into res from analytics.event_attendance e where e.starts_at::date between f and t;
    when 'subscription_churn' then select coalesce(jsonb_agg(jsonb_build_object('month', s.month, 'active_start', s.active_start, 'new', s.new_subs, 'churned', s.churned,
                                         'churn_rate_pct', round(100.0 * s.churned / nullif(s.active_start, 0), 1)) order by s.month), '[]') into res from analytics.subscription_churn s;
    when 'levels' then select coalesce(jsonb_agg(to_jsonb(l)), '[]') into res from analytics.level_breakdown l;
    when 'funnel' then
      select jsonb_build_object(
        'visitors', (select count(distinct coalesce(user_id, anonymous_id)) from public.analytics_events where event_name = 'page_view' and occurred_at::date between f and t),
        'signups', (select count(*) from public.profiles where created_at::date between f and t),
        'enrolled', (select count(distinct e.user_id) from public.enrollments e join public.profiles p on p.id = e.user_id where p.created_at::date between f and t),
        'paid', (select count(distinct pa.user_id) from public.payments pa join public.profiles p on p.id = pa.user_id
                  where p.created_at::date between f and t and pa.status in ('successful','partially_refunded','refunded') and pa.amount_ugx > 0)) into res;
    when 'top_launches' then select coalesce(jsonb_agg(to_jsonb(x)), '[]') into res from (
        select id, name, upvotes_count, views_count, clicks_count, followers_count from public.launch_products where status = 'published' order by upvotes_count desc limit lim) x;
    when 'events_by_name' then select coalesce(jsonb_agg(x), '[]') into res from (
        select event_name, count(*) n, count(distinct coalesce(user_id, anonymous_id)) uniques from public.analytics_events
         where occurred_at::date between f and t group by event_name order by n desc limit lim) x;
    else raise exception 'unknown metric' using errcode = '22023';
  end case;
  return res;
end;
$$;

-- Tutor-scoped analytics: only the caller's own courses and earnings.
create or replace function public.tutor_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me text := app.requesting_user_id();
begin
  if not app.is_tutor() then raise exception 'verified tutors only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'wallet', public.my_wallet(),
    'courses', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'status', c.status, 'enrollments', c.enrollments_count,
                 'completions', (select count(*) from public.enrollments e where e.course_id = c.id and e.status = 'completed'),
                 'avg_progress', (select round(avg(progress_pct), 1) from public.enrollments e where e.course_id = c.id),
                 'rating', c.rating_avg)), '[]') from public.courses c where c.tutor_id = me and c.deleted_at is null),
    'earnings_by_month', (select coalesce(jsonb_agg(x order by x.month), '[]') from (
        select date_trunc('month', verified_at)::date as month, sum(payee_share_ugx) as earnings_ugx, count(*) as sales
          from public.payments where payee_id = me and status in ('successful','partially_refunded') group by 1) x),
    'upcoming_sessions', (select coalesce(jsonb_agg(to_jsonb(s) order by s.starts_at), '[]') from public.tutor_sessions s where s.tutor_id = me and s.starts_at > now()),
    'rating', (select jsonb_build_object('avg', rating_avg, 'count', rating_count) from public.tutor_profiles where user_id = me));
end;
$$;

select app.enable_rls_all();
