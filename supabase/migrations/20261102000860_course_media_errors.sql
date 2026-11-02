-- =============================================================================
-- Course media library (YouTube videos/playlists, books, articles) with
-- per-learner watch progress, and client error monitoring.
-- Videos play through the official YouTube IFrame Player on
-- youtube-nocookie.com; we never download or strip ads.
-- =============================================================================

create table public.course_media (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses(id) on delete cascade,
  lesson_id       uuid references public.lessons(id) on delete cascade,
  kind            text not null check (kind in ('youtube_video','youtube_playlist','book','article')),
  source_url      text not null check (source_url ~ '^https://' and char_length(source_url) <= 2048),
  provider_id     text,                 -- YouTube video id / playlist id / ISBN, parsed server-side
  title           text not null check (char_length(title) between 1 and 300),
  channel         text check (char_length(channel) <= 200),
  author          text check (char_length(author) <= 200),
  duration_seconds integer check (duration_seconds >= 0),
  thumbnail_url   text check (thumbnail_url is null or thumbnail_url ~ '^https://'),
  embeddable      boolean not null default true,     -- books: preview allowed?
  level           public.education_level,
  position        integer not null default 0,
  added_by        text references public.profiles(id) on delete set null,
  approved        boolean not null default false,
  approved_by     text references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint course_media_provider_id check (
    case kind
      when 'youtube_video'    then provider_id ~ '^[A-Za-z0-9_-]{11}$'
      when 'youtube_playlist' then provider_id ~ '^(PL|UU|LL|FL|OL)[A-Za-z0-9_-]{10,40}$'
      when 'book'             then provider_id is null or provider_id ~ '^[0-9X]{10,13}$'
      else true end)
);
alter table public.course_media enable row level security;
create index course_media_course_idx on public.course_media (course_id, lesson_id, position);
create trigger course_media_updated_at before update on public.course_media for each row execute function app.set_updated_at();

-- Tutors add media to their own courses; admins (or the course tutor) approve.
create or replace function app.guard_course_media()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then
    if new.approved and new.approved_by is null then new.approved_by := app.requesting_user_id(); end if;
    return new;
  end if;
  if not app.owns_course(new.course_id) then raise exception 'course tutor only' using errcode = '42501'; end if;
  if tg_op = 'INSERT' then new.added_by := app.requesting_user_id(); end if;
  if new.lesson_id is not null and not exists (select 1 from public.lessons l where l.id = new.lesson_id and l.course_id = new.course_id) then
    raise exception 'lesson does not belong to this course' using errcode = '22023';
  end if;
  -- the owning tutor may approve media on their own course
  if new.approved then new.approved_by := app.requesting_user_id(); end if;
  return new;
end;
$$;
create trigger course_media_guard before insert or update on public.course_media for each row execute function app.guard_course_media();

-- Watch progress (seconds) — a video counts complete at 90 %.
create table public.media_progress (
  user_id          text not null references public.profiles(id) on delete cascade,
  media_id         uuid not null references public.course_media(id) on delete cascade,
  seconds_watched  integer not null default 0 check (seconds_watched >= 0),
  last_position    integer not null default 0 check (last_position >= 0),
  completed_at     timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (user_id, media_id)
);
alter table public.media_progress enable row level security;

-- Called by the player every ~15 s. Monotonic, capped to the video length,
-- and limited to plausible watch speed (anti "skip to the end" farming).
create or replace function public.record_media_progress(p_media uuid, p_position integer, p_delta_seconds integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); m public.course_media; mp public.media_progress; done boolean;
begin
  select * into m from public.course_media where id = p_media and approved;
  if not found or not (app.is_enrolled(m.course_id) or app.owns_course(m.course_id) or app.is_admin()) then
    raise exception 'media not available' using errcode = '42501';
  end if;
  if p_delta_seconds < 0 or p_delta_seconds > 60 or p_position < 0 then raise exception 'invalid progress' using errcode = '22023'; end if;
  insert into public.media_progress as x (user_id, media_id, seconds_watched, last_position)
  values (me, p_media, p_delta_seconds, p_position)
  on conflict (user_id, media_id) do update set
    seconds_watched = least(x.seconds_watched + p_delta_seconds, coalesce(m.duration_seconds, 2147483647)),
    last_position = p_position, updated_at = now()
  returning * into mp;
  done := m.duration_seconds is not null and m.duration_seconds > 0 and mp.seconds_watched >= 0.9 * m.duration_seconds;
  if done and mp.completed_at is null then
    update public.media_progress set completed_at = now() where user_id = me and media_id = p_media;
    -- a lesson whose every approved video is complete counts as completed
    if m.lesson_id is not null and not exists (
        select 1 from public.course_media cm left join public.media_progress p2 on p2.media_id = cm.id and p2.user_id = me
         where cm.lesson_id = m.lesson_id and cm.approved and cm.kind = 'youtube_video' and p2.completed_at is null and cm.id <> p_media) then
      insert into public.lesson_progress (user_id, lesson_id) values (me, m.lesson_id) on conflict do nothing;
    end if;
  end if;
  return jsonb_build_object('seconds_watched', mp.seconds_watched, 'completed', done);
end;
$$;

-- ------------------------------------------------------- error monitoring ----
-- Client/server errors without PII (no emails, tokens or request bodies).
create table public.error_events (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  source       text not null check (source in ('web','api','android','ios','windows','macos','edge')),
  level        text not null default 'error' check (level in ('warning','error','fatal')),
  message      text not null check (char_length(message) <= 1000),
  fingerprint  text check (char_length(fingerprint) <= 128),
  stack        text check (char_length(stack) <= 8000),
  path         text check (char_length(path) <= 500),
  release      text check (char_length(release) <= 60),
  user_hash    text check (char_length(user_hash) <= 64),   -- sha256(user id + salt), never the raw id
  context      jsonb not null default '{}' check (pg_column_size(context) <= 4096)
);
alter table public.error_events enable row level security;
create index error_events_time_idx on public.error_events using brin (occurred_at);
create index error_events_fp_idx on public.error_events (fingerprint, occurred_at desc);

select app.enable_rls_all();
