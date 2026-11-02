-- =============================================================================
-- Practice & articles (GeeksforGeeks-style): topic tree, member-written
-- articles with editorial review + versioning, coding problems with hidden
-- tests, server-side judged submissions, problem of the day + streaks,
-- timed contests (ICPC / IOI) with live leaderboard + plagiarism flags,
-- MCQ quizzes (answer keys never client-readable), interview prep sets,
-- bookmarks, per-topic progress and coding score.
-- Secure at commit: RLS on every table, explicit grants only (SR-01/SR-04).
-- =============================================================================

create type public.problem_difficulty as enum ('basic','easy','medium','hard');
create type public.submission_verdict as enum ('pending','running','AC','WA','TLE','MLE','RE','CE','IE');
create type public.contest_scoring   as enum ('icpc','ioi');
create type public.bookmark_kind     as enum ('article','problem','quiz','interview_set','contest');

insert into public.site_settings (key, value, is_public, description) values
  ('practice.score', '{"basic":1,"easy":2,"medium":4,"hard":8}', true, 'Coding score per distinct solved problem by difficulty'),
  ('practice.languages', '["python","javascript","typescript","c","cpp","java","go","rust","csharp","kotlin"]', true, 'Languages the judge accepts')
on conflict (key) do nothing;
update public.site_settings set value = value || '{"problem_solved":5,"potd_solved":10,"article_published":40,"quiz_passed":5}'::jsonb
 where key = 'gamification.xp';

-- ----------------------------------------------------------------- topics ----
create table public.practice_topics (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.practice_topics(id) on delete cascade,
  slug       text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  name       text not null check (char_length(name) between 2 and 80),
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
create index practice_topics_parent_idx on public.practice_topics (parent_id, sort);
alter table public.practice_topics enable row level security;

insert into public.practice_topics (slug, name, sort) values
  ('dsa','Data Structures & Algorithms',1),('web','Web Development',2),('python','Python',3),('ml','Machine Learning & AI',4),
  ('databases','Databases & SQL',5),('system-design','System Design',6),('mobile','Mobile Development',7),('cs-core','CS Fundamentals',8),
  ('cp','Competitive Programming',9),('devops','DevOps & Cloud',10);
insert into public.practice_topics (parent_id, slug, name, sort)
select t.id, x.slug, x.name, x.sort from public.practice_topics t
join (values ('dsa','arrays','Arrays',1),('dsa','strings','Strings',2),('dsa','linked-list','Linked List',3),('dsa','trees','Trees',4),
             ('dsa','graphs','Graphs',5),('dsa','dynamic-programming','Dynamic Programming',6),('dsa','sorting-searching','Sorting & Searching',7),
             ('dsa','greedy','Greedy',8),('dsa','recursion','Recursion & Backtracking',9),('dsa','hashing','Hashing',10),
             ('web','html-css','HTML & CSS',1),('web','javascript','JavaScript',2),('web','react','React',3),('web','node','Node.js',4),
             ('ml','numpy-pandas','NumPy & pandas',1),('ml','deep-learning','Deep Learning',2),('ml','llms','LLMs & Prompting',3)) x(parent, slug, name, sort)
  on x.parent = t.slug;

-- Primary-school learners do not see problems tagged for older levels; unlevelled = everyone.
create or replace function app.age_ok_level(p_level public.education_level)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_level is null or not app.caller_is_minor()
      or p_level <= coalesce((select education_level from public.profiles where id = app.requesting_user_id()), 'primary')
$$;

-- --------------------------------------------------------------- articles ----
create table public.articles (
  id              uuid primary key default gen_random_uuid(),
  author_id       text not null references public.profiles(id) on delete cascade,
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,100}$'),
  title           text not null check (char_length(title) between 5 and 160),
  summary         text check (char_length(summary) <= 400),
  body_md         text not null default '' check (char_length(body_md) <= 200000),
  topic_id        uuid references public.practice_topics(id) on delete set null,
  tags            text[] not null default '{}' check (cardinality(tags) <= 10),
  level           public.education_level,
  status          public.content_status not null default 'draft',
  version         int not null default 1,
  reviewer_id     text references public.profiles(id) on delete set null,
  review_note     text check (char_length(review_note) <= 2000),
  published_at    timestamptz,
  views_count     int not null default 0,
  search          tsvector generated always as (
                    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                    setweight(to_tsvector('english', coalesce(summary,'') || ' ' || app.tags_to_text(tags)), 'B') ||
                    setweight(to_tsvector('english', left(coalesce(body_md,''), 100000)), 'C')) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index articles_search_idx on public.articles using gin (search);
create index articles_topic_idx on public.articles (topic_id, published_at desc) where status = 'published';
create index articles_author_idx on public.articles (author_id, updated_at desc);
create trigger articles_updated_at before update on public.articles for each row execute function app.set_updated_at();
alter table public.articles enable row level security;

create table public.article_versions (
  article_id  uuid not null references public.articles(id) on delete cascade,
  version     int not null,
  title       text not null,
  body_md     text not null,
  editor_id   text references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (article_id, version)
);
alter table public.article_versions enable row level security;

-- Authors may only move their own article between draft and pending_review;
-- publishing/rejecting is editorial (admin_review_article). Each body/title
-- change snapshots the previous version.
create or replace function app.guard_article()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not app.is_admin() then
      new.author_id := app.requesting_user_id();
      if new.status not in ('draft','pending_review') then new.status := 'draft'; end if;
      new.reviewer_id := null; new.review_note := null; new.published_at := null; new.views_count := 0;
    end if;
    new.version := 1;
    return new;
  end if;
  if not (app.is_admin() or app.is_backend()) then
    if new.author_id <> old.author_id or new.reviewer_id is distinct from old.reviewer_id
       or new.review_note is distinct from old.review_note or new.published_at is distinct from old.published_at
       or new.views_count <> old.views_count then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and new.status not in ('draft','pending_review','archived') then
      raise exception 'only editors can publish' using errcode = '42501';
    end if;
    -- editing a published article sends it back to review
    if old.status = 'published' and (new.body_md <> old.body_md or new.title <> old.title) then
      new.status := 'pending_review';
    end if;
  end if;
  if new.body_md <> old.body_md or new.title <> old.title then
    insert into public.article_versions (article_id, version, title, body_md, editor_id)
    values (old.id, old.version, old.title, old.body_md, app.requesting_user_id()) on conflict do nothing;
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
create trigger articles_guard before insert or update on public.articles for each row execute function app.guard_article();

create or replace function public.admin_review_article(p_article uuid, p_decision text, p_note text default null)
returns public.articles language plpgsql security definer set search_path = '' as $$
declare a public.articles;
begin
  perform app.require_admin();
  if p_decision not in ('publish','reject','archive') then raise exception 'bad decision' using errcode = '22023'; end if;
  update public.articles set
    status = case p_decision when 'publish' then 'published'::public.content_status when 'reject' then 'rejected' else 'archived' end,
    reviewer_id = app.requesting_user_id(), review_note = p_note,
    published_at = case when p_decision = 'publish' then coalesce(published_at, now()) else published_at end
  where id = p_article returning * into a;
  if a.id is null then raise exception 'article not found' using errcode = 'P0002'; end if;
  if p_decision = 'publish' then perform app.award_xp(a.author_id, 'article_published', a.id::text); end if;
  perform app.audit_action('admin.review_article', 'articles', a.id::text, jsonb_build_object('decision', p_decision));
  return a;
end;
$$;

-- --------------------------------------------------------------- problems ----
create table public.problems (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,100}$'),
  title            text not null check (char_length(title) between 3 and 160),
  statement_md     text not null check (char_length(statement_md) <= 50000),
  input_format_md  text check (char_length(input_format_md) <= 10000),
  output_format_md text check (char_length(output_format_md) <= 10000),
  constraints_md   text check (char_length(constraints_md) <= 5000),
  difficulty       public.problem_difficulty not null default 'easy',
  topic_ids        uuid[] not null default '{}',
  tags             text[] not null default '{}',
  company_tags     text[] not null default '{}' check (cardinality(company_tags) <= 30),
  starter_code     jsonb not null default '{}' check (jsonb_typeof(starter_code) = 'object'),  -- {"python":"def solve(...)", ...}
  languages        text[] not null default '{python,javascript,cpp,java,c}',
  time_limit_ms    int not null default 2000 check (time_limit_ms between 100 and 20000),
  memory_limit_kb  int not null default 262144 check (memory_limit_kb between 16384 and 1048576),
  level            public.education_level,
  status           public.content_status not null default 'draft',
  author_id        text references public.profiles(id) on delete set null,
  solved_count     int not null default 0,
  attempts_count   int not null default 0,
  search           tsvector generated always as (
                     setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                     setweight(to_tsvector('english', app.tags_to_text(tags) || ' ' || app.tags_to_text(company_tags)), 'B') ||
                     setweight(to_tsvector('english', left(statement_md, 20000)), 'C')) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index problems_search_idx on public.problems using gin (search);
create index problems_topics_idx on public.problems using gin (topic_ids);
create index problems_company_idx on public.problems using gin (company_tags);
create index problems_difficulty_idx on public.problems (difficulty) where status = 'published';
create trigger problems_updated_at before update on public.problems for each row execute function app.set_updated_at();
alter table public.problems enable row level security;

-- Editorials + hints live apart from the statement so they can be hidden
-- while a problem is in a live/upcoming contest (and from the AI helpers).
create table public.problem_editorials (
  problem_id   uuid primary key references public.problems(id) on delete cascade,
  editorial_md text not null check (char_length(editorial_md) <= 100000),
  solution_code jsonb not null default '{}',
  updated_at   timestamptz not null default now()
);
alter table public.problem_editorials enable row level security;

create table public.problem_hints (
  id         uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(id) on delete cascade,
  ord        int not null default 1,
  body_md    text not null check (char_length(body_md) <= 4000),
  unique (problem_id, ord)
);
alter table public.problem_hints enable row level security;

-- Sample cases are public with the problem; hidden cases are author/admin/judge only.
create table public.test_cases (
  id              uuid primary key default gen_random_uuid(),
  problem_id      uuid not null references public.problems(id) on delete cascade,
  ord             int not null default 1,
  input           text not null check (octet_length(input) <= 5000000),
  expected_output text not null check (octet_length(expected_output) <= 5000000),
  is_sample       boolean not null default false,
  weight          int not null default 1 check (weight between 0 and 100),
  explanation_md  text,
  unique (problem_id, ord)
);
create index test_cases_problem_idx on public.test_cases (problem_id, ord);
alter table public.test_cases enable row level security;

-- --------------------------------------------------------------- contests ----
create table public.contests (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  title            text not null check (char_length(title) between 3 and 140),
  description_md   text check (char_length(description_md) <= 20000),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  scoring          public.contest_scoring not null default 'icpc',
  penalty_minutes  int not null default 20 check (penalty_minutes between 0 and 60),
  freeze_minutes   int not null default 0 check (freeze_minutes between 0 and 300),
  level            public.education_level,
  status           public.content_status not null default 'draft',
  created_by       text references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '14 days')
);
alter table public.contests enable row level security;

create table public.contest_problems (
  contest_id uuid not null references public.contests(id) on delete cascade,
  problem_id uuid not null references public.problems(id) on delete cascade,
  label      text not null check (label ~ '^[A-Z][0-9]?$'),
  points     int not null default 100 check (points between 1 and 10000),
  primary key (contest_id, problem_id),
  unique (contest_id, label)
);
alter table public.contest_problems enable row level security;

create table public.contest_registrations (
  contest_id    uuid not null references public.contests(id) on delete cascade,
  user_id       text not null references public.profiles(id) on delete cascade,
  registered_at timestamptz not null default now(),
  disqualified  boolean not null default false,
  primary key (contest_id, user_id)
);
alter table public.contest_registrations enable row level security;

-- True while a problem belongs to a contest that has not ended yet (upcoming or live).
create or replace function app.problem_contest_locked(p_problem uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contest_problems cp join public.contests c on c.id = cp.contest_id
                  where cp.problem_id = p_problem and c.ends_at > now() and c.status <> 'archived')
$$;

create or replace function app.can_view_problem(p_problem uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.problems p where p.id = p_problem and (
      app.is_admin() or p.author_id = app.requesting_user_id()
      or (p.status = 'published' and app.age_ok_level(p.level) and (
            not app.problem_contest_locked(p.id)
            or exists (select 1 from public.contest_problems cp join public.contests c on c.id = cp.contest_id
                       join public.contest_registrations r on r.contest_id = c.id and r.user_id = app.requesting_user_id()
                        where cp.problem_id = p.id and now() between c.starts_at and c.ends_at))))
  )
$$;

-- Editorial / hints / AI "explain the solution": never while a contest containing it is upcoming or live.
create or replace function app.can_view_solution(p_problem uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.is_admin()
      or exists (select 1 from public.problems p where p.id = p_problem and p.author_id = app.requesting_user_id())
      or (app.can_view_problem(p_problem) and not app.problem_contest_locked(p_problem))
$$;

-- ------------------------------------------------------------ submissions ----
create table public.submissions (
  id               uuid primary key default gen_random_uuid(),
  user_id          text not null references public.profiles(id) on delete cascade,
  problem_id       uuid not null references public.problems(id) on delete cascade,
  contest_id       uuid references public.contests(id) on delete set null,
  language         text not null,
  code             text not null check (octet_length(code) between 1 and 65536),
  verdict          public.submission_verdict not null default 'pending',
  passed           int not null default 0,
  total            int not null default 0,
  score            numeric(8,2) not null default 0,
  runtime_ms       int,
  memory_kb        int,
  compile_output   text check (char_length(compile_output) <= 8000),
  judge_ref        text,
  plagiarism_score numeric(4,3),
  created_at       timestamptz not null default now(),
  judged_at        timestamptz
);
create index submissions_user_idx on public.submissions (user_id, created_at desc);
create index submissions_problem_idx on public.submissions (problem_id, verdict);
create index submissions_contest_idx on public.submissions (contest_id, user_id, problem_id, created_at) where contest_id is not null;
create index submissions_pending_idx on public.submissions (created_at) where verdict in ('pending','running');
alter table public.submissions enable row level security;

create table public.plagiarism_flags (
  id          uuid primary key default gen_random_uuid(),
  contest_id  uuid references public.contests(id) on delete cascade,
  problem_id  uuid not null references public.problems(id) on delete cascade,
  sub_a       uuid not null references public.submissions(id) on delete cascade,
  sub_b       uuid not null references public.submissions(id) on delete cascade,
  similarity  numeric(4,3) not null,
  status      text not null default 'open' check (status in ('open','dismissed','confirmed')),
  reviewed_by text references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (sub_a, sub_b)
);
alter table public.plagiarism_flags enable row level security;

-- ------------------------------------------- POTD, streaks, progress, score ----
create table public.problem_of_the_day (
  day        date primary key,
  problem_id uuid not null references public.problems(id) on delete cascade
);
alter table public.problem_of_the_day enable row level security;

create table public.practice_stats (
  user_id        text primary key references public.profiles(id) on delete cascade,
  coding_score   int not null default 0,
  solved_total   int not null default 0,
  solved_basic   int not null default 0,
  solved_easy    int not null default 0,
  solved_medium  int not null default 0,
  solved_hard    int not null default 0,
  potd_streak    int not null default 0,
  potd_best      int not null default 0,
  potd_last_day  date,
  updated_at     timestamptz not null default now()
);
create index practice_stats_score_idx on public.practice_stats (coding_score desc);
alter table public.practice_stats enable row level security;

create table public.practice_solved (
  user_id    text not null references public.profiles(id) on delete cascade,
  problem_id uuid not null references public.problems(id) on delete cascade,
  first_ac   uuid references public.submissions(id) on delete set null,
  solved_at  timestamptz not null default now(),
  primary key (user_id, problem_id)
);
alter table public.practice_solved enable row level security;

-- ------------------------------------------------------------- quizzes/MCQ ----
create table public.quizzes (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  title         text not null check (char_length(title) between 3 and 140),
  topic_id      uuid references public.practice_topics(id) on delete set null,
  level         public.education_level,
  time_limit_s  int check (time_limit_s between 30 and 10800),
  pass_pct      int not null default 60 check (pass_pct between 1 and 100),
  status        public.content_status not null default 'draft',
  author_id     text references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
alter table public.quizzes enable row level security;

create table public.quiz_questions (
  id         uuid primary key default gen_random_uuid(),
  quiz_id    uuid not null references public.quizzes(id) on delete cascade,
  ord        int not null default 1,
  prompt_md  text not null check (char_length(prompt_md) <= 8000),
  options    jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8),
  multi      boolean not null default false,
  unique (quiz_id, ord)
);
alter table public.quiz_questions enable row level security;

-- Answer keys: never selectable by learners; graded in submit_quiz.
create table public.quiz_answer_keys (
  question_id    uuid primary key references public.quiz_questions(id) on delete cascade,
  correct        int[] not null check (cardinality(correct) >= 1),
  explanation_md text check (char_length(explanation_md) <= 8000)
);
alter table public.quiz_answer_keys enable row level security;

create table public.quiz_attempts (
  id          uuid primary key default gen_random_uuid(),
  quiz_id     uuid not null references public.quizzes(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  answers     jsonb not null,
  score_pct   int not null,
  passed      boolean not null,
  created_at  timestamptz not null default now()
);
create index quiz_attempts_user_idx on public.quiz_attempts (user_id, created_at desc);
alter table public.quiz_attempts enable row level security;

-- ------------------------------------------------- interview prep + bookmarks ----
create table public.interview_sets (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  title       text not null,
  company     text,
  description_md text,
  status      public.content_status not null default 'draft',
  created_at  timestamptz not null default now()
);
alter table public.interview_sets enable row level security;
create table public.interview_set_items (
  set_id     uuid not null references public.interview_sets(id) on delete cascade,
  problem_id uuid references public.problems(id) on delete cascade,
  article_id uuid references public.articles(id) on delete cascade,
  ord        int not null default 1,
  check ((problem_id is null) <> (article_id is null)),
  unique (set_id, ord)
);
alter table public.interview_set_items enable row level security;

create table public.bookmarks (
  user_id    text not null references public.profiles(id) on delete cascade,
  kind       public.bookmark_kind not null,
  ref_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id)
);
alter table public.bookmarks enable row level security;

-- ===================================================================== RPCs ====
-- Learner submits code. Contest submissions only inside the window for registrants.
create or replace function public.submit_solution(p_problem uuid, p_language text, p_code text, p_contest uuid default null)
returns public.submissions language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); s public.submissions; langs text[];
begin
  if me is null or not app.is_member() then raise exception 'members only' using errcode = '42501'; end if;
  if not app.can_view_problem(p_problem) then raise exception 'problem not found' using errcode = 'P0002'; end if;
  select languages into langs from public.problems where id = p_problem;
  if not (p_language = any(langs)) then raise exception 'language not allowed' using errcode = '22023'; end if;
  if p_contest is not null and not exists (
       select 1 from public.contests c join public.contest_problems cp on cp.contest_id = c.id and cp.problem_id = p_problem
       join public.contest_registrations r on r.contest_id = c.id and r.user_id = me and not r.disqualified
        where c.id = p_contest and now() between c.starts_at and c.ends_at) then
    raise exception 'contest not running or not registered' using errcode = '42501';
  end if;
  -- anti-flood: max 1 pending submission per user per problem
  if exists (select 1 from public.submissions where user_id = me and problem_id = p_problem and verdict in ('pending','running')
              and created_at > now() - interval '2 minutes') then
    raise exception 'previous submission still judging' using errcode = 'P0001';
  end if;
  insert into public.submissions (user_id, problem_id, contest_id, language, code)
  values (me, p_problem, p_contest, p_language, p_code) returning * into s;
  update public.problems set attempts_count = attempts_count + 1 where id = p_problem;
  return s;
end;
$$;

-- Judge runner (service role): everything needed to run a submission, incl. hidden tests.
create or replace function public.judge_payload(p_submission uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.submissions; p public.problems;
begin
  perform app.require_backend();
  select * into s from public.submissions where id = p_submission;
  if s.id is null then raise exception 'submission not found' using errcode = 'P0002'; end if;
  select * into p from public.problems where id = s.problem_id;
  update public.submissions set verdict = 'running' where id = s.id and verdict = 'pending';
  return jsonb_build_object('submission_id', s.id, 'language', s.language, 'code', s.code,
    'time_limit_ms', p.time_limit_ms, 'memory_limit_kb', p.memory_limit_kb,
    'tests', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'input', t.input, 'expected', t.expected_output, 'weight', t.weight) order by t.ord)
                         from public.test_cases t where t.problem_id = p.id), '[]'));
end;
$$;

-- Judge runner (service role) records the verdict; on first AC updates stats, score, POTD streak, XP.
create or replace function public.judge_record_result(p_submission uuid, p_verdict public.submission_verdict, p_passed int, p_total int,
  p_score numeric default null, p_runtime_ms int default null, p_memory_kb int default null, p_compile_output text default null, p_judge_ref text default null)
returns public.submissions language plpgsql security definer set search_path = '' as $$
declare s public.submissions; p public.problems; pts int; today date := (now() at time zone 'Africa/Kampala')::date; st public.practice_stats;
begin
  perform app.require_backend();
  update public.submissions set verdict = p_verdict, passed = p_passed, total = p_total,
         score = coalesce(p_score, case when p_total > 0 then round(100.0 * p_passed / p_total, 2) else 0 end),
         runtime_ms = p_runtime_ms, memory_kb = p_memory_kb, compile_output = left(p_compile_output, 8000), judge_ref = p_judge_ref, judged_at = now()
   where id = p_submission and verdict in ('pending','running') returning * into s;
  if s.id is null then raise exception 'submission not found or already judged' using errcode = 'P0002'; end if;
  if s.verdict <> 'AC' then return s; end if;
  insert into public.practice_solved (user_id, problem_id, first_ac) values (s.user_id, s.problem_id, s.id) on conflict do nothing;
  if not found then return s; end if;
  select * into p from public.problems where id = s.problem_id;
  update public.problems set solved_count = solved_count + 1 where id = p.id;
  pts := coalesce((app.setting('practice.score') ->> p.difficulty::text)::int, 0);
  insert into public.practice_stats as x (user_id) values (s.user_id) on conflict (user_id) do nothing;
  update public.practice_stats set coding_score = coding_score + pts, solved_total = solved_total + 1,
         solved_basic = solved_basic + (p.difficulty = 'basic')::int, solved_easy = solved_easy + (p.difficulty = 'easy')::int,
         solved_medium = solved_medium + (p.difficulty = 'medium')::int, solved_hard = solved_hard + (p.difficulty = 'hard')::int,
         updated_at = now()
   where user_id = s.user_id returning * into st;
  perform app.award_xp(s.user_id, 'problem_solved', p.id::text);
  if exists (select 1 from public.problem_of_the_day where day = today and problem_id = p.id) then
    update public.practice_stats set
      potd_streak = case when potd_last_day = today then potd_streak when potd_last_day = today - 1 then potd_streak + 1 else 1 end,
      potd_best = greatest(potd_best, case when potd_last_day = today then potd_streak when potd_last_day = today - 1 then potd_streak + 1 else 1 end),
      potd_last_day = today
     where user_id = s.user_id;
    perform app.award_xp(s.user_id, 'potd_solved', today::text);
  end if;
  return s;
end;
$$;

-- Live leaderboard: ICPC (solved desc, penalty asc) or IOI (sum of best score per problem).
-- Respects the scoreboard freeze for non-admins.
create or replace function public.contest_leaderboard(p_contest uuid, p_limit int default 200)
returns table (rank bigint, user_id text, username text, solved int, penalty_minutes int, score numeric, per_problem jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare c public.contests; cutoff timestamptz;
begin
  select * into c from public.contests where id = p_contest and (status = 'published' or app.is_admin());
  if c.id is null then raise exception 'contest not found' using errcode = 'P0002'; end if;
  cutoff := case when app.is_admin() or now() > c.ends_at then c.ends_at else least(c.ends_at, c.ends_at - make_interval(mins => c.freeze_minutes)) end;
  return query
  with subs as (
    select s.user_id, s.problem_id, s.verdict, s.score, s.created_at
      from public.submissions s join public.contest_registrations r on r.contest_id = c.id and r.user_id = s.user_id and not r.disqualified
     where s.contest_id = c.id and s.created_at between c.starts_at and cutoff and s.verdict not in ('pending','running','CE','IE')
  ), per as (
    select sb.user_id, sb.problem_id,
           min(sb.created_at) filter (where sb.verdict = 'AC') as first_ac,
           count(*) filter (where sb.verdict <> 'AC' and (sb.created_at < (select min(x.created_at) from subs x where x.user_id = sb.user_id and x.problem_id = sb.problem_id and x.verdict = 'AC')
                                                          or not exists (select 1 from subs x where x.user_id = sb.user_id and x.problem_id = sb.problem_id and x.verdict = 'AC'))) as wrong,
           max(sb.score * cp.points / 100.0) as best
      from subs sb join public.contest_problems cp on cp.contest_id = c.id and cp.problem_id = sb.problem_id
     group by sb.user_id, sb.problem_id
  ), agg as (
    select per.user_id,
           count(*) filter (where first_ac is not null)::int as solved,
           coalesce(sum(case when first_ac is not null then floor(extract(epoch from first_ac - c.starts_at) / 60) + wrong * c.penalty_minutes end), 0)::int as pen,
           coalesce(sum(best), 0)::numeric as sc,
           jsonb_object_agg(cp.label, jsonb_build_object('ac', first_ac is not null, 'tries', wrong + (first_ac is not null)::int, 'best', round(best, 2))) as pp
      from per join public.contest_problems cp on cp.contest_id = c.id and cp.problem_id = per.problem_id
     group by per.user_id
  )
  select case when c.scoring = 'icpc' then rank() over (order by a.solved desc, a.pen asc) else rank() over (order by a.sc desc) end,
         a.user_id, pr.username, a.solved, a.pen, round(a.sc, 2), a.pp
    from agg a join public.profiles pr on pr.id = a.user_id
   order by 1, a.user_id limit least(coalesce(p_limit, 200), 1000);
end;
$$;

-- Token-similarity plagiarism check (Jaccard over 4-gram token shingles, comments/whitespace/identifiers-case stripped).
create or replace function app.code_shingles(p_code text)
returns text[] language sql immutable set search_path = '' as $$
  with toks as (
    select array_remove(regexp_split_to_array(lower(regexp_replace(regexp_replace(p_code, '(//[^\n]*|#[^\n]*|/\*.*?\*/)', ' ', 'g'), '"[^"]*"|''[^'']*''', 'S', 'g')), '[^a-z0-9_]+'), '') a
  )
  select coalesce(array_agg(distinct array_to_string(a[i:i+3], ' ')), '{}') from toks, generate_series(1, greatest(cardinality(a) - 3, 1)) i
$$;

create or replace function public.flag_plagiarism(p_contest uuid, p_threshold numeric default 0.85)
returns int language plpgsql security definer set search_path = '' as $$
declare n int := 0; r record;
begin
  if not (app.is_backend() or app.is_admin()) then raise exception 'admins only' using errcode = '42501'; end if;
  for r in
    with best as (
      select distinct on (s.user_id, s.problem_id) s.id, s.user_id, s.problem_id, app.code_shingles(s.code) sh
        from public.submissions s where s.contest_id = p_contest and s.verdict = 'AC' order by s.user_id, s.problem_id, s.created_at
    )
    select a.id ida, b.id idb, a.problem_id,
           (select count(*) from unnest(a.sh) x where x = any(b.sh))::numeric / nullif((select count(distinct y) from unnest(a.sh || b.sh) y), 0) sim
      from best a join best b on a.problem_id = b.problem_id and a.user_id < b.user_id
  loop
    if r.sim >= p_threshold then
      insert into public.plagiarism_flags (contest_id, problem_id, sub_a, sub_b, similarity) values (p_contest, r.problem_id, r.ida, r.idb, round(r.sim, 3))
      on conflict (sub_a, sub_b) do update set similarity = excluded.similarity;
      update public.submissions set plagiarism_score = greatest(coalesce(plagiarism_score, 0), round(r.sim, 3)) where id in (r.ida, r.idb);
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

create or replace function public.register_contest(p_contest uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); c public.contests;
begin
  if me is null or not app.is_member() then raise exception 'members only' using errcode = '42501'; end if;
  select * into c from public.contests where id = p_contest and status = 'published';
  if c.id is null then raise exception 'contest not found' using errcode = 'P0002'; end if;
  if now() > c.ends_at then raise exception 'contest has ended' using errcode = 'P0001'; end if;
  if not app.age_ok_level(c.level) then raise exception 'not eligible for this level' using errcode = '42501'; end if;
  insert into public.contest_registrations (contest_id, user_id) values (c.id, me) on conflict do nothing;
end;
$$;

-- Grades server-side; returns per-question correctness + explanations (keys never leave otherwise).
create or replace function public.submit_quiz(p_quiz uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); qz public.quizzes; total int; right_n int := 0; res jsonb := '[]'; r record; given int[]; pct int;
begin
  if me is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select * into qz from public.quizzes where id = p_quiz and status = 'published' and app.age_ok_level(level);
  if qz.id is null then raise exception 'quiz not found' using errcode = 'P0002'; end if;
  select count(*) into total from public.quiz_questions where quiz_id = qz.id;
  for r in select q.id, k.correct, k.explanation_md from public.quiz_questions q join public.quiz_answer_keys k on k.question_id = q.id where q.quiz_id = qz.id order by q.ord loop
    given := coalesce((select array_agg(x::int order by x::int) from jsonb_array_elements_text(coalesce(p_answers -> r.id::text, '[]')) x), '{}');
    if given = (select array_agg(x order by x) from unnest(r.correct) x) then right_n := right_n + 1; end if;
    res := res || jsonb_build_object('question_id', r.id, 'correct', r.correct, 'given', given, 'explanation_md', r.explanation_md);
  end loop;
  pct := case when total = 0 then 0 else round(100.0 * right_n / total) end;
  insert into public.quiz_attempts (quiz_id, user_id, answers, score_pct, passed) values (qz.id, me, coalesce(p_answers, '{}'), pct, pct >= qz.pass_pct);
  if pct >= qz.pass_pct then perform app.award_xp(me, 'quiz_passed', qz.id::text); end if;
  return jsonb_build_object('score_pct', pct, 'passed', pct >= qz.pass_pct, 'results', res);
end;
$$;

-- Per-topic / per-difficulty progress for the caller.
create or replace function public.my_practice_progress()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'stats', (select to_jsonb(s) - 'user_id' from public.practice_stats s where s.user_id = app.requesting_user_id()),
    'by_topic', coalesce((select jsonb_agg(jsonb_build_object('topic', t.slug, 'name', t.name, 'solved', x.solved, 'total', x.total) order by t.sort)
       from public.practice_topics t
       cross join lateral (select count(*) filter (where ps.user_id is not null) solved, count(*) total
                             from public.problems p left join public.practice_solved ps on ps.problem_id = p.id and ps.user_id = app.requesting_user_id()
                            where p.status = 'published' and t.id = any(p.topic_ids)) x
       where x.total > 0), '[]'),
    'by_difficulty', coalesce((select jsonb_object_agg(d, n) from (
       select p.difficulty::text d, count(*) n from public.practice_solved ps join public.problems p on p.id = ps.problem_id
        where ps.user_id = app.requesting_user_id() group by 1) z), '{}'))
$$;

-- AI helper policy: may the assistant discuss this problem, and may it reveal a full solution?
create or replace function public.practice_ai_policy(p_problem uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('can_view', app.can_view_problem(p_problem),
                            'contest_locked', app.problem_contest_locked(p_problem),
                            'may_reveal_solution', app.can_view_solution(p_problem))
$$;

-- ================================================================= RLS ========
create policy topics_read on public.practice_topics for select to anon, authenticated using (true);
create policy topics_admin on public.practice_topics for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy articles_read on public.articles for select to anon, authenticated
  using ((status = 'published' and app.age_ok_level(level)) or author_id = app.requesting_user_id() or app.is_admin());
create policy articles_insert on public.articles for insert to authenticated with check (app.is_member() and (author_id = app.requesting_user_id() or app.is_admin()));
create policy articles_update on public.articles for update to authenticated
  using (author_id = app.requesting_user_id() or app.is_admin()) with check (author_id = app.requesting_user_id() or app.is_admin());
create policy articles_delete on public.articles for delete to authenticated using ((author_id = app.requesting_user_id() and status = 'draft') or app.is_admin());
create policy article_versions_read on public.article_versions for select to authenticated
  using (exists (select 1 from public.articles a where a.id = article_id and (a.author_id = app.requesting_user_id() or app.is_admin())));

create policy problems_read on public.problems for select to anon, authenticated using (app.can_view_problem(id));
create policy problems_admin on public.problems for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy editorials_read on public.problem_editorials for select to anon, authenticated using (app.can_view_solution(problem_id));
create policy editorials_admin on public.problem_editorials for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy hints_read on public.problem_hints for select to anon, authenticated using (app.can_view_solution(problem_id));
create policy hints_admin on public.problem_hints for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy tests_read_sample on public.test_cases for select to anon, authenticated
  using ((is_sample and app.can_view_problem(problem_id)) or app.is_admin()
         or exists (select 1 from public.problems p where p.id = problem_id and p.author_id = app.requesting_user_id()));
create policy tests_admin on public.test_cases for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy contests_read on public.contests for select to anon, authenticated using (status = 'published' or app.is_admin());
create policy contests_admin on public.contests for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy contest_problems_read on public.contest_problems for select to anon, authenticated
  using (app.is_admin() or exists (select 1 from public.contests c where c.id = contest_id and c.status = 'published' and c.starts_at <= now()));
create policy contest_problems_admin on public.contest_problems for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy contest_regs_read on public.contest_registrations for select to authenticated using (user_id = app.requesting_user_id() or app.is_admin());
create policy contest_regs_admin on public.contest_registrations for update to authenticated using (app.is_admin()) with check (app.is_admin());

create policy submissions_read on public.submissions for select to authenticated using (user_id = app.requesting_user_id() or app.is_admin());
create policy plagiarism_admin on public.plagiarism_flags for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy potd_read on public.problem_of_the_day for select to anon, authenticated using (day <= (now() at time zone 'Africa/Kampala')::date or app.is_admin());
create policy potd_admin on public.problem_of_the_day for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy stats_read on public.practice_stats for select to anon, authenticated using (true);  -- public coding-score leaderboard
create policy solved_read on public.practice_solved for select to authenticated using (user_id = app.requesting_user_id() or app.is_admin());

create policy quizzes_read on public.quizzes for select to anon, authenticated using ((status = 'published' and app.age_ok_level(level)) or app.is_admin());
create policy quizzes_admin on public.quizzes for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy quiz_q_read on public.quiz_questions for select to anon, authenticated
  using (exists (select 1 from public.quizzes z where z.id = quiz_id and ((z.status = 'published' and app.age_ok_level(z.level)) or app.is_admin())));
create policy quiz_q_admin on public.quiz_questions for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy quiz_keys_admin on public.quiz_answer_keys for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy quiz_attempts_read on public.quiz_attempts for select to authenticated using (user_id = app.requesting_user_id() or app.is_admin());

create policy isets_read on public.interview_sets for select to anon, authenticated using (status = 'published' or app.is_admin());
create policy isets_admin on public.interview_sets for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy iset_items_read on public.interview_set_items for select to anon, authenticated
  using (exists (select 1 from public.interview_sets s where s.id = set_id and (s.status = 'published' or app.is_admin())));
create policy iset_items_admin on public.interview_set_items for all to authenticated using (app.is_admin()) with check (app.is_admin());

create policy bookmarks_own on public.bookmarks for all to authenticated
  using (user_id = app.requesting_user_id()) with check (user_id = app.requesting_user_id());

-- ================================================================ grants ======
-- Supabase's implicit table grants are revoked first; everything below is explicit.
revoke all on public.practice_topics, public.articles, public.article_versions, public.problems,
  public.problem_editorials, public.problem_hints, public.test_cases, public.contests, public.contest_problems, public.contest_registrations,
  public.submissions, public.plagiarism_flags, public.problem_of_the_day, public.practice_stats, public.practice_solved, public.quizzes,
  public.quiz_questions, public.quiz_answer_keys, public.quiz_attempts, public.interview_sets, public.interview_set_items, public.bookmarks from anon, authenticated;
grant select on public.practice_topics, public.articles, public.problems, public.problem_editorials, public.problem_hints,
  public.test_cases, public.contests, public.contest_problems, public.problem_of_the_day, public.practice_stats,
  public.quizzes, public.quiz_questions, public.interview_sets, public.interview_set_items to anon, authenticated;
grant select on public.article_versions, public.contest_registrations, public.submissions, public.practice_solved,
  public.quiz_attempts, public.bookmarks, public.plagiarism_flags, public.quiz_answer_keys to authenticated;
grant insert (slug, title, summary, body_md, topic_id, tags, level, status) on public.articles to authenticated;
grant update (slug, title, summary, body_md, topic_id, tags, level, status) on public.articles to authenticated;
grant delete on public.articles to authenticated;
grant insert, delete on public.bookmarks to authenticated;
grant insert, update, delete on public.practice_topics, public.problems, public.problem_editorials, public.problem_hints, public.test_cases,
  public.contests, public.contest_problems, public.problem_of_the_day, public.quizzes, public.quiz_questions, public.quiz_answer_keys,
  public.interview_sets, public.interview_set_items, public.plagiarism_flags to authenticated;   -- RLS: admins only
grant update (disqualified) on public.contest_registrations to authenticated;
grant select, insert, update, delete on public.practice_topics, public.articles, public.article_versions, public.problems,
  public.problem_editorials, public.problem_hints, public.test_cases, public.contests, public.contest_problems, public.contest_registrations,
  public.submissions, public.plagiarism_flags, public.problem_of_the_day, public.practice_stats, public.practice_solved, public.quizzes,
  public.quiz_questions, public.quiz_answer_keys, public.quiz_attempts, public.interview_sets, public.interview_set_items, public.bookmarks to service_role;

grant execute on function app.problem_contest_locked(uuid), app.can_view_problem(uuid), app.can_view_solution(uuid),
  app.age_ok_level(public.education_level) to anon, authenticated, service_role;
grant execute on function app.code_shingles(text) to service_role, authenticated;
grant execute on function public.contest_leaderboard(uuid, int), public.practice_ai_policy(uuid) to anon, authenticated, service_role;
grant execute on function public.submit_solution(uuid, text, text, uuid), public.register_contest(uuid), public.submit_quiz(uuid, jsonb),
  public.my_practice_progress(), public.admin_review_article(uuid, text, text), public.flag_plagiarism(uuid, numeric) to authenticated;
grant execute on function public.judge_payload(uuid),
  public.judge_record_result(uuid, public.submission_verdict, int, int, numeric, int, int, text, text), public.flag_plagiarism(uuid, numeric) to service_role;

select app.enable_rls_all();
