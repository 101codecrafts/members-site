-- =============================================================================
-- "Free Courses Worldwide": external course catalogue (separate from
-- "101 Courses", which are the tutor-authored public.courses).
-- Cards open the ORIGINAL source through /go/{id} (click logged, new tab).
-- =============================================================================
create type public.external_access_type as enum ('free','free_audit','free_trial','free_until','paid_with_aid');

create table public.external_courses (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 2 and 300),
  description      text check (char_length(description) <= 5000),
  provider         text not null check (char_length(provider) between 2 and 60),   -- Coursera, edX, freeCodeCamp, Google, Microsoft Learn, Cisco NetAcad, Khan Academy, Alison...
  source_url       text not null check (source_url ~ '^https://' and char_length(source_url) <= 2048),
  url_hash         text not null unique check (url_hash ~ '^[a-f0-9]{64}$'),
  cover_image_url  text check (cover_image_url is null or cover_image_url ~ '^https://'),   -- re-hosted in resource-thumbs
  image_source_url text,
  access_type      public.external_access_type not null default 'free',
  free_until       timestamptz,
  certificate_free boolean not null default false,
  level            public.education_level,
  skill_level      public.skill_level,
  category         text check (char_length(category) <= 60),
  language         text not null default 'en' check (char_length(language) <= 20),
  duration_text    text check (char_length(duration_text) <= 60),
  tags             text[] not null default '{}' check (cardinality(tags) <= 20),
  added_by         text references public.profiles(id) on delete set null,
  approved         boolean not null default false,
  approved_by      text references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  is_featured      boolean not null default false,
  status           text not null default 'active' check (status in ('active','expired','hidden','dead')),
  clicks           integer not null default 0 check (clicks >= 0),
  last_checked_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (access_type <> 'free_until' or free_until is not null)
);
alter table public.external_courses enable row level security;
create index external_courses_live_idx on public.external_courses (provider, level) where approved and status = 'active';
create index external_courses_expiry_idx on public.external_courses (free_until) where free_until is not null and status = 'active';
create trigger external_courses_updated_at before update on public.external_courses for each row execute function app.set_updated_at();
create trigger audit_external_courses after insert or update or delete on public.external_courses for each row execute function app.audit_row();

-- Tutors add suggestions (unapproved); only admins approve/feature.
create or replace function app.guard_external_course()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then
    if new.approved and (tg_op = 'INSERT' or not old.approved) then new.approved_by := app.requesting_user_id(); new.approved_at := now(); end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.added_by := app.requesting_user_id(); new.approved := false; new.approved_by := null; new.approved_at := null;
    new.is_featured := false; new.clicks := 0; new.status := 'active';
    return new;
  end if;
  if new.approved is distinct from old.approved or new.approved_by is distinct from old.approved_by or new.is_featured is distinct from old.is_featured
     or new.clicks is distinct from old.clicks or new.added_by is distinct from old.added_by or new.status is distinct from old.status then
    raise exception 'only admins approve, feature or change status' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger external_courses_guard before insert or update on public.external_courses for each row execute function app.guard_external_course();

create policy ext_courses_select on public.external_courses for select to anon, authenticated using (
  (approved and status = 'active') or added_by = (select app.requesting_user_id()) or (select app.is_admin()));
create policy ext_courses_insert on public.external_courses for insert to authenticated
  with check ((select app.is_tutor()) or (select app.is_admin()));
create policy ext_courses_update on public.external_courses for update to authenticated
  using ((added_by = (select app.requesting_user_id()) and not approved and (select app.is_tutor())) or (select app.is_admin()))
  with check ((added_by = (select app.requesting_user_id()) and (select app.is_tutor())) or (select app.is_admin()));
create policy ext_courses_delete on public.external_courses for delete to authenticated using ((select app.is_admin()));
grant select on public.external_courses to anon;
revoke truncate, references, trigger on public.external_courses from authenticated;

-- /go/{id} click counter covers external courses too (service role).
create or replace function public.register_click(p_kind text, p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare u text;
begin
  perform app.require_backend();
  if p_kind = 'resource' then
    update public.external_resources set click_count = click_count + 1 where id = p_id and status = 'published' returning coalesce(canonical_url, url) into u;
  elsif p_kind = 'news' then
    update public.news_items set click_count = click_count + 1 where id = p_id and status = 'published' returning url into u;
  elsif p_kind = 'job' then
    update public.jobs set click_count = click_count + 1 where id = p_id and status = 'published' returning apply_url into u;
  elsif p_kind = 'external_course' then
    update public.external_courses set clicks = clicks + 1 where id = p_id and approved and status = 'active' returning source_url into u;
  end if;
  return u;
end;
$$;
revoke execute on function public.register_click(text, uuid) from public, anon, authenticated;
grant execute on function public.register_click(text, uuid) to service_role;

-- Cron: expire passed free windows (service role). Returns how many changed.
create or replace function public.expire_external_courses()
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform app.require_backend();
  update public.external_courses set status = 'expired' where status = 'active' and free_until is not null and free_until < now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.expire_external_courses() from public, anon, authenticated;
grant execute on function public.expire_external_courses() to service_role;

-- Admin "expiring soon" list.
create or replace function public.admin_expiring_external_courses(p_days int default 14)
returns setof public.external_courses language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return query select * from public.external_courses
    where status = 'active' and free_until is not null and free_until < now() + make_interval(days => least(greatest(p_days, 1), 90))
    order by free_until;
end;
$$;
revoke execute on function public.admin_expiring_external_courses(int) from public, anon;
grant execute on function public.admin_expiring_external_courses(int) to authenticated;

-- admin_feature / content status support
create or replace function public.admin_approve_external_course(p_id uuid, p_approve boolean, p_featured boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.external_courses set approved = p_approve, is_featured = coalesce(p_featured, is_featured),
         status = case when p_approve then status else 'hidden' end where id = p_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  perform app.audit_action('admin.approve_external_course', 'external_courses', p_id::text, jsonb_build_object('approve', p_approve));
end;
$$;
revoke execute on function public.admin_approve_external_course(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_approve_external_course(uuid, boolean, boolean) to authenticated;

insert into public.external_courses (title, provider, source_url, url_hash, access_type, certificate_free, level, category, approved, description) values
  ('CS50: Introduction to Computer Science', 'edX', 'https://pll.harvard.edu/course/cs50-introduction-computer-science',
   encode(extensions.digest('https://pll.harvard.edu/course/cs50-introduction-computer-science', 'sha256'), 'hex'), 'free_audit', false, 'university', 'Computer science', true,
   'Harvard''s introduction to computer science and programming.'),
  ('Responsive Web Design', 'freeCodeCamp', 'https://www.freecodecamp.org/learn/2022/responsive-web-design/',
   encode(extensions.digest('https://www.freecodecamp.org/learn/2022/responsive-web-design/', 'sha256'), 'hex'), 'free', true, 'o_level', 'Web development', true,
   'Free certification in HTML and CSS.')
on conflict (url_hash) do nothing;

do $$
declare t text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ') into t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r','p') and n.nspname in ('public','app','analytics') and not c.relrowsecurity;
  if t is not null then raise exception 'RLS disabled on: %', t; end if;
end $$;
