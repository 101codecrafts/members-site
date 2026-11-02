-- =============================================================================
-- Row Level Security policies + explicit grants (least privilege).
-- RLS is already ENABLED on every table by the migration that created it
-- (SR-01); without a policy a table is deny-all. Conventions:
--   ME     = (select app.requesting_user_id())     Clerk user id
--   ADMIN  = (select app.is_admin())               admin or super_admin (active)
--   MEMBER = (select app.is_member())             any ACTIVE account
-- (select ...) wrappers let Postgres evaluate helpers once per statement.
-- service_role bypasses RLS: it is used only by server-only modules
-- (webhooks, cron, unfurler) and never shipped to clients.
-- =============================================================================

-- ======================================================= identity & RBAC ====
create policy profiles_select on public.profiles for select to anon, authenticated using (
  (deleted_at is null and account_status = 'active' and not is_minor and (is_public or (select app.is_member())))
  or (deleted_at is null and account_status = 'active' and is_minor and (select app.is_member()))   -- minors: members only, never anon
  or id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select app.requesting_user_id()) or (select app.is_admin()))
  with check (id = (select app.requesting_user_id()) or (select app.is_admin()));

create policy profile_private_select on public.profile_private for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy profile_private_update on public.profile_private for update to authenticated
  using (user_id = (select app.requesting_user_id())) with check (user_id = (select app.requesting_user_id()));

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()) or (role <> 'learner' and (select app.is_member())));

create policy membership_apps_select on public.membership_applications for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy membership_apps_insert on public.membership_applications for insert to authenticated
  with check (user_id = (select app.requesting_user_id()));
create policy membership_apps_withdraw on public.membership_applications for update to authenticated
  using (user_id = (select app.requesting_user_id()) and status = 'pending') with check (user_id = (select app.requesting_user_id()));

create policy tutor_apps_select on public.tutor_applications for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy tutor_apps_insert on public.tutor_applications for insert to authenticated
  with check (user_id = (select app.requesting_user_id()) and (select app.is_member()));
create policy tutor_apps_withdraw on public.tutor_applications for update to authenticated
  using (user_id = (select app.requesting_user_id()) and status = 'pending') with check (user_id = (select app.requesting_user_id()));

create policy tutor_profiles_select on public.tutor_profiles for select to anon, authenticated
  using (verification_status = 'verified' or user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy tutor_profiles_update on public.tutor_profiles for update to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()))
  with check (user_id = (select app.requesting_user_id()) or (select app.is_admin()));

-- payout destinations: owner reads masked columns; writes happen server-side (encrypted).
create policy payout_methods_select on public.payout_methods for select to authenticated
  using (tutor_id = (select app.requesting_user_id()) or (select app.is_admin()));

create policy guardian_consents_select on public.guardian_consents for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy guardian_consents_insert on public.guardian_consents for insert to authenticated
  with check (user_id = (select app.requesting_user_id()));

create policy user_blocks_select on public.user_blocks for select to authenticated
  using (blocker_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy user_blocks_insert on public.user_blocks for insert to authenticated
  with check (blocker_id = (select app.requesting_user_id()));
create policy user_blocks_delete on public.user_blocks for delete to authenticated
  using (blocker_id = (select app.requesting_user_id()));

create policy safeguarding_select on public.safeguarding_reports for select to authenticated
  using (reporter_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy safeguarding_insert on public.safeguarding_reports for insert to authenticated
  with check (reporter_id = (select app.requesting_user_id()));
create policy safeguarding_admin_update on public.safeguarding_reports for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy onboarding_select on public.onboarding_state for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy onboarding_insert on public.onboarding_state for insert to authenticated
  with check (user_id = (select app.requesting_user_id()));
create policy onboarding_update on public.onboarding_state for update to authenticated
  using (user_id = (select app.requesting_user_id())) with check (user_id = (select app.requesting_user_id()));

create policy notif_prefs_select on public.notification_preferences for select to authenticated using (user_id = (select app.requesting_user_id()));
create policy notif_prefs_insert on public.notification_preferences for insert to authenticated with check (user_id = (select app.requesting_user_id()));
create policy notif_prefs_update on public.notification_preferences for update to authenticated
  using (user_id = (select app.requesting_user_id())) with check (user_id = (select app.requesting_user_id()));

create policy consent_select on public.consent_records for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy consent_insert on public.consent_records for insert to authenticated
  with check (user_id = (select app.requesting_user_id()));

create policy data_requests_select on public.data_requests for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy data_requests_insert on public.data_requests for insert to authenticated
  with check (user_id = (select app.requesting_user_id()));
create policy data_requests_admin on public.data_requests for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy device_tokens_own on public.device_tokens for all to authenticated
  using (user_id = (select app.requesting_user_id())) with check (user_id = (select app.requesting_user_id()));

-- ============================================================== learning ====
create policy courses_select on public.courses for select to anon, authenticated using (
  (status = 'published' and deleted_at is null and app.age_ok(age_rating))
  or tutor_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy courses_insert on public.courses for insert to authenticated
  with check ((select app.is_admin()) or ((select app.is_tutor()) and tutor_id = (select app.requesting_user_id())));
create policy courses_update on public.courses for update to authenticated
  using ((select app.is_admin()) or (tutor_id = (select app.requesting_user_id()) and (select app.is_tutor())))
  with check ((select app.is_admin()) or (tutor_id = (select app.requesting_user_id()) and (select app.is_tutor())));
create policy courses_delete on public.courses for delete to authenticated using ((select app.is_admin()));

create policy lessons_select on public.lessons for select to anon, authenticated using (
  (select app.is_admin()) or app.owns_course(course_id)
  or (exists (select 1 from public.courses c where c.id = course_id and c.status = 'published' and c.deleted_at is null and app.age_ok(c.age_rating))
      and (is_preview or app.is_enrolled(course_id))));
create policy lessons_write on public.lessons for all to authenticated
  using ((select app.is_admin()) or (app.owns_course(course_id) and (select app.is_tutor())))
  with check ((select app.is_admin()) or (app.owns_course(course_id) and (select app.is_tutor())));

create policy course_media_select on public.course_media for select to authenticated using (
  (approved and (app.is_enrolled(course_id) or exists (select 1 from public.lessons l where l.id = lesson_id and l.is_preview)))
  or app.owns_course(course_id) or (select app.is_admin()));
create policy course_media_write on public.course_media for all to authenticated
  using ((select app.is_admin()) or (app.owns_course(course_id) and (select app.is_tutor())))
  with check ((select app.is_admin()) or (app.owns_course(course_id) and (select app.is_tutor())));

create policy media_progress_select on public.media_progress for select to authenticated using (
  user_id = (select app.requesting_user_id()) or (select app.is_admin())
  or exists (select 1 from public.course_media m where m.id = media_id and app.owns_course(m.course_id)));

create policy learning_paths_select on public.learning_paths for select to anon, authenticated
  using ((status = 'published' and deleted_at is null) or (select app.is_admin()));
create policy learning_paths_admin on public.learning_paths for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
create policy path_courses_select on public.path_courses for select to anon, authenticated
  using (exists (select 1 from public.learning_paths p where p.id = path_id));
create policy path_courses_admin on public.path_courses for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- learners see their own; tutors see enrolments in THEIR courses; admins all
create policy enrollments_select on public.enrollments for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()) or app.owns_course(course_id));
create policy enrollments_insert_free on public.enrollments for insert to authenticated with check (
  user_id = (select app.requesting_user_id()) and (select app.is_member())
  and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published' and c.is_free and c.deleted_at is null and app.age_ok(c.age_rating)));
create policy enrollments_update on public.enrollments for update to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()))
  with check (user_id = (select app.requesting_user_id()) or (select app.is_admin()));

create policy lesson_progress_select on public.lesson_progress for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()) or app.owns_course(course_id));
create policy lesson_progress_insert on public.lesson_progress for insert to authenticated with check (
  user_id = (select app.requesting_user_id())
  and exists (select 1 from public.lessons l where l.id = lesson_id and app.is_enrolled(l.course_id)));
create policy lesson_progress_delete on public.lesson_progress for delete to authenticated
  using (user_id = (select app.requesting_user_id()));

create policy tutor_reviews_select on public.tutor_reviews for select to anon, authenticated
  using (hidden_at is null or learner_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy tutor_reviews_insert on public.tutor_reviews for insert to authenticated
  with check ((select app.is_member()) and learner_id = (select app.requesting_user_id()));
create policy tutor_reviews_update on public.tutor_reviews for update to authenticated
  using (learner_id = (select app.requesting_user_id()) or (select app.is_admin()))
  with check (learner_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy tutor_reviews_delete on public.tutor_reviews for delete to authenticated using ((select app.is_admin()));

create policy ext_resources_select on public.external_resources for select to anon, authenticated using (
  (status = 'published' and app.age_ok(age_rating)) or added_by = (select app.requesting_user_id()) or (select app.is_admin()));
create policy ext_resources_insert on public.external_resources for insert to authenticated
  with check ((select app.is_tutor()) or (select app.is_admin()));
create policy ext_resources_update on public.external_resources for update to authenticated
  using ((added_by = (select app.requesting_user_id()) and (select app.is_tutor())) or (select app.is_admin()))
  with check ((added_by = (select app.requesting_user_id()) and (select app.is_tutor())) or (select app.is_admin()));
create policy ext_resources_delete on public.external_resources for delete to authenticated using ((select app.is_admin()));

create policy certificates_select on public.certificates for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));

-- ===================================================== projects & catalog ====
create policy projects_select on public.projects for select to anon, authenticated using (app.can_view_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check ((select app.is_member()) and owner_id = (select app.requesting_user_id())
              and (group_id is null or app.is_group_member(group_id)));
create policy projects_update on public.projects for update to authenticated
  using (app.is_project_maintainer(id) or (select app.is_admin())) with check (app.is_project_maintainer(id) or (select app.is_admin()));
create policy projects_delete on public.projects for delete to authenticated using ((select app.is_admin()));

create policy project_members_select on public.project_members for select to authenticated using (app.can_view_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check ((app.is_project_maintainer(project_id) and role <> 'owner') or (select app.is_admin()));
create policy project_members_delete on public.project_members for delete to authenticated
  using ((user_id = (select app.requesting_user_id()) and role <> 'owner') or (app.is_project_maintainer(project_id) and role <> 'owner') or (select app.is_admin()));

create policy project_milestones_select on public.project_milestones for select to authenticated
  using (app.is_project_member(project_id) or (select app.is_admin()));
create policy project_milestones_write on public.project_milestones for all to authenticated
  using (app.is_project_maintainer(project_id) or (select app.is_admin())) with check (app.is_project_maintainer(project_id) or (select app.is_admin()));
create policy project_tasks_select on public.project_tasks for select to authenticated
  using (app.is_project_member(project_id) or (select app.is_admin()));
create policy project_tasks_write on public.project_tasks for all to authenticated
  using (app.is_project_member(project_id) or (select app.is_admin())) with check (app.is_project_member(project_id) or (select app.is_admin()));

create policy project_stars_select on public.project_stars for select to anon, authenticated using (app.can_view_project(project_id));
create policy project_stars_insert on public.project_stars for insert to authenticated
  with check ((select app.is_member()) and user_id = (select app.requesting_user_id()) and app.can_view_project(project_id));
create policy project_stars_delete on public.project_stars for delete to authenticated using (user_id = (select app.requesting_user_id()));

create policy project_comments_select on public.project_comments for select to anon, authenticated using (
  (deleted_at is null and hidden_at is null and app.can_view_project(project_id)) or author_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy project_comments_insert on public.project_comments for insert to authenticated
  with check ((select app.is_member()) and author_id = (select app.requesting_user_id()) and app.can_view_project(project_id));
create policy project_comments_update on public.project_comments for update to authenticated
  using (author_id = (select app.requesting_user_id()) or (select app.is_admin())) with check (author_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy project_comments_delete on public.project_comments for delete to authenticated using ((select app.is_admin()));

create policy tools_select on public.tools for select to anon, authenticated using (status = 'published' or (select app.is_admin()));
create policy tools_admin on public.tools for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));

create policy news_select on public.news_items for select to anon, authenticated using (status = 'published' or (select app.is_admin()));
create policy news_admin on public.news_items for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));

create policy jobs_select on public.jobs for select to anon, authenticated using (
  (status = 'published' and (expires_at is null or expires_at > now())) or posted_by = (select app.requesting_user_id()) or (select app.is_admin()));
create policy jobs_insert on public.jobs for insert to authenticated with check ((select app.is_member()));
create policy jobs_update on public.jobs for update to authenticated
  using (posted_by = (select app.requesting_user_id()) or (select app.is_admin())) with check (posted_by = (select app.requesting_user_id()) or (select app.is_admin()));
create policy jobs_delete on public.jobs for delete to authenticated using ((select app.is_admin()));

create policy social_links_select on public.social_links for select to anon, authenticated using (is_active or (select app.is_admin()));
create policy social_links_admin on public.social_links for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));

create policy site_settings_select on public.site_settings for select to anon, authenticated using (is_public or (select app.is_admin()));
create policy feature_flags_select on public.feature_flags for select to anon, authenticated using (true);
create policy badges_select on public.badges for select to anon, authenticated using (is_active or (select app.is_admin()));
create policy badges_admin on public.badges for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));

-- ===================================================== events & sessions ====
create policy events_select on public.events for select to anon, authenticated using (
  (status in ('published','completed','cancelled') and deleted_at is null and app.age_ok(age_rating)
     and (group_id is null or app.can_view_group(group_id)))
  or created_by = (select app.requesting_user_id()) or (select app.is_admin()));
create policy events_insert on public.events for insert to authenticated
  with check ((select app.is_tutor()) or (select app.is_admin()) or (group_id is not null and app.is_group_manager(group_id)));
create policy events_update on public.events for update to authenticated
  using ((select app.is_admin()) or created_by = (select app.requesting_user_id()))
  with check ((select app.is_admin()) or created_by = (select app.requesting_user_id()));
create policy events_delete on public.events for delete to authenticated using ((select app.is_admin()));

create policy event_private_select on public.event_private for select to authenticated
  using ((select app.is_admin()) or app.owns_event(event_id) or app.is_registered(event_id));
create policy event_private_write on public.event_private for all to authenticated
  using ((select app.is_admin()) or app.owns_event(event_id)) with check ((select app.is_admin()) or app.owns_event(event_id));

create policy registrations_select on public.event_registrations for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()) or app.owns_event(event_id));
create policy registrations_insert on public.event_registrations for insert to authenticated with check (
  user_id = (select app.requesting_user_id()) and (select app.is_member())
  and exists (select 1 from public.events e where e.id = event_id and e.status = 'published' and e.deleted_at is null
              and e.price_ugx = 0 and e.starts_at > now() and app.age_ok(e.age_rating)));
create policy registrations_update on public.event_registrations for update to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()) or app.owns_event(event_id))
  with check (user_id = (select app.requesting_user_id()) or (select app.is_admin()) or app.owns_event(event_id));

create policy sessions_select on public.tutor_sessions for select to authenticated
  using ((status in ('scheduled','completed') and (select app.is_member())) or tutor_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy sessions_insert on public.tutor_sessions for insert to authenticated
  with check ((select app.is_tutor()) and tutor_id = (select app.requesting_user_id()));
create policy sessions_update on public.tutor_sessions for update to authenticated
  using (tutor_id = (select app.requesting_user_id()) or (select app.is_admin())) with check (tutor_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy sessions_delete on public.tutor_sessions for delete to authenticated
  using ((tutor_id = (select app.requesting_user_id()) and bookings_count = 0) or (select app.is_admin()));

create policy session_private_select on public.tutor_session_private for select to authenticated using (
  app.owns_session(session_id) or (select app.is_admin())
  or exists (select 1 from public.session_bookings b where b.session_id = tutor_session_private.session_id
             and b.learner_id = (select app.requesting_user_id()) and b.status in ('confirmed','attended')));
create policy session_private_write on public.tutor_session_private for all to authenticated
  using (app.owns_session(session_id) or (select app.is_admin())) with check (app.owns_session(session_id) or (select app.is_admin()));

create policy bookings_select on public.session_bookings for select to authenticated
  using (learner_id = (select app.requesting_user_id()) or app.owns_session(session_id) or (select app.is_admin()));
create policy bookings_insert on public.session_bookings for insert to authenticated
  with check ((select app.is_member()) and learner_id = (select app.requesting_user_id()));
create policy bookings_update on public.session_bookings for update to authenticated
  using (learner_id = (select app.requesting_user_id()) or app.owns_session(session_id) or (select app.is_admin()))
  with check (learner_id = (select app.requesting_user_id()) or app.owns_session(session_id) or (select app.is_admin()));

-- ================================================================ groups ====
create policy groups_select on public.study_groups for select to authenticated using (
  (deleted_at is null and not is_private and (select app.is_member()) and coalesce(app.group_age_ok(id, (select app.requesting_user_id())), false))
  or app.is_group_member(id) or (select app.is_admin()));
create policy groups_insert on public.study_groups for insert to authenticated
  with check ((select app.is_member()) and owner_id = (select app.requesting_user_id()));
create policy groups_update on public.study_groups for update to authenticated
  using (owner_id = (select app.requesting_user_id()) or app.is_group_manager(id) or (select app.is_admin()))
  with check (owner_id = (select app.requesting_user_id()) or app.is_group_manager(id) or (select app.is_admin()));
create policy groups_delete on public.study_groups for delete to authenticated
  using (owner_id = (select app.requesting_user_id()) or (select app.is_admin()));

create policy group_members_select on public.study_group_members for select to authenticated
  using ((select app.is_member()) and app.can_view_group(group_id));
create policy group_members_insert on public.study_group_members for insert to authenticated   -- self-join goes through join_group()
  with check ((app.is_group_manager(group_id) and role <> 'owner' and coalesce(app.group_age_ok(group_id, user_id), false)) or (select app.is_admin()));
create policy group_members_update on public.study_group_members for update to authenticated
  using (app.is_group_manager(group_id) or (select app.is_admin())) with check (role <> 'owner' or (select app.is_admin()));
create policy group_members_delete on public.study_group_members for delete to authenticated
  using ((user_id = (select app.requesting_user_id()) and role <> 'owner') or (app.is_group_manager(group_id) and role <> 'owner') or (select app.is_admin()));

create policy join_requests_select on public.group_join_requests for select to authenticated
  using (user_id = (select app.requesting_user_id()) or app.is_group_manager(group_id) or (select app.is_admin()));
create policy group_invites_select on public.group_invites for select to authenticated
  using (invitee_id = (select app.requesting_user_id()) or app.is_group_manager(group_id) or (select app.is_admin()));
create policy group_invites_insert on public.group_invites for insert to authenticated
  with check (app.is_group_manager(group_id) or (select app.is_admin()));
create policy group_invites_delete on public.group_invites for delete to authenticated
  using (app.is_group_manager(group_id) or (select app.is_admin()));

-- ============================================================= community ====
create policy posts_select on public.posts for select to authenticated using (
  (deleted_at is null and hidden_at is null and (select app.is_member()) and (group_id is null or app.can_view_group(group_id)))
  or author_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy posts_insert on public.posts for insert to authenticated
  with check ((select app.is_member()) and author_id = (select app.requesting_user_id()) and (group_id is null or app.is_group_member(group_id)));
create policy posts_update on public.posts for update to authenticated
  using (author_id = (select app.requesting_user_id()) or (select app.is_admin())) with check (author_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy posts_delete on public.posts for delete to authenticated using ((select app.is_admin()));

create policy post_comments_select on public.post_comments for select to authenticated using (
  (deleted_at is null and hidden_at is null and exists (select 1 from public.posts p where p.id = post_id))
  or author_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy post_comments_insert on public.post_comments for insert to authenticated with check (
  (select app.is_member()) and author_id = (select app.requesting_user_id())
  and exists (select 1 from public.posts p where p.id = post_id and p.deleted_at is null and p.hidden_at is null));
create policy post_comments_update on public.post_comments for update to authenticated
  using (author_id = (select app.requesting_user_id()) or (select app.is_admin())) with check (author_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy post_comments_delete on public.post_comments for delete to authenticated using ((select app.is_admin()));

create policy reactions_select on public.reactions for select to authenticated using ((select app.is_member()));
create policy reactions_insert on public.reactions for insert to authenticated with check (
  (select app.is_member()) and user_id = (select app.requesting_user_id())
  and (post_id is null or exists (select 1 from public.posts p where p.id = post_id))
  and (comment_id is null or exists (select 1 from public.post_comments c where c.id = comment_id)));
create policy reactions_delete on public.reactions for delete to authenticated using (user_id = (select app.requesting_user_id()));

create policy conversations_select on public.conversations for select to authenticated
  using (app.is_participant(id) or (select app.is_admin()));
create policy participants_select on public.conversation_participants for select to authenticated
  using (app.is_participant(conversation_id) or (select app.is_admin()));
create policy participants_update on public.conversation_participants for update to authenticated
  using (user_id = (select app.requesting_user_id())) with check (user_id = (select app.requesting_user_id()));
create policy participants_leave on public.conversation_participants for delete to authenticated
  using (user_id = (select app.requesting_user_id()));
-- Admins can read conversations only for safeguarding investigations via the
-- audited server endpoint (service role); there is no admin SELECT on messages.
create policy messages_select on public.messages for select to authenticated
  using ((app.is_participant(conversation_id) and deleted_at is null) or sender_id = (select app.requesting_user_id()));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select app.requesting_user_id()) and (select app.is_member()) and app.is_participant(conversation_id));
create policy messages_update on public.messages for update to authenticated
  using (sender_id = (select app.requesting_user_id())) with check (sender_id = (select app.requesting_user_id()));

create policy notifications_select on public.notifications for select to authenticated using (user_id = (select app.requesting_user_id()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select app.requesting_user_id())) with check (user_id = (select app.requesting_user_id()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select app.requesting_user_id()));

create policy flags_select on public.moderation_flags for select to authenticated
  using (reporter_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy flags_insert on public.moderation_flags for insert to authenticated
  with check ((select app.is_member()) and reporter_id = (select app.requesting_user_id()));

create policy announcements_select on public.announcements for select to anon, authenticated using (
  (select app.is_admin())
  or (published_at is not null and published_at <= now() and (expires_at is null or expires_at > now())
      and (audience = 'public'
           or (audience = 'members' and (select app.is_member()))
           or (audience = 'learners' and (select app.has_role('learner')))
           or (audience = 'tutors' and (select app.is_tutor())))));
create policy announcements_admin on public.announcements for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));

-- ====================================================== growth / gamification ====
create policy xp_events_select on public.xp_events for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy user_stats_select on public.user_stats for select to authenticated
  using ((select app.is_member()) or user_id = (select app.requesting_user_id()));
create policy user_badges_select on public.user_badges for select to authenticated
  using ((select app.is_member()) or user_id = (select app.requesting_user_id()));
create policy activity_select on public.user_activity_daily for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy referral_codes_select on public.referral_codes for select to authenticated using (user_id = (select app.requesting_user_id()));
create policy referrals_select on public.referrals for select to authenticated
  using (referrer_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy newsletter_select on public.newsletter_subscribers for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));

-- ============================================================= launchpad ====
create policy launch_select on public.launch_products for select to anon, authenticated using (app.can_view_product(id));
create policy launch_insert on public.launch_products for insert to authenticated
  with check ((select app.is_member()) and owner_id = (select app.requesting_user_id()));
create policy launch_update on public.launch_products for update to authenticated
  using (app.is_maker(id) or (select app.is_admin())) with check (app.is_maker(id) or (select app.is_admin()));
create policy launch_delete on public.launch_products for delete to authenticated using ((select app.is_admin()));

create policy launch_makers_select on public.launch_makers for select to anon, authenticated using (app.can_view_product(product_id));
create policy launch_makers_write on public.launch_makers for all to authenticated
  using ((select app.is_admin()) or exists (select 1 from public.launch_products p where p.id = product_id and p.owner_id = (select app.requesting_user_id())))
  with check ((select app.is_admin()) or exists (select 1 from public.launch_products p where p.id = product_id and p.owner_id = (select app.requesting_user_id())));
create policy launch_media_select on public.launch_media for select to anon, authenticated using (app.can_view_product(product_id));
create policy launch_media_write on public.launch_media for all to authenticated
  using (app.is_maker(product_id) or (select app.is_admin())) with check (app.is_maker(product_id) or (select app.is_admin()));
create policy launch_upvotes_select on public.launch_upvotes for select to authenticated using ((select app.is_member()));
create policy launch_upvotes_insert on public.launch_upvotes for insert to authenticated
  with check ((select app.is_member()) and user_id = (select app.requesting_user_id()) and app.can_view_product(product_id) and not app.is_maker(product_id));
create policy launch_upvotes_delete on public.launch_upvotes for delete to authenticated using (user_id = (select app.requesting_user_id()));
create policy launch_follows_select on public.launch_follows for select to authenticated using (user_id = (select app.requesting_user_id()) or app.is_maker(product_id));
create policy launch_follows_insert on public.launch_follows for insert to authenticated
  with check ((select app.is_member()) and user_id = (select app.requesting_user_id()) and app.can_view_product(product_id));
create policy launch_follows_delete on public.launch_follows for delete to authenticated using (user_id = (select app.requesting_user_id()));
create policy launch_comments_select on public.launch_comments for select to anon, authenticated using (
  (deleted_at is null and hidden_at is null and app.can_view_product(product_id)) or author_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy launch_comments_insert on public.launch_comments for insert to authenticated
  with check ((select app.is_member()) and author_id = (select app.requesting_user_id()) and app.can_view_product(product_id));
create policy launch_comments_update on public.launch_comments for update to authenticated
  using (author_id = (select app.requesting_user_id()) or (select app.is_admin())) with check (author_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy launch_comments_delete on public.launch_comments for delete to authenticated using ((select app.is_admin()));
create policy launch_updates_select on public.launch_updates for select to anon, authenticated using (app.can_view_product(product_id));
create policy launch_updates_insert on public.launch_updates for insert to authenticated
  with check (app.is_maker(product_id) and author_id = (select app.requesting_user_id()));
create policy launch_updates_delete on public.launch_updates for delete to authenticated using (app.is_maker(product_id) or (select app.is_admin()));
create policy placements_select on public.launch_placements for select to anon, authenticated
  using (status in ('approved','live') or app.is_maker(product_id) or (select app.is_admin()));
create policy placements_insert on public.launch_placements for insert to authenticated with check ((select app.is_member()));
create policy preview_embeds_select on public.preview_embeds for select to anon, authenticated using (is_active and app.can_view_product(product_id) or (select app.is_admin()));
create policy preview_embeds_write on public.preview_embeds for all to authenticated
  using (app.is_maker(product_id) or (select app.is_admin())) with check (app.is_maker(product_id) or (select app.is_admin()));

-- ========================================================= testing area ====
create policy campaigns_select on public.test_campaigns for select to authenticated using (
  (status = 'open' and (select app.is_member()) and app.age_ok(age_rating)) or app.is_maker(product_id) or (select app.is_admin()));
create policy campaigns_insert on public.test_campaigns for insert to authenticated with check ((select app.is_member()));
create policy campaigns_update on public.test_campaigns for update to authenticated
  using (app.is_maker(product_id) or (select app.is_admin())) with check (app.is_maker(product_id) or (select app.is_admin()));
create policy testers_select on public.test_testers for select to authenticated
  using (user_id = (select app.requesting_user_id()) or app.is_campaign_maker(campaign_id) or (select app.is_admin()));
create policy testers_insert on public.test_testers for insert to authenticated
  with check ((select app.is_member()) and user_id = (select app.requesting_user_id()));
create policy testers_update on public.test_testers for update to authenticated
  using (app.is_campaign_maker(campaign_id) or (select app.is_admin())) with check (app.is_campaign_maker(campaign_id) or (select app.is_admin()));
create policy feedback_select on public.test_feedback for select to authenticated
  using (tester_id = (select app.requesting_user_id()) or app.is_campaign_maker(campaign_id) or (select app.is_admin()));
create policy feedback_insert on public.test_feedback for insert to authenticated
  with check ((select app.is_member()) and tester_id = (select app.requesting_user_id()));
create policy feedback_update on public.test_feedback for update to authenticated
  using (tester_id = (select app.requesting_user_id()) or app.is_campaign_maker(campaign_id) or (select app.is_admin()))
  with check (tester_id = (select app.requesting_user_id()) or app.is_campaign_maker(campaign_id) or (select app.is_admin()));

-- ========================================================= competitions ====
create policy competitions_select on public.competitions for select to anon, authenticated using (status <> 'draft' or (select app.is_admin()));
create policy competitions_admin on public.competitions for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy comp_tracks_select on public.competition_tracks for select to anon, authenticated using (exists (select 1 from public.competitions c where c.id = competition_id));
create policy comp_tracks_admin on public.competition_tracks for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy rubric_select on public.rubric_criteria for select to anon, authenticated using (exists (select 1 from public.competitions c where c.id = competition_id));
create policy rubric_admin on public.rubric_criteria for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy comp_teams_select on public.competition_teams for select to authenticated using ((select app.is_member()));
create policy comp_teams_insert on public.competition_teams for insert to authenticated
  with check ((select app.is_member()) and captain_id = (select app.requesting_user_id()));
create policy comp_teams_delete on public.competition_teams for delete to authenticated
  using (captain_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy comp_entrants_select on public.competition_entrants for select to authenticated
  using (user_id = (select app.requesting_user_id()) or app.is_judge(competition_id) or (select app.is_admin())
         or (team_id is not null and exists (select 1 from public.competition_entrants e2 where e2.team_id = competition_entrants.team_id and e2.user_id = (select app.requesting_user_id()))));
create policy comp_entrants_insert on public.competition_entrants for insert to authenticated
  with check ((select app.is_member()) and user_id = (select app.requesting_user_id()));
create policy comp_entrants_delete on public.competition_entrants for delete to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy comp_subs_select on public.competition_submissions for select to authenticated using (
  app.owns_submission(id) or app.is_judge(competition_id) or (select app.is_admin())
  or exists (select 1 from public.competitions c where c.id = competition_id and c.status = 'completed'));
create policy comp_subs_insert on public.competition_submissions for insert to authenticated
  with check ((select app.is_member()) and app.is_entrant(competition_id)
              and (team_id is null or exists (select 1 from public.competition_entrants e where e.team_id = competition_submissions.team_id and e.user_id = (select app.requesting_user_id()))));
create policy comp_subs_update on public.competition_submissions for update to authenticated
  using (app.owns_submission(id) or (select app.is_admin())) with check (app.owns_submission(id) or (select app.is_admin()));
create policy comp_judges_select on public.competition_judges for select to authenticated using ((select app.is_member()));
create policy comp_judges_admin on public.competition_judges for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy scores_select on public.submission_scores for select to authenticated using (
  judge_id = (select app.requesting_user_id()) or (select app.is_admin())
  or (app.owns_submission(submission_id) and exists (select 1 from public.competition_submissions s join public.competitions c on c.id = s.competition_id
                                                     where s.id = submission_id and c.status = 'completed')));
create policy scores_insert on public.submission_scores for insert to authenticated with check (judge_id = (select app.requesting_user_id()));
create policy scores_update on public.submission_scores for update to authenticated
  using (judge_id = (select app.requesting_user_id())) with check (judge_id = (select app.requesting_user_id()));

-- ================================================== commerce & ledger ====
create policy coupons_select on public.coupons for select to authenticated
  using (tutor_id = (select app.requesting_user_id()) or (select app.is_admin()));     -- codes stay secret; checkout validates
create policy coupons_write on public.coupons for all to authenticated
  using ((select app.is_admin()) or (tutor_id = (select app.requesting_user_id()) and (select app.is_tutor())))
  with check ((select app.is_admin()) or (select app.is_tutor()));
create policy coupon_redemptions_select on public.coupon_redemptions for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));

create policy plans_select on public.subscription_plans for select to anon, authenticated using (is_active or (select app.is_admin()));
create policy plans_admin on public.subscription_plans for all to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));

create policy listings_select on public.marketplace_listings for select to authenticated using (
  (deleted_at is null and status in ('active','sold_out') and (select app.is_member())) or seller_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy listings_insert on public.marketplace_listings for insert to authenticated
  with check ((select app.is_member()) and seller_id = (select app.requesting_user_id()));
create policy listings_update on public.marketplace_listings for update to authenticated
  using (seller_id = (select app.requesting_user_id()) or (select app.is_admin())) with check (seller_id = (select app.requesting_user_id()) or (select app.is_admin()));

-- payer sees own payments; payee (tutor/seller) sees payments for THEIR products; admins all
create policy payments_select on public.payments for select to authenticated
  using (user_id = (select app.requesting_user_id()) or payee_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy orders_select on public.marketplace_orders for select to authenticated
  using (buyer_id = (select app.requesting_user_id()) or seller_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy orders_update on public.marketplace_orders for update to authenticated
  using (seller_id = (select app.requesting_user_id()) or (select app.is_admin())) with check (seller_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy invoices_select on public.invoices for select to authenticated
  using (user_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy refunds_select on public.refunds for select to authenticated using (
  requested_by = (select app.requesting_user_id()) or (select app.is_admin())
  or exists (select 1 from public.payments p where p.id = payment_id and p.user_id = (select app.requesting_user_id())));
create policy payouts_select on public.payouts for select to authenticated
  using (tutor_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy ledger_accounts_select on public.ledger_accounts for select to authenticated
  using (owner_id = (select app.requesting_user_id()) or (select app.is_admin()));
create policy ledger_entries_select on public.ledger_entries for select to authenticated using (
  (select app.is_admin()) or exists (select 1 from public.ledger_accounts a where a.id = account_id and a.owner_id = (select app.requesting_user_id())));
create policy ledger_txn_select on public.ledger_transactions for select to authenticated using (
  (select app.is_admin()) or exists (select 1 from public.ledger_entries e join public.ledger_accounts a on a.id = e.account_id
                                     where e.transaction_id = ledger_transactions.id and a.owner_id = (select app.requesting_user_id())));

-- ========================================================= admin-only logs ====
create policy webhook_events_admin on public.webhook_events for select to authenticated using ((select app.is_admin()));
create policy audit_log_admin on public.audit_log for select to authenticated using ((select app.is_admin()));
create policy error_events_admin on public.error_events for select to authenticated using ((select app.is_admin()));
create policy analytics_events_admin on public.analytics_events for select to authenticated using ((select app.is_admin()));
-- app.rate_limits: no policies (definer/service only)

-- =============================================================================
-- GRANTS (least privilege, on top of RLS)
-- =============================================================================
-- anon: read-only on the public catalogue, nothing else.
revoke all on all tables in schema public from anon;
grant select on public.profiles, public.tutor_profiles, public.courses, public.lessons, public.learning_paths, public.path_courses,
  public.tutor_reviews, public.external_resources, public.projects, public.project_stars, public.project_comments, public.tools,
  public.news_items, public.events, public.announcements, public.feature_flags, public.site_settings, public.subscription_plans,
  public.jobs, public.social_links, public.launch_products, public.launch_makers, public.launch_media, public.launch_comments,
  public.launch_updates, public.launch_placements, public.preview_embeds, public.competitions, public.competition_tracks,
  public.rubric_criteria, public.badges to anon;

-- authenticated: never truncate/trigger/reference; logs are read-only.
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke insert, update, delete on public.audit_log, public.webhook_events, public.error_events, public.analytics_events,
  public.ledger_accounts, public.ledger_entries, public.ledger_transactions, public.payments, public.invoices, public.refunds,
  public.payouts, public.subscriptions, public.coupon_redemptions, public.user_roles, public.xp_events, public.user_stats,
  public.user_badges, public.user_activity_daily, public.certificates, public.referrals, public.referral_codes,
  public.newsletter_subscribers, public.conversations, public.group_join_requests, public.site_settings, public.feature_flags,
  public.media_progress, public.payout_methods, public.marketplace_orders
  from authenticated;
grant update (status, fulfilled_at) on public.marketplace_orders to authenticated;   -- sellers mark fulfilled (guarded)

-- audit log is append-only even for the backend
revoke update, delete, truncate on public.audit_log from service_role;

-- column-level: secrets never readable through the API
revoke select on public.payout_methods from authenticated;
grant select (id, tutor_id, kind, provider_code, network, account_name, account_last4, currency, is_default, verified_at, created_at, updated_at, deleted_at)
  on public.payout_methods to authenticated;
revoke select on public.guardian_consents from authenticated;
grant select (id, user_id, guardian_name, relationship, verified_at, verification_method, revoked_at, created_at) on public.guardian_consents to authenticated;
grant insert (guardian_name, guardian_phone, guardian_email, relationship) on public.guardian_consents to authenticated;
revoke select on public.newsletter_subscribers from authenticated;
grant select (id, email, user_id, status, confirmed_at, unsubscribed_at, created_at) on public.newsletter_subscribers to authenticated;

-- views
revoke all on public.wallet_balances, public.leaderboard_all_time, public.leaderboard_weekly, public.competition_leaderboard from anon;
grant select on public.wallet_balances, public.leaderboard_all_time, public.leaderboard_weekly, public.competition_leaderboard to authenticated;

-- private schemas
revoke all on all tables in schema app, analytics from anon, authenticated;
revoke all on app.rate_limits from service_role;

-- ---------------------------------------------------------------- functions ----
-- Default privileges already deny EXECUTE (SR-04); make it explicit for
-- everything that exists, then open exactly what each role needs.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema app from public;
grant execute on all functions in schema app to anon, authenticated, service_role;   -- helpers only; none mutates data on its own
revoke execute on function app.apply_payment_internal(text, bigint, text, numeric, text, text, jsonb), app.fulfil_payment(public.payments),
  app.post_ledger(text, jsonb, uuid, uuid, uuid, text), app.ledger_account(text, public.ledger_account_kind, text, text),
  app.payable_account(text), app.award_xp(text, text, text), app.record_activity(text), app.notify(text, text, text, text, text, jsonb),
  app.audit_action(text, text, text, jsonb)
  from anon, authenticated;

-- anon + authenticated
grant execute on function public.search_all(text, text[], int, public.education_level), public.verify_certificate(text) to anon, authenticated;
-- authenticated (each function checks identity / ownership / role itself)
grant execute on function
  public.my_access(), public.my_wallet(), public.my_referral_code(), public.claim_referral(text), public.export_my_data(),
  public.create_checkout(public.payment_purpose, uuid, text, int, text, bigint), public.request_refund(uuid, text),
  public.request_payout(bigint, uuid), public.session_join_info(uuid), public.record_media_progress(uuid, integer, integer),
  public.join_group(uuid, text, text), public.decide_join_request(uuid, boolean), public.promote_project_to_launchpad(uuid, text),
  public.start_direct_conversation(text), public.mark_notifications_read(uuid[]), public.touch_last_seen(),
  public.recommend_courses(int), public.tutor_dashboard(), public.finalize_competition(uuid),
  public.admin_review_membership(uuid, public.application_status, text), public.admin_bulk_review_membership(uuid[], public.application_status, text),
  public.admin_review_tutor(uuid, public.application_status, text, numeric), public.admin_set_account_status(text, public.account_status, text, timestamptz),
  public.admin_set_role(text, public.app_role, boolean), public.admin_set_content_status(text, uuid, text, text),
  public.admin_feature(text, uuid, boolean), public.admin_review_placement(uuid, boolean), public.admin_moderate(uuid, text, text),
  public.admin_review_payout(uuid, text, text), public.admin_issue_refund(uuid, bigint, text, uuid),
  public.admin_set_setting(text, jsonb, boolean), public.admin_set_flag(text, boolean, int, public.app_role[]),
  public.admin_reorder_social_links(uuid[]), public.admin_verify_guardian(uuid), public.fanout_announcement(uuid),
  public.admin_overview(), public.admin_analytics(text, date, date, int)
  to authenticated;
-- service role only (server-only modules: webhooks, cron, unfurler, privacy jobs)
grant execute on function
  public.set_payment_checkout_link(text, text), public.apply_flutterwave_payment(text, bigint, text, numeric, text, text, jsonb),
  public.record_subscription_renewal(bigint, text, bigint, text, numeric, text, jsonb), public.complete_refund(uuid, boolean, bigint, text, jsonb),
  public.mark_payout_processing(uuid, bigint), public.complete_payout(text, boolean, text, jsonb),
  public.erase_user(text, text), public.attach_referral(text, text), public.register_click(text, uuid),
  public.write_audit(text, text, text, text, jsonb), public.rate_limit_hit(text, int, int), public.run_daily_maintenance(),
  public.refresh_analytics(), public.news_title_exists(text), public.fanout_announcement(uuid), public.search_all(text, text[], int, public.education_level),
  public.verify_certificate(text), public.export_my_data()
  to service_role;

-- -------------------------------------------------------------- final gate ----
-- Fails the migration (and CI) if any table in an API-reachable or private
-- schema is missing RLS.
do $$
declare t text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ') into t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r','p') and n.nspname in ('public','app','analytics') and not c.relrowsecurity;
  if t is not null then raise exception 'RLS disabled on: %', t; end if;
end $$;
