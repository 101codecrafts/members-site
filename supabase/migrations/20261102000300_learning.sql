-- =============================================================================
-- Learning: tutor-owned courses (admin review before publishing), lessons,
-- learning paths, enrollments, lesson progress, tutor reviews,
-- external "paste a link" resource catalog.
-- =============================================================================

create table public.courses (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title             text not null check (char_length(title) between 3 and 140),
  summary           text check (char_length(summary) <= 300),
  description       text check (char_length(description) <= 20000),
  level             public.skill_level not null default 'beginner',
  cover_url         text,
  tutor_id          text references public.profiles(id) on delete set null,   -- owner/author
  status            public.content_status not null default 'draft',
  review_note       text check (char_length(review_note) <= 2000),
  reviewed_by       text references public.profiles(id) on delete set null,
  is_featured       boolean not null default false,
  is_free           boolean not null default true,
  price_ugx         bigint not null default 0 check (price_ugx >= 0 and price_ugx <= 100000000),
  duration_minutes  integer check (duration_minutes >= 0),
  tags              text[] not null default '{}',
  rating_avg        numeric(3,2) not null default 0,
  rating_count      integer not null default 0,
  enrollments_count integer not null default 0,
  published_at      timestamptz,
  search_tsv        tsvector generated always as (
                      setweight(to_tsvector('english'::regconfig, coalesce(title,'')), 'A') ||
                      setweight(to_tsvector('english'::regconfig, coalesce(summary,'') || ' ' || app.tags_to_text(tags)), 'B') ||
                      setweight(to_tsvector('english'::regconfig, coalesce(description,'')), 'C')
                    ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint courses_price_consistent check ((is_free and price_ugx = 0) or (not is_free and price_ugx >= 1000))
);
create index courses_status_idx     on public.courses (status, published_at desc) where deleted_at is null;
create index courses_tutor_idx      on public.courses (tutor_id);
create index courses_search_idx     on public.courses using gin (search_tsv);
create index courses_title_trgm_idx on public.courses using gin (title extensions.gin_trgm_ops);
create trigger courses_updated_at before update on public.courses for each row execute function app.set_updated_at();

create table public.lessons (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references public.courses(id) on delete cascade,
  position          integer not null check (position >= 0),
  title             text not null check (char_length(title) between 2 and 140),
  content_md        text check (char_length(content_md) <= 100000),
  video_url         text check (video_url is null or video_url ~ '^https://'),
  duration_minutes  integer check (duration_minutes >= 0),
  is_preview        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (course_id, position)
);
create trigger lessons_updated_at before update on public.lessons for each row execute function app.set_updated_at();

create table public.learning_paths (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null check (char_length(title) between 3 and 140),
  description  text check (char_length(description) <= 5000),
  level        public.skill_level not null default 'beginner',
  cover_url    text,
  status       public.content_status not null default 'draft',
  created_by   text references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create trigger learning_paths_updated_at before update on public.learning_paths for each row execute function app.set_updated_at();

create table public.path_courses (
  path_id    uuid not null references public.learning_paths(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  position   integer not null check (position >= 0),
  primary key (path_id, course_id),
  unique (path_id, position)
);
create index path_courses_course_idx on public.path_courses (course_id);

create table public.enrollments (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null references public.profiles(id) on delete cascade,
  course_id        uuid not null references public.courses(id) on delete cascade,
  status           public.enrollment_status not null default 'active',
  progress_pct     numeric(5,2) not null default 0 check (progress_pct between 0 and 100),
  payment_id       uuid,
  enrolled_at      timestamptz not null default now(),
  completed_at     timestamptz,
  last_activity_at timestamptz,
  updated_at       timestamptz not null default now(),
  unique (user_id, course_id)
);
create index enrollments_course_idx on public.enrollments (course_id, status);
create index enrollments_enrolled_idx on public.enrollments (enrolled_at);
create index enrollments_completed_idx on public.enrollments (completed_at) where completed_at is not null;
create trigger enrollments_updated_at before update on public.enrollments for each row execute function app.set_updated_at();

create table public.lesson_progress (
  user_id       text not null references public.profiles(id) on delete cascade,
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  course_id     uuid not null references public.courses(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  primary key (user_id, lesson_id)
);
create index lesson_progress_course_idx on public.lesson_progress (course_id, user_id);

-- Learners review tutors (optionally for a course or session they took).
create table public.tutor_reviews (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    text not null references public.profiles(id) on delete cascade,
  learner_id  text not null references public.profiles(id) on delete cascade,
  course_id   uuid references public.courses(id) on delete set null,
  session_id  uuid,
  rating      smallint not null check (rating between 1 and 5),
  body        text check (char_length(body) <= 3000),
  hidden_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (tutor_id <> learner_id)
);
create unique index tutor_reviews_once on public.tutor_reviews (learner_id, tutor_id, coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index tutor_reviews_tutor_idx on public.tutor_reviews (tutor_id, created_at desc);
create trigger tutor_reviews_updated_at before update on public.tutor_reviews for each row execute function app.set_updated_at();

-- ------------------------------------------------- ownership helpers ----
create or replace function app.is_enrolled(p_course uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.enrollments e
                 where e.course_id = p_course and e.user_id = app.requesting_user_id() and e.status in ('active','completed'))
$$;

create or replace function app.owns_course(p_course uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.courses c where c.id = p_course and c.tutor_id = app.requesting_user_id())
$$;

-- ------------------------------------------------------------- guards ----
-- Tutors author courses but cannot publish, feature, re-assign or fake stats.
-- Publishing goes through admin_review_course(); submit via status 'pending_review'.
create or replace function app.guard_course()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.tutor_id := app.requesting_user_id();
    if new.status not in ('draft','pending_review') then new.status := 'draft'; end if;
    new.is_featured := false; new.reviewed_by := null; new.review_note := null; new.published_at := null;
    new.rating_avg := 0; new.rating_count := 0; new.enrollments_count := 0;
    return new;
  end if;
  if new.tutor_id is distinct from old.tutor_id or new.is_featured is distinct from old.is_featured
     or new.reviewed_by is distinct from old.reviewed_by or new.review_note is distinct from old.review_note
     or new.published_at is distinct from old.published_at
     or new.rating_avg is distinct from old.rating_avg or new.rating_count is distinct from old.rating_count
     or new.enrollments_count is distinct from old.enrollments_count then
    raise exception 'protected course fields' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status not in ('draft','pending_review','archived') then
    raise exception 'courses are published by admins (submit for review)' using errcode = '42501';
  end if;
  -- material edits to a live paid course send it back to review
  if old.status = 'published' and (new.price_ugx is distinct from old.price_ugx or new.is_free is distinct from old.is_free) then
    new.status := 'pending_review';
  end if;
  return new;
end;
$$;
create trigger courses_guard before insert or update on public.courses for each row execute function app.guard_course();

create or replace function app.guard_enrollment()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.user_id := app.requesting_user_id();
    new.status := 'active'; new.progress_pct := 0; new.completed_at := null; new.payment_id := null;
    return new;
  end if;
  if new.progress_pct is distinct from old.progress_pct or new.completed_at is distinct from old.completed_at
     or new.user_id is distinct from old.user_id or new.course_id is distinct from old.course_id
     or new.payment_id is distinct from old.payment_id
     or (new.status is distinct from old.status and not (old.status = 'active' and new.status = 'dropped')
                                                and not (old.status = 'dropped' and new.status = 'active')) then
    raise exception 'progress and payment fields are computed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger enrollments_guard before insert or update on public.enrollments for each row execute function app.guard_enrollment();

create or replace function app.enrollment_counters()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c uuid := coalesce(new.course_id, old.course_id); t text;
begin
  update public.courses set enrollments_count = (select count(*) from public.enrollments e where e.course_id = c and e.status in ('active','completed'))
   where id = c returning tutor_id into t;
  if t is not null then
    update public.tutor_profiles set learners_count = (
      select count(distinct e.user_id) from public.enrollments e join public.courses cc on cc.id = e.course_id
       where cc.tutor_id = t and e.status in ('active','completed'))
     where user_id = t;
  end if;
  return null;
end;
$$;
create trigger enrollments_count after insert or delete or update of status on public.enrollments for each row execute function app.enrollment_counters();

create or replace function app.lesson_progress_fill()
returns trigger language plpgsql set search_path = '' as $$
begin
  select l.course_id into new.course_id from public.lessons l where l.id = new.lesson_id;
  if not app.is_privileged() then new.user_id := app.requesting_user_id(); end if;
  new.completed_at := now();
  return new;
end;
$$;
create trigger lesson_progress_fill before insert on public.lesson_progress for each row execute function app.lesson_progress_fill();

create or replace function app.recompute_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r record := coalesce(new, old); total int; done int; pct numeric;
begin
  select count(*) into total from public.lessons where course_id = r.course_id;
  select count(*) into done  from public.lesson_progress where course_id = r.course_id and user_id = r.user_id;
  pct := case when total = 0 then 0 else round(100.0 * done / total, 2) end;
  update public.enrollments e
     set progress_pct = least(pct, 100), last_activity_at = now(),
         status = case when pct >= 100 then 'completed'::public.enrollment_status
                       when e.status = 'completed' then 'active'::public.enrollment_status else e.status end,
         completed_at = case when pct >= 100 then coalesce(e.completed_at, now()) else null end
   where e.user_id = r.user_id and e.course_id = r.course_id;
  return null;
end;
$$;
create trigger lesson_progress_recompute after insert or delete on public.lesson_progress for each row execute function app.recompute_progress();

-- Reviews: learner stamped from JWT; must have taken the tutor's course or session.
create or replace function app.guard_review()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.learner_id := app.requesting_user_id(); new.hidden_at := null;
    if not exists (select 1 from public.enrollments e join public.courses c on c.id = e.course_id
                    where e.user_id = new.learner_id and c.tutor_id = new.tutor_id and e.status in ('active','completed')
                      and (new.course_id is null or c.id = new.course_id))
       and not app.has_attended_tutor(new.tutor_id) then
      raise exception 'you can only review tutors you learned from' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.learner_id is distinct from old.learner_id or new.tutor_id is distinct from old.tutor_id
     or new.hidden_at is distinct from old.hidden_at then
    raise exception 'protected review fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tutor_reviews_guard before insert or update on public.tutor_reviews for each row execute function app.guard_review();

create or replace function app.review_aggregates()
returns trigger language plpgsql security definer set search_path = '' as $$
declare t text := coalesce(new.tutor_id, old.tutor_id); c uuid := coalesce(new.course_id, old.course_id);
begin
  update public.tutor_profiles tp set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.tutor_reviews where tutor_id = t and hidden_at is null), 0),
    rating_count = (select count(*) from public.tutor_reviews where tutor_id = t and hidden_at is null)
   where tp.user_id = t;
  if c is not null then
    update public.courses set
      rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.tutor_reviews where course_id = c and hidden_at is null), 0),
      rating_count = (select count(*) from public.tutor_reviews where course_id = c and hidden_at is null)
     where id = c;
  end if;
  return null;
end;
$$;
create trigger tutor_reviews_aggregate after insert or update or delete on public.tutor_reviews for each row execute function app.review_aggregates();

-- --------------------------------------------- external resource catalog ----
-- "Paste a link": metadata is fetched server-side (SSRF-guarded unfurler),
-- thumbnails are re-hosted in the resource-thumbs bucket, clicks go through
-- /go/{id} which logs analytics then 302s to the original URL.
create table public.external_resources (
  id                uuid primary key default gen_random_uuid(),
  url               text not null check (url ~ '^https://' and char_length(url) <= 2048),
  canonical_url     text check (canonical_url is null or (canonical_url ~ '^https://' and char_length(canonical_url) <= 2048)),
  url_hash          text not null unique check (url_hash ~ '^[a-f0-9]{64}$'),   -- sha256(normalised canonical url)
  type              text not null default 'article' check (type in ('course','book','video','article','tool','repo')),
  title             text not null check (char_length(title) between 1 and 300),
  description       text check (char_length(description) <= 5000),
  image_url         text check (image_url is null or image_url ~ '^https://'),     -- re-hosted copy
  image_source_url  text,
  site_name         text check (char_length(site_name) <= 120),
  favicon_url       text check (favicon_url is null or favicon_url ~ '^https://'),
  author            text check (char_length(author) <= 200),
  provider          text check (char_length(provider) <= 80),      -- youtube, coursera, udemy, github, openlibrary...
  price_text        text check (char_length(price_text) <= 60),
  is_free           boolean,
  language          text check (char_length(language) <= 20),
  duration_text     text check (char_length(duration_text) <= 60),
  rating            numeric(3,2) check (rating between 0 and 5),
  rating_count      integer check (rating_count >= 0),
  isbn              text check (isbn is null or isbn ~ '^[0-9X]{10,13}$'),
  tags              text[] not null default '{}' check (cardinality(tags) <= 20),
  raw_metadata      jsonb not null default '{}',
  learning_path_id  uuid references public.learning_paths(id) on delete set null,
  course_id         uuid references public.courses(id) on delete set null,
  added_by          text references public.profiles(id) on delete set null,
  status            text not null default 'draft' check (status in ('draft','published','archived')),
  is_featured       boolean not null default false,
  link_status       text not null default 'ok' check (link_status in ('ok','redirected','dead','unknown')),
  last_fetched_at   timestamptz,
  last_checked_at   timestamptz,
  fetch_error       text check (char_length(fetch_error) <= 500),
  click_count       integer not null default 0 check (click_count >= 0),
  search_tsv        tsvector generated always as (
                      setweight(to_tsvector('english'::regconfig, coalesce(title,'')), 'A') ||
                      setweight(to_tsvector('english'::regconfig, app.tags_to_text(tags) || ' ' || coalesce(author,'') || ' ' || coalesce(site_name,'')), 'B') ||
                      setweight(to_tsvector('english'::regconfig, coalesce(description,'')), 'C')
                    ) stored,
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index external_resources_live_idx on public.external_resources (published_at desc) where status = 'published';
create index external_resources_type_idx on public.external_resources (type) where status = 'published';
create index external_resources_path_idx on public.external_resources (learning_path_id);
create index external_resources_check_idx on public.external_resources (last_checked_at nulls first) where status = 'published';
create index external_resources_search_idx on public.external_resources using gin (search_tsv);
create trigger external_resources_updated_at before update on public.external_resources for each row execute function app.set_updated_at();

create or replace function app.guard_external_resource()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then
    if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.added_by := app.requesting_user_id(); new.is_featured := false; new.click_count := 0; new.link_status := 'ok';
  elsif new.added_by is distinct from old.added_by or new.is_featured is distinct from old.is_featured
     or new.click_count is distinct from old.click_count or new.link_status is distinct from old.link_status
     or new.url_hash is distinct from old.url_hash then
    raise exception 'protected resource fields' using errcode = '42501';
  end if;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  return new;
end;
$$;
create trigger external_resources_guard before insert or update on public.external_resources for each row execute function app.guard_external_resource();

-- SR-01: RLS on for every table created above (deny-by-default until policies in 0990).
select app.enable_rls_all();
