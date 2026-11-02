-- =============================================================================
-- Member projects (+ stars, comments), tools/software catalog, daily news
-- =============================================================================

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner_id        text not null references public.profiles(id) on delete cascade,
  slug            text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null check (char_length(title) between 3 and 140),
  summary         text check (char_length(summary) <= 300),
  description     text check (char_length(description) <= 20000),
  repo_url        text check (repo_url is null or repo_url ~ '^https://'),
  demo_url        text check (demo_url is null or demo_url ~ '^https?://'),
  cover_url       text,
  tech_stack      text[] not null default '{}' check (cardinality(tech_stack) <= 30),
  visibility      public.visibility not null default 'members',
  is_featured     boolean not null default false,
  stars_count     integer not null default 0,
  comments_count  integer not null default 0,
  hidden_at       timestamptz,
  search_tsv      tsvector generated always as (
                    setweight(to_tsvector('english'::regconfig, coalesce(title,'')), 'A') ||
                    setweight(to_tsvector('english'::regconfig, coalesce(summary,'') || ' ' || app.tags_to_text(tech_stack)), 'B') ||
                    setweight(to_tsvector('english'::regconfig, coalesce(description,'')), 'C')
                  ) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (owner_id, slug)
);
create index projects_visibility_idx on public.projects (visibility, created_at desc) where deleted_at is null;
create index projects_stars_idx      on public.projects (stars_count desc) where deleted_at is null;
create index projects_search_idx     on public.projects using gin (search_tsv);
create trigger projects_updated_at before update on public.projects for each row execute function app.set_updated_at();

create table public.project_stars (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_stars_user_idx on public.project_stars (user_id);

create table public.project_comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  author_id   text not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.project_comments(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 5000),
  hidden_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index project_comments_project_idx on public.project_comments (project_id, created_at);
create trigger project_comments_updated_at before update on public.project_comments for each row execute function app.set_updated_at();

create or replace function app.guard_project()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := app.requesting_user_id();
    new.is_featured := false; new.stars_count := 0; new.comments_count := 0; new.hidden_at := null;
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id or new.is_featured is distinct from old.is_featured
     or new.stars_count is distinct from old.stars_count or new.comments_count is distinct from old.comments_count
     or new.hidden_at is distinct from old.hidden_at then
    raise exception 'protected project fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger projects_guard before insert or update on public.projects for each row execute function app.guard_project();

create or replace function app.project_counters()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'project_stars' then
    update public.projects set stars_count = greatest(stars_count + d, 0) where id = coalesce(new.project_id, old.project_id);
  else
    update public.projects set comments_count = greatest(comments_count + d, 0) where id = coalesce(new.project_id, old.project_id);
  end if;
  return null;
end;
$$;
create trigger project_stars_count after insert or delete on public.project_stars for each row execute function app.project_counters();
create trigger project_comments_count after insert or delete on public.project_comments for each row execute function app.project_counters();

-- ------------------------------------------------- tools / software ----
create table public.tools (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null check (char_length(name) between 1 and 80),
  category      text not null check (char_length(category) between 2 and 40),
  description   text check (char_length(description) <= 1000),
  website_url   text not null check (website_url ~ '^https://'),
  logo_url      text,
  pricing       public.tool_pricing not null default 'free',
  student_offer text check (char_length(student_offer) <= 300),
  tags          text[] not null default '{}',
  is_featured   boolean not null default false,
  featured_rank integer,
  status        public.content_status not null default 'published',
  created_by    text references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tools_featured_idx on public.tools (featured_rank nulls last) where is_featured and status = 'published';
create trigger tools_updated_at before update on public.tools for each row execute function app.set_updated_at();

-- ------------------------------------------------------------ daily news ----
create table public.news_items (
  id             uuid primary key default gen_random_uuid(),
  source         text not null check (char_length(source) between 2 and 60),     -- techcabal, hackernews, devto, github...
  url            text not null unique check (url ~ '^https://' and char_length(url) <= 2048),  -- canonical
  url_hash       text not null unique check (url_hash ~ '^[a-f0-9]{64}$'),
  title          text not null check (char_length(title) between 3 and 300),
  title_norm     text generated always as (lower(regexp_replace(title, '[^[:alnum:] ]+', '', 'g'))) stored,
  summary        text check (char_length(summary) <= 1000),
  ai_summary     text check (char_length(ai_summary) <= 300),
  image_url      text check (image_url is null or image_url ~ '^https://'),
  author         text check (char_length(author) <= 200),
  category       text not null default 'dev' check (category in ('ai','africa_tech','dev','security','cloud','startups_funding','jobs')),
  score          integer not null default 0,           -- HN points / GitHub stars / reactions, for ranking
  published_at   timestamptz not null default now(),
  ingested_at    timestamptz not null default now(),
  status         text not null default 'published' check (status in ('published','hidden')),
  is_featured    boolean not null default false,       -- pinned by admins
  is_manual      boolean not null default false,
  added_by       text references public.profiles(id) on delete set null,
  click_count    integer not null default 0 check (click_count >= 0),
  updated_at     timestamptz not null default now()
);
create index news_items_feed_idx on public.news_items (published_at desc) where status = 'published';
create index news_items_category_idx on public.news_items (category, published_at desc) where status = 'published';
create index news_items_title_trgm_idx on public.news_items using gin (title_norm extensions.gin_trgm_ops);
create trigger news_items_updated_at before update on public.news_items for each row execute function app.set_updated_at();

-- Dedupe helper for the ingester (service role): true if a near-identical
-- title was ingested in the last 3 days (pg_trgm similarity >= 0.8).
create or replace function public.news_title_exists(p_title text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.news_items n
     where n.ingested_at > now() - interval '3 days'
       and extensions.similarity(n.title_norm, lower(regexp_replace(p_title, '[^[:alnum:] ]+', '', 'g'))) >= 0.8)
$$;
