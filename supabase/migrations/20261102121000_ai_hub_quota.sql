-- =============================================================================
-- 101 AI hub — per-member daily message quota (Africa/Kampala days).
-- Written ONLY by the server (service role) after Clerk verification, so a member
-- can never pass someone else's id or a bigger limit. Members may read their own
-- usage rows. If the backend's planned ai_usage table supersedes this, repoint
-- lib/ai/hub/quota.ts (supabaseQuotaStore) and drop this table.
-- =============================================================================

create table public.ai_hub_usage (
  user_id     text not null check (char_length(user_id) between 1 and 100),
  day         date not null,
  messages    integer not null default 0 check (messages >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.ai_hub_usage enable row level security;

create policy ai_hub_usage_read_own on public.ai_hub_usage
  for select to authenticated using (user_id = (select nullif(auth.jwt() ->> 'sub', '')));
revoke all on public.ai_hub_usage from anon;
revoke insert, update, delete, truncate on public.ai_hub_usage from authenticated;
grant select on public.ai_hub_usage to authenticated;

-- Atomically count one message if under the limit.
create or replace function public.ai_hub_consume(p_user text, p_day date, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  if p_user is null or char_length(p_user) > 100 or p_limit < 0 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  insert into public.ai_hub_usage as u (user_id, day, messages)
  values (p_user, p_day, 0)
  on conflict (user_id, day) do nothing;
  update public.ai_hub_usage u
     set messages = u.messages + 1, updated_at = now()
   where u.user_id = p_user and u.day = p_day and u.messages < p_limit
  returning u.messages into v;
  if v is null then
    select u.messages into v from public.ai_hub_usage u where u.user_id = p_user and u.day = p_day;
    return query select false, v;
  else
    return query select true, v;
  end if;
end $$;

create or replace function public.ai_hub_usage_get(p_user text, p_day date)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select u.messages from public.ai_hub_usage u where u.user_id = p_user and u.day = p_day), 0)
$$;

-- Default-deny: server (service role) only.
revoke execute on function public.ai_hub_consume(text, date, integer) from public, anon, authenticated;
revoke execute on function public.ai_hub_usage_get(text, date) from public, anon, authenticated;
grant execute on function public.ai_hub_consume(text, date, integer) to service_role;
grant execute on function public.ai_hub_usage_get(text, date) to service_role;
