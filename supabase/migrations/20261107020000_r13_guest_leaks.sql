-- Round 13 guest-leaks: guests (signed in, role 'guest' only) and visitors (anon) must not READ member-only data.
-- NOT APPLIED to staging: the founder applies it (after 20261106030000_r12_event_review.sql). Idempotent.
--
-- Why: a guest account is account_status = 'active', so app.is_member() is TRUE for it. Every SELECT policy that
-- grants "any member" therefore also granted guests: other members' private profiles INCLUDING MINORS' profiles,
-- community posts / reactions / post images, private study-group rosters, live tutor sessions, member badges and
-- stats (leaderboards), the list of who is a tutor/admin, competition teams and judges, member-audience
-- announcements, and launch-promo lessons/media (paid tutor courses for free). Product rule (founder, round 11):
-- guests browse, take free external courses and buy only.
--
-- Fix: app.is_member_role() = an active account that holds a learner/tutor/admin/super_admin role. The policies
-- below are rewritten in place (ALTER POLICY ... USING) by swapping app.is_member() for app.is_member_role() in
-- their current USING expression, so nothing else in them changes. Write paths (guests may still buy) keep
-- app.is_member(); the r11/r12 guest write guards are untouched.
--
-- Part 2: column privileges for anon (visitors). Verified tutors, verified stores and public profiles are readable
-- by anon on purpose, but some of their columns are internal: payout routing (tutor_profiles.flw_subaccount_id,
-- default_payout_method_id, commission_pct_override), KYC notes and commission on stores, moderation state on
-- profiles (status_reason, suspended_until), activity and marketing state (last_seen_at, email_opt_in), reviewer
-- notes on courses/articles and admin ids on settings rows. anon loses SELECT on exactly those columns; every other
-- column keeps its grant. authenticated is unchanged (owners and admins read these through RLS).
-- The backend never selects these columns through the anon client (checked: services/*, app/api/*, repositories/*).

create or replace function app.is_member_role()
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_member() and exists (
    select 1 from public.user_roles ur
     where ur.user_id = app.requesting_user_id() and ur.role::text in ('learner','tutor','admin','super_admin'))
$$;
revoke all on function app.is_member_role() from public;
grant execute on function app.is_member_role() to anon, authenticated;   -- anon-readable tables (profiles, announcements) evaluate it; it is false for anon

do $$
declare
  t record; cur text; nxt text; n int := 0;
  targets text[][] := array[
    array['public','profiles','profiles_select'],
    array['public','posts','posts_select'],
    array['public','reactions','reactions_select'],
    array['public','study_groups','groups_select'],
    array['public','study_group_members','group_members_select'],
    array['public','tutor_sessions','sessions_select'],
    array['public','user_badges','user_badges_select'],
    array['public','user_stats','user_stats_select'],
    array['public','user_roles','user_roles_select'],
    array['public','competition_teams','comp_teams_select'],
    array['public','competition_judges','comp_judges_select'],
    array['public','launch_upvotes','launch_upvotes_select'],
    array['public','test_campaigns','campaigns_select'],
    array['public','lessons','lessons_select_promo'],
    array['public','course_media','course_media_select_promo'],
    array['public','announcements','announcements_select'],
    array['storage','objects','post-images read']];
begin
  for i in 1 .. array_length(targets, 1) loop
    select pg_get_expr(p.polqual, p.polrelid) into cur
      from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = targets[i][1] and c.relname = targets[i][2] and p.polname = targets[i][3];
    continue when cur is null;                                  -- table/policy absent in this database: skip
    nxt := replace(cur, 'app.is_member()', 'app.is_member_role()');
    continue when nxt = cur;                                     -- already rewritten (idempotent)
    execute format('alter policy %I on %I.%I using (%s)', targets[i][3], targets[i][1], targets[i][2], nxt);
    n := n + 1;
  end loop;
  raise notice 'r13_guest_leaks: % policies now require a learner/tutor/admin role', n;
end $$;

-- Part 2: anon column revokes -------------------------------------------------------------------
do $$
declare
  r record; keep text; hide text[];
  spec jsonb := '{
    "tutor_profiles":   ["flw_subaccount_id","default_payout_method_id","commission_pct_override"],
    "mkt_stores":       ["kyc_note","commission_pct"],
    "profiles":         ["status_reason","suspended_until","last_seen_at","email_opt_in"],
    "payment_providers":["notes","updated_by"],
    "feature_flags":    ["updated_by"],
    "site_settings":    ["updated_by"],
    "courses":          ["review_note","reviewed_by","requested_price_ugx","price_reviewed_at"],
    "articles":         ["reviewer_id","review_note"]
  }';
begin
  for r in select key as tbl, value as cols from jsonb_each(spec) loop
    continue when to_regclass('public.' || r.tbl) is null;
    continue when not has_table_privilege('anon', ('public.' || r.tbl)::regclass, 'SELECT')
              and not exists (select 1 from information_schema.column_privileges
                               where table_schema = 'public' and table_name = r.tbl and grantee = 'anon' and privilege_type = 'SELECT');
    hide := array(select jsonb_array_elements_text(r.cols));
    select string_agg(format('%I', column_name), ', ' order by ordinal_position) into keep
      from information_schema.columns
     where table_schema = 'public' and table_name = r.tbl and column_name <> all (hide);
    execute format('revoke select on public.%I from anon', r.tbl);
    execute format('grant select (%s) on public.%I to anon', keep, r.tbl);
  end loop;
end $$;
