-- =============================================================================
-- Round 11 (r11/dash-api): tutor course builder + learner/tutor dashboards.
--
--   * course_modules: course -> modules -> lessons (Udemy "sections", Thinkific "chapters")
--   * lessons gain module_id, kind (video|book|text|file|quiz), payload jsonb and
--     an `approved` flag: learners only ever see approved lessons, so edits to a
--     live course stay hidden until an admin approves the update.
--   * lesson_quiz_keys: quiz answers kept apart from the lesson (learners can
--     read lessons, never the keys); graded by grade_lesson_quiz().
--   * course_submissions: the admin approval queue for courses (new, update,
--     price). Tutors submit through submit_course_for_review(), which runs the
--     pre-submit checklist and a structural link-safety report.
--   * pricing: tutors REQUEST a price (requested_price_ugx); only admins set the
--     live is_free / price_ugx (on approval, or admin_set_course_price()).
--   * dashboards: learner_dashboard() and an extended tutor_dashboard(), both
--     returning real rows only (zeros / empty arrays for a fresh account).
--
-- Reuses courses, lessons, enrollments, lesson_progress, certificates,
-- bookmarks, session_bookings, tutor_sessions, payouts, audit_log, notifications.
-- Idempotent where practical. NOT applied to any database (founder applies).
-- =============================================================================

-- ------------------------------------------------------------ pricing ----
alter table public.courses add column if not exists requested_price_ugx bigint;
alter table public.courses add column if not exists price_reviewed_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'courses_requested_price_range') then
    alter table public.courses add constraint courses_requested_price_range
      check (requested_price_ugx is null or requested_price_ugx = 0 or requested_price_ugx between 1000 and 100000000);
  end if;
end $$;

-- Tutors never set the live price or move a course into review by hand.
-- Runs after app.guard_course() (trigger names sort: courses_guard < courses_guard_price).
create or replace function app.guard_course_price()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.is_free := true; new.price_ugx := 0; new.price_reviewed_at := null;
    if new.status <> 'draft' then new.status := 'draft'; end if;   -- review only via submit_course_for_review()
    return new;
  end if;
  if new.is_free is distinct from old.is_free or new.price_ugx is distinct from old.price_ugx
     or new.price_reviewed_at is distinct from old.price_reviewed_at then
    raise exception 'prices are set by admins: request a price instead' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'pending_review' then
      raise exception 'use submit_course_for_review()' using errcode = '42501';
    end if;
    if old.status = 'pending_review' then
      raise exception 'use withdraw_course_submission()' using errcode = '42501';
    end if;
  end if;
  if old.status = 'pending_review' and (new.title is distinct from old.title or new.summary is distinct from old.summary
     or new.description is distinct from old.description or new.cover_url is distinct from old.cover_url
     or new.requested_price_ugx is distinct from old.requested_price_ugx) then
    raise exception 'course is in review: withdraw it to edit' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists courses_guard_price on public.courses;
create trigger courses_guard_price before insert or update on public.courses for each row execute function app.guard_course_price();

-- ------------------------------------------------------------ modules ----
create table if not exists public.course_modules (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references public.courses(id) on delete cascade,
  position    integer not null check (position >= 0),
  title       text not null check (char_length(title) between 2 and 140),
  summary     text check (char_length(summary) <= 1000),
  approved    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (course_id, position)
);
create index if not exists course_modules_course_idx on public.course_modules (course_id, position);
drop trigger if exists course_modules_updated_at on public.course_modules;
create trigger course_modules_updated_at before update on public.course_modules for each row execute function app.set_updated_at();
alter table public.course_modules enable row level security;

-- ------------------------------------------------------------ lessons ----
alter table public.lessons add column if not exists module_id uuid references public.course_modules(id) on delete cascade;
alter table public.lessons add column if not exists kind text not null default 'text';
alter table public.lessons add column if not exists payload jsonb not null default '{}'::jsonb;
alter table public.lessons add column if not exists approved boolean not null default false;
create index if not exists lessons_module_idx on public.lessons (module_id, position);

-- lessons of courses that are already live stay visible
update public.lessons l set approved = true from public.courses c where c.id = l.course_id and c.status = 'published' and not l.approved;

-- lessons keep ONE position sequence per course (unique (course_id, position) stays, so the
-- seed and older code keep working); module order + that sequence give the curriculum order.

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lessons_kind_check') then
    alter table public.lessons add constraint lessons_kind_check check (kind in ('video','book','text','file','quiz'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lessons_payload_shape') then
    alter table public.lessons add constraint lessons_payload_shape check (
      jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 65536 and
      case kind
        when 'video' then coalesce(payload ->> 'youtube_id', '') ~ '^[A-Za-z0-9_-]{11}$'
        when 'book'  then coalesce(payload ->> 'isbn', '') ~ '^([0-9]{9}[0-9X]|[0-9]{13})$'
                       or coalesce(payload ->> 'url', '') ~ '^https://[^/@\s]+(/\S*)?$'
        when 'file'  then coalesce(payload ->> 'url', '') ~ '^https://[^/@\s]+(/\S*)?$'
        when 'quiz'  then jsonb_typeof(payload -> 'questions') = 'array'
                       and jsonb_array_length(payload -> 'questions') between 1 and 50
                       and not jsonb_path_exists(payload, '$.questions[*].answer')   -- answers live in lesson_quiz_keys
        else true end);
  end if;
end $$;

-- answer keys: never readable by learners
create table if not exists public.lesson_quiz_keys (
  lesson_id   uuid primary key references public.lessons(id) on delete cascade,
  answers     jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) between 1 and 50),
  updated_at  timestamptz not null default now()
);
alter table public.lesson_quiz_keys enable row level security;

-- Tutors edit their own course content, never while it is in review, and every
-- tutor edit is un-approved until an admin approves the course (or update).
create or replace function app.guard_course_content()
returns trigger language plpgsql set search_path = '' as $$
declare cid uuid; st public.content_status;
begin
  if app.is_privileged() or app.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    -- content written by admins / the backend (seed, imports) is approved by definition
    if tg_op = 'INSERT' and tg_table_name in ('lessons','course_modules') then new.approved := true; end if;
    return new;
  end if;
  if tg_table_name = 'lesson_quiz_keys' then
    select l.course_id into cid from public.lessons l where l.id = coalesce(new.lesson_id, old.lesson_id);
  else
    cid := coalesce(new.course_id, old.course_id);
  end if;
  select c.status into st from public.courses c where c.id = cid;
  if st = 'pending_review' then
    raise exception 'course is in review: withdraw it to edit' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_table_name in ('lessons','course_modules') then
    if tg_op = 'UPDATE' and new.course_id is distinct from old.course_id then
      raise exception 'cannot move content between courses' using errcode = '42501';
    end if;
    new.approved := false;
  end if;
  if tg_table_name = 'lessons' then
    if new.module_id is not null
       and not exists (select 1 from public.course_modules m where m.id = new.module_id and m.course_id = new.course_id) then
      raise exception 'module does not belong to this course' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists course_modules_guard on public.course_modules;
create trigger course_modules_guard before insert or update or delete on public.course_modules for each row execute function app.guard_course_content();
drop trigger if exists lessons_guard_content on public.lessons;
create trigger lessons_guard_content before insert or update or delete on public.lessons for each row execute function app.guard_course_content();
drop trigger if exists lesson_quiz_keys_guard on public.lesson_quiz_keys;
create trigger lesson_quiz_keys_guard before insert or update or delete on public.lesson_quiz_keys for each row execute function app.guard_course_content();

-- --------------------------------------------------------- submissions ----
create table if not exists public.course_submissions (
  id                   uuid primary key default gen_random_uuid(),
  course_id            uuid not null references public.courses(id) on delete cascade,
  submitted_by         text not null references public.profiles(id) on delete cascade,
  kind                 text not null default 'new' check (kind in ('new','update','price')),
  status               text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  requested_price_ugx  bigint check (requested_price_ugx is null or requested_price_ugx >= 0),
  approved_price_ugx   bigint check (approved_price_ugx is null or approved_price_ugx >= 0),
  note                 text check (char_length(note) <= 1000),
  snapshot             jsonb not null default '{}',
  checklist            jsonb not null default '{}',
  link_report          jsonb not null default '[]',
  reason               text check (char_length(reason) <= 2000),
  reviewed_by          text references public.profiles(id) on delete set null,
  reviewed_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (status <> 'rejected' or char_length(coalesce(reason, '')) >= 5)
);
create unique index if not exists course_submissions_one_pending on public.course_submissions (course_id) where status = 'pending';
create index if not exists course_submissions_queue_idx on public.course_submissions (status, created_at);
create index if not exists course_submissions_tutor_idx on public.course_submissions (submitted_by, created_at desc);
drop trigger if exists course_submissions_updated_at on public.course_submissions;
create trigger course_submissions_updated_at before update on public.course_submissions for each row execute function app.set_updated_at();
alter table public.course_submissions enable row level security;

-- --------------------------------------------------------------- RLS ----
drop policy if exists course_modules_select on public.course_modules;
create policy course_modules_select on public.course_modules for select to anon, authenticated using (
  (select app.is_admin()) or app.owns_course(course_id)
  or (approved and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'
                           and c.deleted_at is null and app.age_ok(c.age_rating))));
drop policy if exists course_modules_write on public.course_modules;
create policy course_modules_write on public.course_modules for all to authenticated
  using ((select app.is_admin()) or (app.owns_course(course_id) and (select app.is_tutor())))
  with check ((select app.is_admin()) or (app.owns_course(course_id) and (select app.is_tutor())));

-- learners: only approved lessons (replaces lessons_select; promo policy is unchanged)
drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select to anon, authenticated using (
  (select app.is_admin()) or app.owns_course(course_id)
  or (approved and exists (select 1 from public.courses c where c.id = course_id and c.status = 'published'
                           and c.deleted_at is null and app.age_ok(c.age_rating))
      and (is_preview or app.is_enrolled(course_id))));

drop policy if exists lesson_quiz_keys_owner on public.lesson_quiz_keys;
create policy lesson_quiz_keys_owner on public.lesson_quiz_keys for all to authenticated
  using ((select app.is_admin()) or exists (select 1 from public.lessons l where l.id = lesson_id and app.owns_course(l.course_id) and app.is_tutor()))
  with check ((select app.is_admin()) or exists (select 1 from public.lessons l where l.id = lesson_id and app.owns_course(l.course_id) and app.is_tutor()));

drop policy if exists course_submissions_select on public.course_submissions;
create policy course_submissions_select on public.course_submissions for select to authenticated
  using (submitted_by = (select app.requesting_user_id()) or (select app.is_admin()));
-- no insert/update/delete policies: writes go through the RPCs below

revoke all on public.course_modules, public.lesson_quiz_keys, public.course_submissions from anon;
grant select on public.course_modules to anon;
grant select, insert, update, delete on public.course_modules, public.lesson_quiz_keys to authenticated;
grant select on public.course_submissions to authenticated;
revoke insert, update, delete, truncate on public.course_submissions from authenticated;

-- ------------------------------------------------------------ helpers ----
-- Structural link check (no network): https only, no credentials, no raw IPs,
-- no localhost / private suffixes, no URL shorteners. Admins see the report
-- in the queue; the API layer may add a live check on top.
create or replace function app.link_verdict(p_url text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_url is null or p_url = '' then null
    when p_url !~ '^https://' then 'not_https'
    when p_url ~ '^https://[^/]*@' then 'has_credentials'
    when p_url ~ '^https://(\d{1,3}\.){3}\d{1,3}([:/]|$)' or p_url ~ '^https://\[' then 'ip_address'
    when p_url ~* '^https://([^/]*\.)?(localhost|local|internal|lan|home\.arpa)([:/]|$)' then 'private_host'
    when p_url ~* '^https://([^/]*\.)?(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|cutt\.ly|rb\.gy|shorturl\.at|tiny\.cc)([:/]|$)' then 'shortener'
    when char_length(p_url) > 2048 then 'too_long'
    else 'ok' end
$$;

create or replace function app.course_link_report(p_course uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('where', x.src, 'url', x.url, 'verdict', app.link_verdict(x.url)) order by x.src), '[]')
  from (
    select 'course cover' as src, c.cover_url as url from public.courses c where c.id = p_course and c.cover_url is not null
    union all
    select 'lesson: ' || l.title, l.payload ->> 'url' from public.lessons l where l.course_id = p_course and l.payload ? 'url'
    union all
    select 'lesson video: ' || l.title, 'https://www.youtube-nocookie.com/embed/' || (l.payload ->> 'youtube_id')
      from public.lessons l where l.course_id = p_course and l.kind = 'video'
  ) x
$$;

create or replace function app.course_tree(p_course uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'course', (select to_jsonb(c) - 'search_tsv' from public.courses c where c.id = p_course),
    'modules', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'summary', m.summary, 'position', m.position, 'approved', m.approved,
        'lessons', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'kind', l.kind, 'position', l.position,
            'payload', l.payload, 'content_md', l.content_md, 'video_url', l.video_url, 'duration_minutes', l.duration_minutes,
            'is_preview', l.is_preview, 'approved', l.approved) order by l.position)
          from public.lessons l where l.module_id = m.id), '[]')) order by m.position)
      from public.course_modules m where m.course_id = p_course), '[]'),
    'legacy_lessons', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'kind', l.kind, 'position', l.position,
        'payload', l.payload, 'content_md', l.content_md, 'video_url', l.video_url, 'is_preview', l.is_preview, 'approved', l.approved) order by l.position)
      from public.lessons l where l.course_id = p_course and l.module_id is null), '[]'))
$$;

create or replace function app.course_checklist(p_course uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title',               char_length(coalesce(c.title, '')) >= 3,
    'summary',             char_length(coalesce(c.summary, '')) >= 10,
    'has_module',          exists (select 1 from public.course_modules m where m.course_id = c.id),
    'has_lesson',          exists (select 1 from public.lessons l where l.course_id = c.id),
    'modules_have_lessons', not exists (select 1 from public.course_modules m where m.course_id = c.id
                                         and not exists (select 1 from public.lessons l where l.module_id = m.id)),
    'lessons_have_content', not exists (select 1 from public.lessons l where l.course_id = c.id
                                         and l.kind = 'text' and char_length(coalesce(l.content_md, '')) < 1),
    'quizzes_have_keys',   not exists (select 1 from public.lessons l where l.course_id = c.id and l.kind = 'quiz'
                                         and not exists (select 1 from public.lesson_quiz_keys k where k.lesson_id = l.id)),
    'links_safe',          not exists (select 1 from jsonb_array_elements(app.course_link_report(c.id)) r where r ->> 'verdict' <> 'ok'))
  from public.courses c where c.id = p_course
$$;

-- ---------------------------------------------------------- tutor RPCs ----
create or replace function public.submit_course_for_review(p_course uuid, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); c public.courses; chk jsonb; k text; sid uuid;
begin
  if not app.is_tutor() then raise exception 'verified tutors only' using errcode = '42501'; end if;
  select * into c from public.courses where id = p_course and deleted_at is null for update;
  if not found or c.tutor_id is distinct from me then raise exception 'not your course' using errcode = '42501'; end if;
  if c.status = 'pending_review' or exists (select 1 from public.course_submissions s where s.course_id = p_course and s.status = 'pending') then
    raise exception 'already in review' using errcode = '22023';
  end if;
  if c.status = 'archived' then raise exception 'archived courses cannot be submitted' using errcode = '22023'; end if;
  chk := app.course_checklist(p_course);
  if exists (select 1 from jsonb_each(chk) e where e.value = 'false'::jsonb) then
    raise exception 'checklist incomplete: %', chk using errcode = '22023';
  end if;
  k := case when c.status <> 'published' then 'new'
            when c.requested_price_ugx is not null and c.requested_price_ugx is distinct from c.price_ugx then 'price'
            else 'update' end;
  insert into public.course_submissions (course_id, submitted_by, kind, requested_price_ugx, note, snapshot, checklist, link_report)
  values (p_course, me, k, c.requested_price_ugx, left(p_note, 1000), app.course_tree(p_course), chk, app.course_link_report(p_course))
  returning id into sid;
  -- a live course stays live while its update is reviewed (new lessons stay hidden: approved = false)
  if c.status <> 'published' then
    update public.courses set status = 'pending_review' where id = p_course;
  end if;
  perform app.audit_action('course.submit', 'courses', p_course::text, jsonb_build_object('submission', sid, 'kind', k));
  return jsonb_build_object('submission_id', sid, 'status', 'pending', 'kind', k);
end;
$$;

create or replace function public.withdraw_course_submission(p_course uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); c public.courses;
begin
  select * into c from public.courses where id = p_course for update;
  if not found or c.tutor_id is distinct from me then raise exception 'not your course' using errcode = '42501'; end if;
  update public.course_submissions set status = 'withdrawn' where course_id = p_course and status = 'pending';
  if not found then raise exception 'nothing to withdraw' using errcode = '22023'; end if;
  if c.status = 'pending_review' then update public.courses set status = 'draft' where id = p_course; end if;
  perform app.audit_action('course.withdraw', 'courses', p_course::text, '{}'::jsonb);
  return jsonb_build_object('status', case when c.status = 'pending_review' then 'draft' else c.status::text end);
end;
$$;

-- Reorder modules and lessons in one call: p_modules = ordered module ids,
-- p_lessons = {"<module id>": ["<lesson id>", ...]} (lessons may move between
-- modules of the same course).
create or replace function public.reorder_course(p_course uuid, p_modules uuid[], p_lessons jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare st public.content_status; m record; lid uuid; pos int := 0; i int;
begin
  if not (app.is_admin() or (app.is_tutor() and app.owns_course(p_course))) then raise exception 'not your course' using errcode = '42501'; end if;
  select status into st from public.courses where id = p_course;
  if st = 'pending_review' and not app.is_admin() then raise exception 'course is in review: withdraw it to edit' using errcode = '42501'; end if;
  if exists (select 1 from unnest(coalesce(p_modules, '{}')) x where not exists (select 1 from public.course_modules cm where cm.id = x and cm.course_id = p_course))
     or exists (select 1 from jsonb_object_keys(coalesce(p_lessons, '{}')) k where not exists (select 1 from public.course_modules cm where cm.id = k::uuid and cm.course_id = p_course)) then
    raise exception 'module not in course' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(coalesce(p_lessons, '{}')) e, jsonb_array_elements_text(e.value) v
             where not exists (select 1 from public.lessons l where l.id = v::uuid and l.course_id = p_course)) then
    raise exception 'lesson not in course' using errcode = '22023';
  end if;
  -- modules: listed ones first in the given order, any others after in their current order
  update public.course_modules set position = position + 100000 where course_id = p_course;
  i := 0;
  for m in select cm.id from public.course_modules cm where cm.course_id = p_course
           order by array_position(coalesce(p_modules, '{}'), cm.id) nulls last, cm.position loop
    update public.course_modules set position = i where id = m.id; i := i + 1;
  end loop;
  -- lessons: move listed lessons into their module, then renumber the whole course in module order
  for m in select key, value from jsonb_each(coalesce(p_lessons, '{}')) loop
    update public.lessons set module_id = m.key::uuid where course_id = p_course and id in (select v::uuid from jsonb_array_elements_text(m.value) v);
  end loop;
  update public.lessons set position = position + 100000 where course_id = p_course;
  for m in select l.id from public.lessons l left join public.course_modules cm on cm.id = l.module_id where l.course_id = p_course
           order by cm.position nulls last,
                    (select o.ord from jsonb_array_elements_text(coalesce(p_lessons -> l.module_id::text, '[]')) with ordinality o(v, ord) where o.v::uuid = l.id) nulls last,
                    l.position loop
    update public.lessons set position = pos where id = m.id; pos := pos + 1;
  end loop;
end;
$$;

-- Quiz grading: answers never leave the server. Callers who can see the lesson
-- (enrolled learner, preview lesson, owner, admin) may grade.
create or replace function public.grade_lesson_quiz(p_lesson uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.lessons; c public.courses; key jsonb; n int; ok int := 0; res jsonb := '[]'; i int;
begin
  select * into l from public.lessons where id = p_lesson and kind = 'quiz';
  if not found then raise exception 'quiz not found' using errcode = 'P0002'; end if;
  select * into c from public.courses where id = l.course_id;
  if not (app.is_admin() or app.owns_course(l.course_id)
          or (l.approved and c.status = 'published' and c.deleted_at is null and (l.is_preview or app.is_enrolled(l.course_id)))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select answers into key from public.lesson_quiz_keys where lesson_id = p_lesson;
  if key is null then raise exception 'quiz has no answer key' using errcode = '22023'; end if;
  n := jsonb_array_length(key);
  for i in 0 .. n - 1 loop
    res := res || to_jsonb((p_answers -> i) = (key -> i));
    if (p_answers -> i) = (key -> i) then ok := ok + 1; end if;
  end loop;
  return jsonb_build_object('score', ok, 'total', n, 'correct', res);
end;
$$;

-- ---------------------------------------------------------- admin RPCs ----
create or replace function public.admin_review_course_submission(p_submission uuid, p_decision text, p_reason text default null, p_price_ugx bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); s public.course_submissions; c public.courses; price bigint;
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  select * into s from public.course_submissions where id = p_submission for update;
  if not found or s.status <> 'pending' then raise exception 'submission is not pending' using errcode = '22023'; end if;
  select * into c from public.courses where id = s.course_id for update;
  if p_decision = 'approved' then
    price := coalesce(p_price_ugx, s.requested_price_ugx, c.price_ugx, 0);
    if price <> 0 and price < 1000 then raise exception 'paid courses cost at least UGX 1,000' using errcode = '22023'; end if;
    update public.courses set status = 'published', published_at = coalesce(published_at, now()), reviewed_by = me, review_note = null,
           is_free = (price = 0), price_ugx = price, price_reviewed_at = now(), requested_price_ugx = null
     where id = c.id;
    update public.course_modules set approved = true where course_id = c.id;
    update public.lessons set approved = true where course_id = c.id;
    update public.course_submissions set status = 'approved', approved_price_ugx = price, reviewed_by = me, reviewed_at = now(), reason = p_reason where id = s.id;
    perform app.notify(s.submitted_by, 'tutor.course_approved', 'Course approved: ' || c.title,
      case when price = 0 then 'It is live and free.' else 'It is live at UGX ' || to_char(price, 'FM999,999,999') || '.' end,
      '/builder.html?id=' || c.id, jsonb_build_object('course_id', c.id));
  elsif p_decision = 'rejected' then
    if char_length(coalesce(trim(p_reason), '')) < 5 then raise exception 'give the tutor a reason (5+ characters)' using errcode = '22023'; end if;
    if c.status = 'pending_review' then
      update public.courses set status = 'rejected', review_note = left(p_reason, 2000), reviewed_by = me where id = c.id;
    end if;
    update public.course_submissions set status = 'rejected', reason = left(p_reason, 2000), reviewed_by = me, reviewed_at = now() where id = s.id;
    perform app.notify(s.submitted_by, 'tutor.course_rejected', 'Changes needed: ' || c.title, left(p_reason, 500),
      '/builder.html?id=' || c.id, jsonb_build_object('course_id', c.id));
  else
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  perform app.audit_action('course.review', 'courses', c.id::text, jsonb_build_object('submission', s.id, 'decision', p_decision, 'price_ugx', price, 'reason', p_reason));
  return jsonb_build_object('submission_id', s.id, 'status', p_decision, 'price_ugx', price);
end;
$$;

-- Admin makes any course free (0) or paid (>= 1000) directly.
create or replace function public.admin_set_course_price(p_course uuid, p_price_ugx bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  if p_price_ugx is null or p_price_ugx < 0 or (p_price_ugx > 0 and p_price_ugx < 1000) or p_price_ugx > 100000000 then
    raise exception 'price must be 0 (free) or UGX 1,000 – 100,000,000' using errcode = '22023';
  end if;
  update public.courses set is_free = (p_price_ugx = 0), price_ugx = p_price_ugx, price_reviewed_at = now() where id = p_course;
  if not found then raise exception 'course not found' using errcode = 'P0002'; end if;
  perform app.audit_action('course.price', 'courses', p_course::text, jsonb_build_object('price_ugx', p_price_ugx));
end;
$$;

-- ---------------------------------------------------------- dashboards ----
create or replace function public.learner_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me text := app.requesting_user_id();
begin
  if me is null then raise exception 'sign in required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'enrollments', (select coalesce(jsonb_agg(x order by x.last_activity_at desc nulls last), '[]') from (
        select e.course_id, c.slug, c.title, c.cover_url, e.status, e.progress_pct, e.enrolled_at, e.completed_at,
               coalesce(e.last_activity_at, e.enrolled_at) as last_activity_at,
               (select count(*) from public.lessons l where l.course_id = c.id and l.approved) as lessons_total,
               (select count(*) from public.lesson_progress p where p.course_id = c.id and p.user_id = me) as lessons_done,
               (select jsonb_build_object('id', l.id, 'title', l.title) from public.lessons l
                  left join public.course_modules m on m.id = l.module_id
                 where l.course_id = c.id and l.approved
                   and not exists (select 1 from public.lesson_progress p where p.lesson_id = l.id and p.user_id = me)
                 order by coalesce(m.position, -1), l.position limit 1) as next_lesson
          from public.enrollments e join public.courses c on c.id = e.course_id
         where e.user_id = me and e.status in ('active','completed')) x),
    'counts', jsonb_build_object(
        'enrolled',     (select count(*) from public.enrollments e where e.user_id = me and e.status in ('active','completed')),
        'completed',    (select count(*) from public.enrollments e where e.user_id = me and e.status = 'completed'),
        'certificates', (select count(*) from public.certificates ce where ce.user_id = me and ce.revoked_at is null),
        'saved',        (select count(*) from public.bookmarks b where b.user_id = me)),
    'certificates', (select coalesce(jsonb_agg(jsonb_build_object('id', ce.id, 'title', ce.title, 'verify_code', ce.verify_code, 'issued_at', ce.issued_at) order by ce.issued_at desc), '[]')
                       from public.certificates ce where ce.user_id = me and ce.revoked_at is null),
    'saved', (select coalesce(jsonb_agg(jsonb_build_object('kind', b.kind, 'ref_id', b.ref_id, 'created_at', b.created_at) order by b.created_at desc), '[]')
                from (select * from public.bookmarks where user_id = me order by created_at desc limit 12) b),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'duration_minutes', s.duration_minutes, 'kind', s.kind, 'booking_status', b.status) order by s.starts_at), '[]')
                   from public.session_bookings b join public.tutor_sessions s on s.id = b.session_id
                  where b.learner_id = me and s.starts_at > now() - interval '1 hour' and b.status::text in ('confirmed','pending_payment')),
    'streak', (select jsonb_build_object('current', us.current_streak, 'longest', us.longest_streak) from public.user_stats us where us.user_id = me),
    'active_days_7', (select count(*) from public.user_activity_daily d where d.user_id = me and d.day > (now() at time zone 'Africa/Kampala')::date - 7),
    'plan', coalesce((select sp.code from public.subscriptions su join public.subscription_plans sp on sp.id = su.plan_id
                       where su.user_id = me and su.status in ('active','past_due') limit 1), 'free'));
end;
$$;

-- Extended tutor dashboard: same keys as before plus kpis, learners, payouts,
-- per-course review state. Real rows only.
create or replace function public.tutor_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me text := app.requesting_user_id();
begin
  if not app.is_tutor() then raise exception 'verified tutors only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'wallet', public.my_wallet(),
    'kpis', jsonb_build_object(
        'active_learners', (select count(distinct e.user_id) from public.enrollments e join public.courses c on c.id = e.course_id
                             where c.tutor_id = me and e.status = 'active'),
        'courses',         (select count(*) from public.courses c where c.tutor_id = me and c.deleted_at is null),
        'earnings_month_ugx', coalesce((select sum(payee_share_ugx) from public.payments where payee_id = me
                             and status in ('successful','partially_refunded') and verified_at >= date_trunc('month', now() at time zone 'Africa/Kampala')), 0),
        'rating_avg',      coalesce((select rating_avg from public.tutor_profiles where user_id = me), 0),
        'rating_count',    coalesce((select rating_count from public.tutor_profiles where user_id = me), 0)),
    'courses', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'title', c.title, 'status', c.status, 'review_note', c.review_note,
                 'is_free', c.is_free, 'price_ugx', c.price_ugx, 'requested_price_ugx', c.requested_price_ugx,
                 'enrollments', c.enrollments_count, 'updated_at', c.updated_at,
                 'completions', (select count(*) from public.enrollments e where e.course_id = c.id and e.status = 'completed'),
                 'avg_progress', (select round(avg(progress_pct), 1) from public.enrollments e where e.course_id = c.id),
                 'modules', (select count(*) from public.course_modules m where m.course_id = c.id),
                 'lessons', (select count(*) from public.lessons l where l.course_id = c.id),
                 'pending_submission', exists (select 1 from public.course_submissions s where s.course_id = c.id and s.status = 'pending'),
                 'rating', c.rating_avg) order by c.updated_at desc), '[]') from public.courses c where c.tutor_id = me and c.deleted_at is null),
    'learners', (select coalesce(jsonb_agg(x order by x.last_activity_at desc nulls last), '[]') from (
        select p.display_name as name, c.title as course, e.progress_pct as progress, coalesce(e.last_activity_at, e.enrolled_at) as last_activity_at
          from public.enrollments e join public.courses c on c.id = e.course_id join public.profiles p on p.id = e.user_id
         where c.tutor_id = me and e.status in ('active','completed') order by coalesce(e.last_activity_at, e.enrolled_at) desc limit 50) x),
    'earnings_by_month', (select coalesce(jsonb_agg(x order by x.month), '[]') from (
        select date_trunc('month', verified_at)::date as month, sum(payee_share_ugx) as earnings_ugx, count(*) as sales
          from public.payments where payee_id = me and status in ('successful','partially_refunded') group by 1) x),
    'payouts', (select coalesce(jsonb_agg(jsonb_build_object('id', po.id, 'amount_ugx', po.amount_ugx, 'status', po.status, 'created_at', po.created_at) order by po.created_at desc), '[]')
                  from (select * from public.payouts where tutor_id = me order by created_at desc limit 20) po),
    'upcoming_sessions', (select coalesce(jsonb_agg(to_jsonb(s) order by s.starts_at), '[]') from public.tutor_sessions s where s.tutor_id = me and s.starts_at > now()),
    'rating', (select jsonb_build_object('avg', rating_avg, 'count', rating_count) from public.tutor_profiles where user_id = me));
end;
$$;

-- -------------------------------------------------------------- grants ----
revoke execute on function app.course_tree(uuid), app.course_checklist(uuid), app.course_link_report(uuid) from public, anon, authenticated;
grant execute on function app.link_verdict(text) to authenticated, service_role;
revoke execute on function public.submit_course_for_review(uuid, text), public.withdraw_course_submission(uuid),
  public.reorder_course(uuid, uuid[], jsonb), public.grade_lesson_quiz(uuid, jsonb),
  public.admin_review_course_submission(uuid, text, text, bigint), public.admin_set_course_price(uuid, bigint),
  public.learner_dashboard(), public.tutor_dashboard() from public, anon;
grant execute on function public.submit_course_for_review(uuid, text), public.withdraw_course_submission(uuid),
  public.reorder_course(uuid, uuid[], jsonb), public.grade_lesson_quiz(uuid, jsonb),
  public.admin_review_course_submission(uuid, text, text, bigint), public.admin_set_course_price(uuid, bigint),
  public.learner_dashboard(), public.tutor_dashboard() to authenticated;

-- audit trail for the new tables (same trigger as the other content tables)
drop trigger if exists audit_course_submissions on public.course_submissions;
create trigger audit_course_submissions after insert or update or delete on public.course_submissions for each row execute function app.audit_row();
