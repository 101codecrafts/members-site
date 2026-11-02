-- =============================================================================
-- Community: feed posts, comments, reactions, conversations & messages,
-- notifications (+ preferences), moderation flags, announcements
-- =============================================================================

create table public.posts (
  id              uuid primary key default gen_random_uuid(),
  author_id       text not null references public.profiles(id) on delete cascade,
  group_id        uuid references public.study_groups(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 10000),
  link_url        text check (link_url is null or link_url ~ '^https?://'),
  image_path      text,
  is_pinned       boolean not null default false,
  comments_count  integer not null default 0,
  reactions_count integer not null default 0,
  hidden_at       timestamptz,
  hidden_reason   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index posts_feed_idx  on public.posts (created_at desc) where deleted_at is null and hidden_at is null and group_id is null;
create index posts_group_idx on public.posts (group_id, created_at desc) where deleted_at is null;
create index posts_author_idx on public.posts (author_id, created_at desc);
create trigger posts_updated_at before update on public.posts for each row execute function app.set_updated_at();

create table public.post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author_id   text not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.post_comments(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 5000),
  hidden_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create trigger post_comments_updated_at before update on public.post_comments for each row execute function app.set_updated_at();

create table public.reactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.profiles(id) on delete cascade,
  post_id     uuid references public.posts(id) on delete cascade,
  comment_id  uuid references public.post_comments(id) on delete cascade,
  emoji       text not null check (emoji in ('like','love','fire','clap','laugh','insightful')),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id) = 1)
);
create unique index reactions_post_uniq    on public.reactions (user_id, post_id, emoji) where post_id is not null;
create unique index reactions_comment_uniq on public.reactions (user_id, comment_id, emoji) where comment_id is not null;
create index reactions_post_idx on public.reactions (post_id);

-- Generic author/owner stamping + protected moderation fields for UGC tables.
create or replace function app.guard_ugc()
returns trigger language plpgsql set search_path = '' as $$
declare owner_col text := tg_argv[0]; j jsonb; o jsonb;
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    j := jsonb_build_object(owner_col, app.requesting_user_id());
    if to_jsonb(new) ? 'hidden_at' then j := j || '{"hidden_at": null}'; end if;
    if to_jsonb(new) ? 'is_pinned' then j := j || '{"is_pinned": false, "comments_count": 0, "reactions_count": 0, "hidden_reason": null}'; end if;
    new := jsonb_populate_record(new, j);
    return new;
  end if;
  j := to_jsonb(new); o := to_jsonb(old);
  if j -> owner_col is distinct from o -> owner_col
     or j -> 'hidden_at' is distinct from o -> 'hidden_at' or j -> 'is_pinned' is distinct from o -> 'is_pinned'
     or j -> 'comments_count' is distinct from o -> 'comments_count' or j -> 'reactions_count' is distinct from o -> 'reactions_count'
     or j -> 'post_id' is distinct from o -> 'post_id' or j -> 'project_id' is distinct from o -> 'project_id'
     or j -> 'group_id' is distinct from o -> 'group_id' or j -> 'conversation_id' is distinct from o -> 'conversation_id' then
    raise exception 'protected fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger posts_guard before insert or update on public.posts for each row execute function app.guard_ugc('author_id');
create trigger post_comments_guard before insert or update on public.post_comments for each row execute function app.guard_ugc('author_id');
create trigger project_comments_guard before insert or update on public.project_comments for each row execute function app.guard_ugc('author_id');
create trigger reactions_guard before insert on public.reactions for each row execute function app.guard_ugc('user_id');
create trigger project_stars_guard before insert on public.project_stars for each row execute function app.guard_ugc('user_id');

create or replace function app.post_counters()
returns trigger language plpgsql security definer set search_path = '' as $$
declare d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  if tg_table_name = 'post_comments' then
    update public.posts set comments_count = greatest(comments_count + d, 0) where id = coalesce(new.post_id, old.post_id);
  elsif coalesce(new.post_id, old.post_id) is not null then
    update public.posts set reactions_count = greatest(reactions_count + d, 0) where id = coalesce(new.post_id, old.post_id);
  end if;
  return null;
end;
$$;
create trigger post_comments_count after insert or delete on public.post_comments for each row execute function app.post_counters();
create trigger reactions_count after insert or delete on public.reactions for each row execute function app.post_counters();

-- -------------------------------------------------------------- messaging ----
create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  kind             public.conversation_kind not null default 'direct',
  title            text check (char_length(title) <= 80),
  direct_key       text unique,
  created_by       text references public.profiles(id) on delete set null,
  last_message_at  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger conversations_updated_at before update on public.conversations for each row execute function app.set_updated_at();

create table public.conversation_participants (
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  user_id          text not null references public.profiles(id) on delete cascade,
  last_read_at     timestamptz,
  muted            boolean not null default false,
  joined_at        timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        text not null references public.profiles(id) on delete cascade,
  body             text not null check (char_length(body) between 1 and 5000),
  attachment_path  text,
  edited_at        timestamptz,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create or replace function app.is_participant(p_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_participants cp
                 where cp.conversation_id = p_conversation and cp.user_id = app.requesting_user_id())
$$;

create or replace function app.guard_message()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.sender_id := app.requesting_user_id(); new.edited_at := null; new.deleted_at := null; return new;
  end if;
  if new.sender_id is distinct from old.sender_id or new.conversation_id is distinct from old.conversation_id
     or new.created_at is distinct from old.created_at then
    raise exception 'protected message fields' using errcode = '42501';
  end if;
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end;
$$;
create trigger messages_guard before insert or update on public.messages for each row execute function app.guard_message();

create or replace function app.guard_participant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if new.user_id is distinct from old.user_id or new.conversation_id is distinct from old.conversation_id
     or new.joined_at is distinct from old.joined_at then
    raise exception 'protected fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger participants_guard before update on public.conversation_participants for each row execute function app.guard_participant();

-- --------------------------------------------------------- notifications ----
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null references public.profiles(id) on delete cascade,
  type        text not null check (type ~ '^[a-z_\.]{2,40}$'),
  title       text not null check (char_length(title) <= 200),
  body        text check (char_length(body) <= 2000),
  link        text check (link is null or link ~ '^(/|https://)'),
  data        jsonb not null default '{}',
  read_at     timestamptz,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx   on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_email_queue_idx on public.notifications (created_at) where emailed_at is null;

-- Per-user channel preferences by category.
create table public.notification_preferences (
  user_id          text primary key references public.profiles(id) on delete cascade,
  in_app           jsonb not null default '{"messages":true,"comments":true,"courses":true,"events":true,"payments":true,"announcements":true,"gamification":true}',
  email            jsonb not null default '{"messages":false,"comments":false,"courses":true,"events":true,"payments":true,"announcements":true,"gamification":false}',
  whatsapp_opt_in  boolean not null default false,
  whatsapp_number  text check (whatsapp_number is null or whatsapp_number ~ '^\+[0-9]{7,15}$'),
  digest_frequency text not null default 'weekly' check (digest_frequency in ('off','daily','weekly')),
  quiet_hours      int4range,          -- e.g. [22,7) in Africa/Kampala hours
  updated_at       timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences for each row execute function app.set_updated_at();

create or replace function app.guard_notification()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'only read_at can be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger notifications_guard before update on public.notifications for each row execute function app.guard_notification();

-- Maps a notification type to a preference category.
create or replace function app.notification_category(p_type text)
returns text language sql immutable set search_path = '' as $$
  select case split_part(p_type, '.', 1)
    when 'message' then 'messages' when 'comment' then 'comments'
    when 'course' then 'courses' when 'enrollment' then 'courses' when 'certificate' then 'courses'
    when 'event' then 'events' when 'session' then 'events'
    when 'payment' then 'payments' when 'payout' then 'payments' when 'order' then 'payments' when 'refund' then 'payments'
    when 'badge' then 'gamification' when 'xp' then 'gamification'
    else 'announcements' end
$$;

-- Internal: create an in-app notification honouring preferences.
create or replace function app.notify(p_user text, p_type text, p_title text, p_body text default null,
                                      p_link text default null, p_data jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare pref jsonb;
begin
  if p_user is null then return; end if;
  select in_app into pref from public.notification_preferences where user_id = p_user;
  if pref is not null and coalesce((pref ->> app.notification_category(p_type))::boolean, true) = false
     and split_part(p_type, '.', 1) not in ('payment','payout','refund','account','membership','tutor') then
    return;   -- transactional/security notices are always delivered
  end if;
  insert into public.notifications (user_id, type, title, body, link, data)
  values (p_user, p_type, p_title, p_body, p_link, coalesce(p_data, '{}'));
end;
$$;

-- ----------------------------------------------------------- moderation ----
create table public.moderation_flags (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     text references public.profiles(id) on delete set null,
  target_type     public.flag_target not null,
  target_id       text not null check (char_length(target_id) <= 64),
  reason          text not null check (reason in ('spam','harassment','hate','nsfw','scam','plagiarism','off_topic','safeguarding','other')),
  details         text check (char_length(details) <= 2000),
  status          public.flag_status not null default 'open',
  resolved_by     text references public.profiles(id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text check (char_length(resolution_note) <= 2000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index moderation_flags_once on public.moderation_flags (reporter_id, target_type, target_id) where status in ('open','reviewing');
create index moderation_flags_queue_idx on public.moderation_flags (status, created_at);
create index moderation_flags_target_idx on public.moderation_flags (target_type, target_id);
create trigger moderation_flags_updated_at before update on public.moderation_flags for each row execute function app.set_updated_at();

create or replace function app.guard_flag()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.reporter_id := app.requesting_user_id(); new.status := 'open';
    new.resolved_by := null; new.resolved_at := null; new.resolution_note := null;
    return new;
  end if;
  raise exception 'flags are resolved by admins' using errcode = '42501';
end;
$$;
create trigger moderation_flags_guard before insert or update on public.moderation_flags for each row execute function app.guard_flag();

-- Auto-hide after 3 distinct open reports; admins review afterwards.
create or replace function app.flag_autohide()
returns trigger language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  -- SR-07: only reporters whose accounts are older than 7 days count; staff
  -- content is never auto-hidden (it goes to the admin queue instead).
  select count(distinct f.reporter_id) into n from public.moderation_flags f
    join public.profiles rp on rp.id = f.reporter_id and rp.created_at < now() - interval '7 days'
   where f.target_type = new.target_type and f.target_id = new.target_id and f.status in ('open','reviewing');
  if n >= 3 and not exists (
       select 1 from public.posts p join public.user_roles ur on ur.user_id = p.author_id and ur.role in ('admin','super_admin')
        where new.target_type = 'post' and p.id = app.try_uuid(new.target_id)) then
    case new.target_type
      when 'post' then update public.posts set hidden_at = coalesce(hidden_at, now()), hidden_reason = 'auto: community reports' where id = app.try_uuid(new.target_id);
      when 'post_comment' then update public.post_comments set hidden_at = coalesce(hidden_at, now()) where id = app.try_uuid(new.target_id);
      when 'project_comment' then update public.project_comments set hidden_at = coalesce(hidden_at, now()) where id = app.try_uuid(new.target_id);
      when 'review' then update public.tutor_reviews set hidden_at = coalesce(hidden_at, now()) where id = app.try_uuid(new.target_id);
      else null;
    end case;
  end if;
  return null;
end;
$$;
create trigger moderation_flags_autohide after insert on public.moderation_flags for each row execute function app.flag_autohide();

-- -------------------------------------------------------- announcements ----
create table public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 3 and 200),
  body          text not null check (char_length(body) <= 10000),
  audience      public.announcement_audience not null default 'members',
  link          text check (link is null or link ~ '^(/|https://)'),
  is_pinned     boolean not null default false,
  send_email    boolean not null default false,
  published_at  timestamptz,
  expires_at    timestamptz,
  fanned_out_at timestamptz,
  created_by    text references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (expires_at is null or published_at is null or expires_at > published_at)
);
create index announcements_live_idx on public.announcements (published_at desc);
create trigger announcements_updated_at before update on public.announcements for each row execute function app.set_updated_at();

-- SR-01: RLS on for every table created above (deny-by-default until policies in 0990).
select app.enable_rls_all();
