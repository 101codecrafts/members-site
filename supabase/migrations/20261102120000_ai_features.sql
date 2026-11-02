-- =============================================================================
-- 101 Codecrafts — AI features: RAG knowledge (pgvector), assistant history,
-- rate limits, collaborative whiteboards (+ Realtime authorization).
--
-- Identity: Clerk via Supabase third-party auth → auth.jwt()->>'sub' is the
-- Clerk user id (TEXT). Never auth.uid() (Clerk ids are not UUIDs).
-- Self-contained: depends only on Supabase built-ins (auth.jwt, roles,
-- realtime schema when present), so it applies before or after the backend
-- migrations.
-- =============================================================================

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
-- Supabase grants this by default; repeated so the vector type/operators resolve for API roles.
grant usage on schema extensions to anon, authenticated, service_role;

-- Private helpers live outside the exposed API schemas.
create schema if not exists ai_private;
revoke all on schema ai_private from public;
grant usage on schema ai_private to anon, authenticated, service_role;

create or replace function ai_private.uid()
returns text language sql stable set search_path = '' as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

create or replace function ai_private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ------------------------------------------------------------ knowledge ----
create table public.ai_documents (
  id                 bigint generated always as identity primary key,
  doc_id             text not null unique check (char_length(doc_id) between 1 and 200),
  source             text not null check (char_length(source) <= 100),
  title              text not null check (char_length(title) <= 300),
  url                text check (char_length(url) <= 500),
  content            text not null check (char_length(content) <= 8000),
  needs_confirmation boolean not null default false,
  embedding          extensions.vector(1536) not null,
  embedding_model    text not null,
  updated_at         timestamptz not null default now()
);
comment on table public.ai_documents is 'Public knowledge chunks for the 101 Assistant (FAQ + site content). Written only by the service role via /api/assistant/ingest.';
create index ai_documents_embedding_idx on public.ai_documents
  using hnsw (embedding extensions.vector_cosine_ops);
create trigger ai_documents_touch before update on public.ai_documents
  for each row execute function ai_private.touch_updated_at();

alter table public.ai_documents enable row level security;
-- Knowledge is public (it is the public FAQ/site content). No write policies:
-- only service_role (which bypasses RLS) can insert/update/delete.
create policy ai_documents_read on public.ai_documents
  for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.ai_documents from anon, authenticated;

create or replace function public.match_ai_documents(
  query_embedding extensions.vector(1536),
  match_count integer default 5,
  min_similarity double precision default 0.25
)
returns table (
  doc_id text, source text, title text, url text, content text,
  needs_confirmation boolean, similarity double precision
)
language sql stable security invoker set search_path = '' as $$
  select d.doc_id, d.source, d.title, d.url, d.content, d.needs_confirmation,
         1 - (d.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.ai_documents d
  where 1 - (d.embedding operator(extensions.<=>) query_embedding) >= min_similarity
  order by d.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 20)
$$;

-- ------------------------------------------------ assistant conversations ----
create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null default ai_private.uid() check (char_length(user_id) between 1 and 100),
  title       text not null default 'New chat' check (char_length(title) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);
create trigger ai_conversations_touch before update on public.ai_conversations
  for each row execute function ai_private.touch_updated_at();

create table public.ai_messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.ai_conversations(id) on delete cascade,
  user_id          text not null default ai_private.uid(),
  role             text not null check (role in ('user','assistant')),
  content          text not null check (char_length(content) <= 20000),
  parts            jsonb,
  citations        jsonb,
  model            text check (char_length(model) <= 120),
  created_at       timestamptz not null default now()
);
create index ai_messages_conv_idx on public.ai_messages (conversation_id, created_at);
create index ai_messages_user_idx on public.ai_messages (user_id);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy ai_conversations_select on public.ai_conversations
  for select to authenticated using (user_id = (select ai_private.uid()));
create policy ai_conversations_insert on public.ai_conversations
  for insert to authenticated with check (user_id = (select ai_private.uid()));
create policy ai_conversations_update on public.ai_conversations
  for update to authenticated using (user_id = (select ai_private.uid())) with check (user_id = (select ai_private.uid()));
create policy ai_conversations_delete on public.ai_conversations
  for delete to authenticated using (user_id = (select ai_private.uid()));

create policy ai_messages_select on public.ai_messages
  for select to authenticated using (user_id = (select ai_private.uid()));
create policy ai_messages_insert on public.ai_messages
  for insert to authenticated with check (
    user_id = (select ai_private.uid())
    and exists (select 1 from public.ai_conversations c
                where c.id = conversation_id and c.user_id = (select ai_private.uid()))
  );
create policy ai_messages_delete on public.ai_messages
  for delete to authenticated using (user_id = (select ai_private.uid()));
-- Messages are immutable: no update policy.

revoke all on public.ai_conversations, public.ai_messages from anon;
grant select, insert, update, delete on public.ai_conversations to authenticated;
grant select, insert, delete on public.ai_messages to authenticated;

-- ------------------------------------------------------------ rate limit ----
create table public.ai_rate_limits (
  key           text not null check (char_length(key) <= 120),
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (key, window_start)
);
alter table public.ai_rate_limits enable row level security; -- no policies: service role only
revoke all on public.ai_rate_limits from anon, authenticated;

create or replace function public.ai_rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz;
  v_count  integer;
begin
  if p_key is null or char_length(p_key) > 120 or p_limit < 0 or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.ai_rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;
  -- Opportunistic cleanup of old windows (cheap, bounded).
  if random() < 0.01 then
    delete from public.ai_rate_limits where window_start < now() - interval '1 day';
  end if;
  return query select v_count <= p_limit, greatest(p_limit - v_count, 0),
                      v_window + make_interval(secs => p_window_seconds);
end $$;

-- ------------------------------------------------------------ whiteboards ----
create table public.whiteboards (
  id          uuid primary key default gen_random_uuid(),
  owner_id    text not null default ai_private.uid() check (char_length(owner_id) between 1 and 100),
  title       text not null default 'Untitled board' check (char_length(title) between 1 and 120),
  scene       jsonb not null default '{"elements":[],"appState":{}}'::jsonb
              check (pg_column_size(scene) <= 5000000),
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index whiteboards_owner_idx on public.whiteboards (owner_id, updated_at desc);
create trigger whiteboards_touch before update on public.whiteboards
  for each row execute function ai_private.touch_updated_at();

-- Team sharing: owner adds members (a team = the set of members on a board).
create table public.whiteboard_members (
  board_id    uuid not null references public.whiteboards(id) on delete cascade,
  user_id     text not null check (char_length(user_id) between 1 and 100),
  role        text not null default 'editor' check (role in ('editor','viewer')),
  added_by    text not null default ai_private.uid(),
  created_at  timestamptz not null default now(),
  primary key (board_id, user_id)
);
create index whiteboard_members_user_idx on public.whiteboard_members (user_id);

-- SECURITY DEFINER helpers avoid recursive RLS between the two tables.
create or replace function ai_private.board_role(p_board uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.whiteboards w where w.id = p_board and w.owner_id = ai_private.uid()) then 'owner'
    else (select m.role from public.whiteboard_members m where m.board_id = p_board and m.user_id = ai_private.uid())
  end
$$;
create or replace function ai_private.can_view_board(p_board uuid)
returns boolean language sql stable set search_path = '' as $$
  select ai_private.board_role(p_board) is not null
$$;
create or replace function ai_private.can_edit_board(p_board uuid)
returns boolean language sql stable set search_path = '' as $$
  select ai_private.board_role(p_board) in ('owner','editor')
$$;
create or replace function ai_private.is_board_owner(p_board uuid)
returns boolean language sql stable set search_path = '' as $$
  select ai_private.board_role(p_board) = 'owner'
$$;

-- Owner cannot be changed by editors; version increments on every update.
create or replace function ai_private.guard_whiteboard_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id and current_user not in ('service_role','postgres') then
    raise exception 'owner cannot be changed' using errcode = '42501';
  end if;
  new.version := old.version + 1;
  return new;
end $$;
create trigger whiteboards_guard before update on public.whiteboards
  for each row execute function ai_private.guard_whiteboard_update();

alter table public.whiteboards enable row level security;
alter table public.whiteboard_members enable row level security;

create policy whiteboards_select on public.whiteboards
  for select to authenticated using (owner_id = (select ai_private.uid()) or ai_private.can_view_board(id));
create policy whiteboards_insert on public.whiteboards
  for insert to authenticated with check (owner_id = (select ai_private.uid()));
create policy whiteboards_update on public.whiteboards
  for update to authenticated
  using (owner_id = (select ai_private.uid()) or ai_private.can_edit_board(id))
  with check (owner_id = (select ai_private.uid()) or ai_private.can_edit_board(id));
create policy whiteboards_delete on public.whiteboards
  for delete to authenticated using (owner_id = (select ai_private.uid()));

create policy whiteboard_members_select on public.whiteboard_members
  for select to authenticated using (user_id = (select ai_private.uid()) or ai_private.can_view_board(board_id));
create policy whiteboard_members_insert on public.whiteboard_members
  for insert to authenticated with check (ai_private.is_board_owner(board_id) and added_by = (select ai_private.uid()));
create policy whiteboard_members_update on public.whiteboard_members
  for update to authenticated using (ai_private.is_board_owner(board_id)) with check (ai_private.is_board_owner(board_id));
create policy whiteboard_members_delete on public.whiteboard_members
  for delete to authenticated using (ai_private.is_board_owner(board_id) or user_id = (select ai_private.uid()));

revoke all on public.whiteboards, public.whiteboard_members from anon;
grant select, insert, update, delete on public.whiteboards, public.whiteboard_members to authenticated;

-- ------------------------------------------- Realtime (private channels) ----
-- Channel topic: 'whiteboard:<board uuid>', created with { config: { private: true } }.
-- Viewers may receive and share presence (cursors); only owners/editors may
-- broadcast scene updates.
create or replace function ai_private.board_from_topic(p_topic text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_topic !~ '^whiteboard:[0-9a-fA-F-]{36}$' then return null; end if;
  return substring(p_topic from 12)::uuid;
exception when others then return null;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'realtime')
     and to_regclass('realtime.messages') is not null then
    execute $p$
      create policy whiteboard_realtime_receive on realtime.messages
        for select to authenticated
        using (
          realtime.messages.extension in ('broadcast','presence')
          and ai_private.can_view_board(ai_private.board_from_topic(realtime.topic()))
        )
    $p$;
    execute $p$
      create policy whiteboard_realtime_send on realtime.messages
        for insert to authenticated
        with check (
          (realtime.messages.extension = 'presence'
             and ai_private.can_view_board(ai_private.board_from_topic(realtime.topic())))
          or (realtime.messages.extension = 'broadcast'
             and ai_private.can_edit_board(ai_private.board_from_topic(realtime.topic())))
        )
    $p$;
  end if;
end $$;

-- ------------------------------------------------- function privileges ----
-- Default-deny: every function created above loses EXECUTE for public/anon/
-- authenticated, then only the minimum is granted back explicitly.
-- (Trigger functions need no EXECUTE grant to fire.)
revoke execute on function
  ai_private.uid(),
  ai_private.touch_updated_at(),
  public.match_ai_documents(extensions.vector, integer, double precision),
  public.ai_rate_limit_hit(text, integer, integer),
  ai_private.board_role(uuid),
  ai_private.can_view_board(uuid),
  ai_private.can_edit_board(uuid),
  ai_private.is_board_owner(uuid),
  ai_private.guard_whiteboard_update(),
  ai_private.board_from_topic(text)
from public, anon, authenticated;

-- Public knowledge search (the knowledge base is public FAQ/site content).
grant execute on function public.match_ai_documents(extensions.vector, integer, double precision) to anon, authenticated, service_role;
-- Rate limiter: server only.
grant execute on function public.ai_rate_limit_hit(text, integer, integer) to service_role;
-- Used by RLS policies / column defaults for signed-in members.
grant execute on function
  ai_private.uid(),
  ai_private.board_role(uuid),
  ai_private.can_view_board(uuid),
  ai_private.can_edit_board(uuid),
  ai_private.is_board_owner(uuid),
  ai_private.board_from_topic(text)
to authenticated, service_role;
