-- =============================================================================
-- AI tools catalogue (public directory of free AI tools / APIs for students)
-- and free on-site AI for members: per-user daily quotas by plan, usage
-- metering, moderation log. Provider keys live ONLY in server env vars; we
-- never store users' personal API keys.
-- =============================================================================

create table public.ai_tools (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 2 and 80),
  slug              text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  category          text not null check (category in ('chat','coding','image','video','audio','speech','search','agents','api','dataset','notebook','other')),
  logo_url          text check (logo_url is null or logo_url ~ '^https://'),
  free_tier_summary text check (char_length(free_tier_summary) <= 600),
  signup_url        text check (signup_url is null or signup_url ~ '^https://'),
  docs_url          text check (docs_url is null or docs_url ~ '^https://'),
  student_perk      text check (char_length(student_perk) <= 400),
  how_to_key_md     text check (char_length(how_to_key_md) <= 8000),   -- how a member gets THEIR OWN key (we never store it)
  tags              text[] not null default '{}',
  verified_at       timestamptz,
  approved          boolean not null default false,
  suggested_by      text references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index ai_tools_cat_idx on public.ai_tools (category) where approved;
create trigger ai_tools_updated_at before update on public.ai_tools for each row execute function app.set_updated_at();

insert into public.ai_tools (name, slug, category, free_tier_summary, signup_url, docs_url, approved, verified_at) values
  ('Groq', 'groq', 'api', 'Free tier with rate limits on open models (Llama, Qwen, etc.).', 'https://console.groq.com', 'https://console.groq.com/docs', true, null),
  ('OpenRouter', 'openrouter', 'api', 'Many ":free" model variants with daily request limits.', 'https://openrouter.ai', 'https://openrouter.ai/docs', true, null),
  ('Google AI Studio (Gemini API)', 'google-ai-studio', 'api', 'Free tier for Gemini models with per-minute/day limits.', 'https://aistudio.google.com', 'https://ai.google.dev/gemini-api/docs', true, null),
  ('Hugging Face', 'hugging-face', 'api', 'Free Inference credits, Spaces and datasets.', 'https://huggingface.co', 'https://huggingface.co/docs', true, null),
  ('Kaggle Notebooks', 'kaggle', 'notebook', 'Free GPU/TPU notebook hours each week.', 'https://www.kaggle.com', 'https://www.kaggle.com/docs', true, null)
on conflict (slug) do nothing;
-- verified_at stays null until an admin re-checks each free tier (TODO-CONFIRM limits change often).

insert into public.site_settings (key, value, is_public, description) values
  ('ai.quotas', '{"free":{"requests":20,"tokens":40000},"pro":{"requests":200,"tokens":400000},"minor":{"requests":15,"tokens":20000}}', true,
   'Per-user DAILY on-site AI quota by plan (Africa/Kampala day). Launch promo = pro.'),
  ('ai.enabled', 'true', true, 'Kill switch for on-site AI')
on conflict (key) do nothing;

create table public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       text references public.profiles(id) on delete set null,   -- null = system job (news summaries)
  day           date not null default (now() at time zone 'Africa/Kampala')::date,
  feature       text not null check (feature ~ '^[a-z][a-z0-9_.:-]{1,40}$'),
  status        text not null default 'reserved' check (status in ('reserved','ok','error','blocked')),
  provider      text, model text,
  input_tokens  int not null default 0,
  output_tokens int not null default 0,
  est_tokens    int not null default 0,
  latency_ms    int,
  created_at    timestamptz not null default now()
);
create index ai_usage_user_day_idx on public.ai_usage (user_id, day);
create index ai_usage_day_idx on public.ai_usage (day);

create table public.ai_moderation_events (
  id         bigint generated always as identity primary key,
  user_id    text references public.profiles(id) on delete set null,
  feature    text not null,
  is_minor   boolean not null default false,
  category   text not null,
  action     text not null check (action in ('blocked_input','blocked_output','redacted','warned')),
  created_at timestamptz not null default now()
);

create or replace function app.ai_limits(p_user text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.profiles where id = p_user and is_minor) and not app.has_pro(p_user) then app.setting('ai.quotas') -> 'minor'
    when app.has_pro(p_user) then app.setting('ai.quotas') -> 'pro'
    else app.setting('ai.quotas') -> 'free' end
  || jsonb_build_object('plan', case when app.has_pro(p_user) then 'pro' else 'free' end)
$$;

-- Server (service role) reserves one AI call for a user before calling a provider.
-- Generic: any feature (chat, hint, explain, debug, the ai-features assistant, …).
create or replace function public.ai_reserve(p_user text, p_feature text, p_est_tokens int default 1000)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare lim jsonb; used_req int; used_tok bigint; u uuid; today date := (now() at time zone 'Africa/Kampala')::date;
begin
  perform app.require_backend();
  if coalesce((app.setting('ai.enabled'))::boolean, true) is false then
    return jsonb_build_object('allowed', false, 'reason', 'disabled');
  end if;
  if p_user is null then   -- quota-free system job
    insert into public.ai_usage (user_id, feature, est_tokens) values (null, p_feature, greatest(p_est_tokens, 0)) returning id into u;
    return jsonb_build_object('allowed', true, 'usage_id', u, 'plan', 'system');
  end if;
  if not exists (select 1 from public.profiles where id = p_user and account_status = 'active' and deleted_at is null) then
    return jsonb_build_object('allowed', false, 'reason', 'inactive');
  end if;
  perform pg_advisory_xact_lock(hashtext('ai:' || p_user));
  lim := app.ai_limits(p_user);
  select count(*), coalesce(sum(case when status = 'reserved' then est_tokens else input_tokens + output_tokens end), 0)
    into used_req, used_tok from public.ai_usage where user_id = p_user and day = today and status <> 'blocked';
  if used_req >= (lim ->> 'requests')::int or used_tok + greatest(p_est_tokens, 0) > (lim ->> 'tokens')::bigint then
    return jsonb_build_object('allowed', false, 'reason', 'quota', 'plan', lim ->> 'plan',
      'limit_requests', (lim ->> 'requests')::int, 'used_requests', used_req, 'limit_tokens', (lim ->> 'tokens')::bigint, 'used_tokens', used_tok,
      'resets_at', ((today + 1)::timestamp at time zone 'Africa/Kampala'));
  end if;
  insert into public.ai_usage (user_id, feature, est_tokens) values (p_user, p_feature, greatest(p_est_tokens, 0)) returning id into u;
  return jsonb_build_object('allowed', true, 'usage_id', u, 'plan', lim ->> 'plan',
    'remaining_requests', (lim ->> 'requests')::int - used_req - 1, 'remaining_tokens', (lim ->> 'tokens')::bigint - used_tok - greatest(p_est_tokens, 0));
end;
$$;

create or replace function public.ai_commit(p_usage uuid, p_status text, p_provider text default null, p_model text default null,
  p_input_tokens int default 0, p_output_tokens int default 0, p_latency_ms int default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  update public.ai_usage set status = p_status, provider = p_provider, model = p_model, input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
         output_tokens = greatest(coalesce(p_output_tokens, 0), 0), latency_ms = p_latency_ms
   where id = p_usage and status = 'reserved';
end;
$$;

create or replace function public.ai_log_moderation(p_user text, p_feature text, p_is_minor boolean, p_category text, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  insert into public.ai_moderation_events (user_id, feature, is_minor, category, action) values (p_user, p_feature, coalesce(p_is_minor, false), left(p_category, 60), p_action);
end;
$$;

create or replace function public.my_ai_quota()
returns jsonb language sql stable security definer set search_path = '' as $$
  with lim as (select app.ai_limits(app.requesting_user_id()) l),
       u as (select count(*) r, coalesce(sum(case when status = 'reserved' then est_tokens else input_tokens + output_tokens end), 0) t
               from public.ai_usage where user_id = app.requesting_user_id() and day = (now() at time zone 'Africa/Kampala')::date and status <> 'blocked')
  select jsonb_build_object('plan', l ->> 'plan', 'limit_requests', (l ->> 'requests')::int, 'used_requests', u.r,
                            'limit_tokens', (l ->> 'tokens')::bigint, 'used_tokens', u.t, 'enabled', coalesce((app.setting('ai.enabled'))::boolean, true))
    from lim, u where app.requesting_user_id() is not null
$$;

-- RLS
create policy ai_tools_read on public.ai_tools for select to anon, authenticated using (approved or app.is_admin() or suggested_by = app.requesting_user_id());
create policy ai_tools_suggest on public.ai_tools for insert to authenticated
  with check ((app.is_member() and suggested_by = app.requesting_user_id() and not approved and verified_at is null) or app.is_admin());
create policy ai_tools_admin on public.ai_tools for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy ai_tools_admin_del on public.ai_tools for delete to authenticated using (app.is_admin());
create policy ai_usage_own on public.ai_usage for select to authenticated using (user_id = app.requesting_user_id() or app.is_admin());
create policy ai_mod_admin on public.ai_moderation_events for select to authenticated using (app.is_admin());

revoke all on public.ai_tools, public.ai_usage, public.ai_moderation_events from anon, authenticated;
grant select on public.ai_tools to anon, authenticated;
grant insert (name, slug, category, logo_url, free_tier_summary, signup_url, docs_url, student_perk, how_to_key_md, tags, suggested_by, approved, verified_at) on public.ai_tools to authenticated;
grant update, delete on public.ai_tools to authenticated;
grant select on public.ai_usage, public.ai_moderation_events to authenticated;
grant select, insert, update, delete on public.ai_tools, public.ai_usage, public.ai_moderation_events to service_role;
grant execute on function app.ai_limits(text) to authenticated, service_role;
grant execute on function public.my_ai_quota() to authenticated;
grant execute on function public.ai_reserve(text, text, int), public.ai_commit(uuid, text, text, text, int, int, int),
  public.ai_log_moderation(text, text, boolean, text, text) to service_role;

select app.enable_rls_all();
