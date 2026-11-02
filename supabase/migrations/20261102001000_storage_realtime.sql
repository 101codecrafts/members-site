-- =============================================================================
-- Storage buckets + policies, Realtime publication.
-- First path segment = owner's Clerk user id (or the parent entity id).
-- Public buckets have NO broad SELECT policy (public download does not need
-- one; listing is denied) — SR-08. Explicit MIME allow-lists; no HTML/SVG.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',         'avatars',         true,    2097152, array['image/png','image/jpeg','image/webp']),
  ('resource-thumbs', 'resource-thumbs', true,    2097152, array['image/png','image/jpeg','image/webp','image/gif']),
  ('launch-media',    'launch-media',    true,    5242880, array['image/png','image/jpeg','image/webp','image/gif']),
  ('course-media',    'course-media',    false,  52428800, array['image/png','image/jpeg','image/webp','video/mp4','application/pdf']),
  ('project-files',   'project-files',   false,  26214400, array['image/png','image/jpeg','image/webp','application/pdf','application/zip','text/plain','text/markdown']),
  ('listing-files',   'listing-files',   false,  52428800, array['application/pdf','application/zip','image/png','image/jpeg','application/epub+zip']),
  ('post-images',     'post-images',     false,   5242880, array['image/png','image/jpeg','image/webp','image/gif']),
  ('group-files',     'group-files',     false,  26214400, array['image/png','image/jpeg','image/webp','application/pdf','application/zip','text/plain']),
  ('test-artifacts',  'test-artifacts',  false,   5242880, array['image/png','image/jpeg','image/webp','video/mp4','text/plain']),
  ('test-builds',     'test-builds',     false, 104857600, array['application/vnd.android.package-archive','application/zip','application/octet-stream']),
  ('tutor-docs',      'tutor-docs',      false,  10485760, array['application/pdf','image/png','image/jpeg']),
  ('certificates',    'certificates',    false,   5242880, array['application/pdf']),
  ('data-exports',    'data-exports',    false,  52428800, array['application/json','application/zip'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- helper: first / second folder of an object path
create or replace function app.seg(p_name text, p_i int)
returns text language sql immutable set search_path = '' as $$ select (storage.foldername(p_name))[p_i] $$;

-- avatars / resource-thumbs / launch-media: owner writes into own folder
create policy "own folder read (public buckets)" on storage.objects for select to authenticated
  using (bucket_id in ('avatars','launch-media') and app.seg(name, 1) = (select app.requesting_user_id()));
create policy "avatars write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and app.seg(name, 1) = (select app.requesting_user_id()));
create policy "avatars update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and app.seg(name, 1) = (select app.requesting_user_id()))
  with check (bucket_id = 'avatars' and app.seg(name, 1) = (select app.requesting_user_id()));
create policy "public buckets delete" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','launch-media') and (app.seg(name, 1) = (select app.requesting_user_id()) or (select app.is_admin())));
create policy "launch-media write" on storage.objects for insert to authenticated
  with check (bucket_id = 'launch-media' and app.seg(name, 1) = (select app.requesting_user_id()) and (select app.is_member()));
-- resource-thumbs are written by the unfurler (service role) only.

-- course-media/{course_id}/...: enrolled learners, the course tutor, admins
create policy "course-media read" on storage.objects for select to authenticated using (
  bucket_id = 'course-media' and (app.is_enrolled(app.try_uuid(app.seg(name, 1))) or app.owns_course(app.try_uuid(app.seg(name, 1))) or (select app.is_admin())));
create policy "course-media write" on storage.objects for insert to authenticated with check (
  bucket_id = 'course-media' and ((app.owns_course(app.try_uuid(app.seg(name, 1))) and (select app.is_tutor())) or (select app.is_admin())));
create policy "course-media delete" on storage.objects for delete to authenticated using (
  bucket_id = 'course-media' and (app.owns_course(app.try_uuid(app.seg(name, 1))) or (select app.is_admin())));

-- project-files/{user_id}/{project_id}/...
create policy "project-files read" on storage.objects for select to authenticated using (
  bucket_id = 'project-files' and (app.seg(name, 1) = (select app.requesting_user_id()) or app.can_view_project(app.try_uuid(app.seg(name, 2)))));
create policy "project-files write" on storage.objects for insert to authenticated with check (
  bucket_id = 'project-files' and app.seg(name, 1) = (select app.requesting_user_id()) and app.is_project_member(app.try_uuid(app.seg(name, 2))));
create policy "project-files delete" on storage.objects for delete to authenticated using (
  bucket_id = 'project-files' and (app.seg(name, 1) = (select app.requesting_user_id()) or (select app.is_admin())));

-- listing-files/{seller_id}/{listing_id}/...: seller, admins, buyers with a paid order
create policy "listing-files read" on storage.objects for select to authenticated using (
  bucket_id = 'listing-files' and (app.seg(name, 1) = (select app.requesting_user_id()) or (select app.is_admin())
    or exists (select 1 from public.marketplace_orders o where o.listing_id = app.try_uuid(app.seg(name, 2))
               and o.buyer_id = (select app.requesting_user_id()) and o.status in ('paid','fulfilled'))));
create policy "listing-files write" on storage.objects for insert to authenticated with check (
  bucket_id = 'listing-files' and app.seg(name, 1) = (select app.requesting_user_id())
  and exists (select 1 from public.marketplace_listings l where l.id = app.try_uuid(app.seg(name, 2)) and l.seller_id = (select app.requesting_user_id())));
create policy "listing-files delete" on storage.objects for delete to authenticated using (
  bucket_id = 'listing-files' and (app.seg(name, 1) = (select app.requesting_user_id()) or (select app.is_admin())));

-- post-images/{user_id}/...
create policy "post-images read" on storage.objects for select to authenticated using (bucket_id = 'post-images' and (select app.is_member()));
create policy "post-images write" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (select app.is_member()) and app.seg(name, 1) = (select app.requesting_user_id()));
create policy "post-images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (app.seg(name, 1) = (select app.requesting_user_id()) or (select app.is_admin())));

-- group-files/{group_id}/...
create policy "group-files read" on storage.objects for select to authenticated
  using (bucket_id = 'group-files' and (app.is_group_member(app.try_uuid(app.seg(name, 1))) or (select app.is_admin())));
create policy "group-files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'group-files' and app.is_group_member(app.try_uuid(app.seg(name, 1))));
create policy "group-files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'group-files' and (app.is_group_manager(app.try_uuid(app.seg(name, 1))) or (select app.is_admin())));

-- test-artifacts/{campaign_id}/{user_id}/...: tester own + campaign makers
create policy "test-artifacts read" on storage.objects for select to authenticated using (
  bucket_id = 'test-artifacts' and (app.seg(name, 2) = (select app.requesting_user_id()) or app.is_campaign_maker(app.try_uuid(app.seg(name, 1))) or (select app.is_admin())));
create policy "test-artifacts write" on storage.objects for insert to authenticated with check (
  bucket_id = 'test-artifacts' and app.seg(name, 2) = (select app.requesting_user_id()) and app.is_accepted_tester(app.try_uuid(app.seg(name, 1))));
-- test-builds/{campaign_id}/...: makers upload, accepted testers download
create policy "test-builds read" on storage.objects for select to authenticated using (
  bucket_id = 'test-builds' and (app.is_accepted_tester(app.try_uuid(app.seg(name, 1))) or app.is_campaign_maker(app.try_uuid(app.seg(name, 1))) or (select app.is_admin())));
create policy "test-builds write" on storage.objects for insert to authenticated
  with check (bucket_id = 'test-builds' and app.is_campaign_maker(app.try_uuid(app.seg(name, 1))));

-- tutor-docs/{user_id}/...: applicant uploads ID docs; only admins and the applicant read
create policy "tutor-docs read" on storage.objects for select to authenticated
  using (bucket_id = 'tutor-docs' and (app.seg(name, 1) = (select app.requesting_user_id()) or (select app.is_admin())));
create policy "tutor-docs write" on storage.objects for insert to authenticated
  with check (bucket_id = 'tutor-docs' and app.seg(name, 1) = (select app.requesting_user_id()));

-- certificates/{user_id}/..., data-exports/{user_id}/...: written by the server, read by the owner
create policy "owner reads server files" on storage.objects for select to authenticated
  using (bucket_id in ('certificates','data-exports') and (app.seg(name, 1) = (select app.requesting_user_id()) or (select app.is_admin())));

-- -------------------------------------------------------------- realtime ----
-- postgres_changes respect RLS. Realtime tables use soft deletes (SR-13).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.messages, public.conversation_participants,
      public.posts, public.announcements, public.launch_upvotes, public.test_feedback;
  end if;
end $$;
revoke delete on public.messages, public.notifications from authenticated;   -- soft-delete only on realtime tables

select app.enable_rls_all();
