-- =============================================================================
-- Growth & engagement: onboarding, certificates, gamification (XP, badges,
-- streaks), referrals, jobs board, newsletter, consent + data-rights
-- requests (Uganda DPPA 2019), device tokens (push), social links,
-- analytics events + daily activity.
-- =============================================================================

-- ----------------------------------------------------------- onboarding ----
create table public.onboarding_state (
  user_id            text primary key references public.profiles(id) on delete cascade,
  email_verified     boolean not null default false,       -- synced from Clerk
  intended_role      text check (intended_role in ('learner','tutor')),
  interests          text[] not null default '{}' check (cardinality(interests) <= 20),
  experience_level   public.skill_level,
  learning_path_id   uuid references public.learning_paths(id) on delete set null,
  goals              text check (char_length(goals) <= 1000),
  steps_completed    text[] not null default '{}',
  completed_at       timestamptz,
  updated_at         timestamptz not null default now()
);
create trigger onboarding_state_updated_at before update on public.onboarding_state for each row execute function app.set_updated_at();

create or replace function app.guard_onboarding()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if tg_op = 'INSERT' then new.user_id := app.requesting_user_id(); new.email_verified := false; return new; end if;
  if new.email_verified is distinct from old.email_verified or new.user_id is distinct from old.user_id then
    raise exception 'email verification is synced from Clerk' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger onboarding_state_guard before insert or update on public.onboarding_state for each row execute function app.guard_onboarding();

-- --------------------------------------------------------- certificates ----
create table public.certificates (
  id            uuid primary key default gen_random_uuid(),
  verify_code   text not null unique check (verify_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  user_id       text not null references public.profiles(id) on delete cascade,
  course_id     uuid references public.courses(id) on delete set null,
  path_id       uuid references public.learning_paths(id) on delete set null,
  title         text not null,
  recipient_name text not null,
  tutor_name    text,
  issued_at     timestamptz not null default now(),
  pdf_path      text,                                     -- certificates/{user_id}/{id}.pdf (rendered by server)
  revoked_at    timestamptz,
  revoke_reason text,
  unique (user_id, course_id)
);
create index certificates_user_idx on public.certificates (user_id);

create or replace function app.random_code()
returns text language sql volatile set search_path = '' as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1), '')
    from generate_series(1, 4)
$$;

-- Issue on course completion (trigger on enrollments).
create or replace function app.issue_certificate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.courses; who text; tut text;
begin
  if new.status = 'completed' and (old.status is distinct from 'completed') then
    select * into c from public.courses where id = new.course_id;
    select coalesce(nullif(display_name, ''), username, 'Learner') into who from public.profiles where id = new.user_id;
    select nullif(display_name, '') into tut from public.profiles where id = c.tutor_id;
    insert into public.certificates (verify_code, user_id, course_id, title, recipient_name, tutor_name)
    values (app.random_code() || '-' || app.random_code() || '-' || app.random_code(), new.user_id, c.id, c.title, who, tut)
    on conflict (user_id, course_id) do nothing;
    perform app.notify(new.user_id, 'certificate.issued', 'Certificate earned', 'You completed ' || c.title || '.', '/dashboard.html#certificates');
  end if;
  return null;
end;
$$;
create trigger enrollments_certificate after update of status on public.enrollments for each row execute function app.issue_certificate();

-- Public verification (anon): returns only what a verifier needs.
create or replace function public.verify_certificate(p_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when c.id is null then jsonb_build_object('valid', false)
         else jsonb_build_object('valid', c.revoked_at is null, 'title', c.title, 'recipient', c.recipient_name,
                                 'tutor', c.tutor_name, 'issued_at', c.issued_at, 'revoked', c.revoked_at is not null,
                                 'username', p.username) end
    from (select 1) one
    left join public.certificates c on c.verify_code = upper(p_code)
    left join public.profiles p on p.id = c.user_id
$$;

-- --------------------------------------------------------- gamification ----
create table public.badges (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique check (code ~ '^[a-z0-9_]{2,40}$'),
  name         text not null,
  description  text,
  icon_url     text,
  xp_reward    integer not null default 0 check (xp_reward >= 0),
  rule         jsonb not null default '{}',     -- e.g. {"action":"lesson_completed","count":10}
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.user_badges (
  user_id    text not null references public.profiles(id) on delete cascade,
  badge_id   uuid not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table public.xp_events (
  id          bigint generated always as identity primary key,
  user_id     text not null references public.profiles(id) on delete cascade,
  action      text not null check (action ~ '^[a-z_]{2,40}$'),
  xp          integer not null check (xp between -10000 and 10000),
  ref_id      text,
  created_at  timestamptz not null default now(),
  unique (user_id, action, ref_id)              -- one award per action/object
);
create index xp_events_user_idx on public.xp_events (user_id, created_at desc);
create index xp_events_created_idx on public.xp_events using brin (created_at);

create table public.user_stats (
  user_id          text primary key references public.profiles(id) on delete cascade,
  xp_total         integer not null default 0,
  level            integer not null default 1,
  current_streak   integer not null default 0,
  longest_streak   integer not null default 0,
  last_active_day  date,
  updated_at       timestamptz not null default now()
);
create index user_stats_xp_idx on public.user_stats (xp_total desc);

-- Award XP once per (action, ref). Internal (definer callers / triggers).
create or replace function app.award_xp(p_user text, p_action text, p_ref text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare pts int := coalesce((app.setting('gamification.xp') ->> p_action)::int, 0); b record; n int;
begin
  if p_user is null or pts = 0 then return; end if;
  insert into public.xp_events (user_id, action, xp, ref_id) values (p_user, p_action, pts, coalesce(p_ref, ''))
  on conflict do nothing;
  if not found then return; end if;
  insert into public.user_stats as s (user_id, xp_total, level) values (p_user, pts, 1)
  on conflict (user_id) do update set xp_total = s.xp_total + pts, level = 1 + floor(sqrt((s.xp_total + pts) / 100.0))::int, updated_at = now();
  -- count-based badges
  for b in select * from public.badges where is_active and rule ->> 'action' = p_action loop
    select count(*) into n from public.xp_events where user_id = p_user and action = p_action;
    if n >= coalesce((b.rule ->> 'count')::int, 1) then
      insert into public.user_badges (user_id, badge_id) values (p_user, b.id) on conflict do nothing;
      if found then
        perform app.notify(p_user, 'badge.awarded', 'New badge: ' || b.name, b.description, '/dashboard.html#badges');
      end if;
    end if;
  end loop;
end;
$$;

-- Daily activity + streaks (called from touch_last_seen).
create table public.user_activity_daily (
  user_id  text not null references public.profiles(id) on delete cascade,
  day      date not null,
  primary key (day, user_id)
);
create index user_activity_daily_user_idx on public.user_activity_daily (user_id, day desc);

create or replace function app.record_activity(p_user text)
returns void language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'Africa/Kampala')::date; s public.user_stats;
begin
  insert into public.user_activity_daily (user_id, day) values (p_user, today) on conflict do nothing;
  if not found then return; end if;
  insert into public.user_stats (user_id) values (p_user) on conflict do nothing;
  select * into s from public.user_stats where user_id = p_user for update;
  update public.user_stats set
    current_streak = case when s.last_active_day = today - 1 then s.current_streak + 1 when s.last_active_day = today then s.current_streak else 1 end,
    longest_streak = greatest(s.longest_streak, case when s.last_active_day = today - 1 then s.current_streak + 1 else 1 end),
    last_active_day = today
   where user_id = p_user;
  perform app.award_xp(p_user, 'daily_login', today::text);
end;
$$;

-- XP hooks
create or replace function app.xp_hooks()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  case tg_table_name
    when 'lesson_progress' then perform app.award_xp(new.user_id, 'lesson_completed', new.lesson_id::text);
    when 'enrollments' then if new.status = 'completed' then perform app.award_xp(new.user_id, 'course_completed', new.course_id::text); end if;
    when 'projects' then perform app.award_xp(new.owner_id, 'project_created', new.id::text);
    when 'posts' then perform app.award_xp(new.author_id, 'post_created', new.id::text);
    when 'tutor_reviews' then perform app.award_xp(new.learner_id, 'review_written', new.id::text);
    when 'event_registrations' then if new.status = 'attended' then perform app.award_xp(new.user_id, 'event_attended', new.event_id::text); end if;
    else null;
  end case;
  return null;
end;
$$;
create trigger xp_lesson after insert on public.lesson_progress for each row execute function app.xp_hooks();
create trigger xp_course after update of status on public.enrollments for each row execute function app.xp_hooks();
create trigger xp_project after insert on public.projects for each row execute function app.xp_hooks();
create trigger xp_post after insert on public.posts for each row execute function app.xp_hooks();
create trigger xp_review after insert on public.tutor_reviews for each row execute function app.xp_hooks();
create trigger xp_event after update of status on public.event_registrations for each row execute function app.xp_hooks();

-- Leaderboards (public members only; security_invoker so profile RLS applies).
create view public.leaderboard_all_time with (security_invoker = true) as
select s.user_id, p.username, p.display_name, p.avatar_url, s.xp_total, s.level, s.current_streak,
       rank() over (order by s.xp_total desc) as rank
  from public.user_stats s join public.profiles p on p.id = s.user_id
 where p.account_status = 'active' and p.deleted_at is null and p.is_public;

create view public.leaderboard_weekly with (security_invoker = true) as
select x.user_id, p.username, p.display_name, p.avatar_url, sum(x.xp)::int as xp_week,
       rank() over (order by sum(x.xp) desc) as rank
  from public.xp_events x join public.profiles p on p.id = x.user_id
 where x.created_at > now() - interval '7 days' and p.account_status = 'active' and p.deleted_at is null and p.is_public
 group by x.user_id, p.username, p.display_name, p.avatar_url;

-- ------------------------------------------------------------ referrals ----
create table public.referral_codes (
  user_id     text primary key references public.profiles(id) on delete cascade,
  code        text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  uses_count  integer not null default 0,
  created_at  timestamptz not null default now()
);
create table public.referrals (
  id           uuid primary key default gen_random_uuid(),
  referrer_id  text not null references public.profiles(id) on delete cascade,
  referred_id  text not null unique references public.profiles(id) on delete cascade,
  code         text not null,
  status       text not null default 'signed_up' check (status in ('signed_up','activated','rewarded')),
  created_at   timestamptz not null default now(),
  activated_at timestamptz,
  check (referrer_id <> referred_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id);

-- Get-or-create the caller's invite code ("Invite Friends" button).
create or replace function public.my_referral_code()
returns text language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); c text;
begin
  if me is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select code into c from public.referral_codes where user_id = me;
  if c is null then
    loop
      c := app.random_code() || app.random_code();
      begin
        insert into public.referral_codes (user_id, code) values (me, c); exit;
      exception when unique_violation then null;
      end;
    end loop;
  end if;
  return c;
end;
$$;

-- Called by the server (service role) when a new user signs up with ?ref=CODE.
create or replace function public.attach_referral(p_referred text, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  perform app.require_backend();      -- SR-00b
  select user_id into r from public.referral_codes where code = upper(p_code);
  if r is null or r = p_referred then return; end if;
  insert into public.referrals (referrer_id, referred_id, code) values (r, p_referred, upper(p_code)) on conflict do nothing;
  if found then update public.referral_codes set uses_count = uses_count + 1 where user_id = r; end if;
end;
$$;

-- Self-service: the caller attaches THEIR OWN referral, once, within 72h of sign-up.
create or replace function public.claim_referral(p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); r text;
begin
  if me is null then raise exception 'sign in required' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where id = me and created_at > now() - interval '72 hours') then return false; end if;
  select user_id into r from public.referral_codes where code = upper(p_code);
  if r is null or r = me then return false; end if;
  insert into public.referrals (referrer_id, referred_id, code) values (r, me, upper(p_code)) on conflict do nothing;
  if not found then return false; end if;
  update public.referral_codes set uses_count = uses_count + 1 where user_id = r;
  return true;
end;
$$;

-- ------------------------------------------------------------- jobs board ----
create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  posted_by       text references public.profiles(id) on delete set null,
  company         text not null check (char_length(company) between 2 and 120),
  title           text not null check (char_length(title) between 3 and 140),
  kind            text not null check (kind in ('full_time','part_time','internship','contract','volunteer','gig')),
  location        text check (char_length(location) <= 120),
  is_remote       boolean not null default false,
  description     text not null check (char_length(description) between 20 and 20000),
  apply_url       text check (apply_url is null or apply_url ~ '^https://'),
  apply_email     text check (apply_email is null or apply_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  salary_min_ugx  bigint check (salary_min_ugx >= 0),
  salary_max_ugx  bigint check (salary_max_ugx >= 0),
  tags            text[] not null default '{}',
  status          text not null default 'pending' check (status in ('pending','published','rejected','closed')),
  reviewed_by     text references public.profiles(id) on delete set null,
  is_featured     boolean not null default false,
  expires_at      timestamptz default (now() + interval '45 days'),
  click_count     integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (apply_url is not null or apply_email is not null),
  check (salary_max_ugx is null or salary_min_ugx is null or salary_max_ugx >= salary_min_ugx)
);
create index jobs_live_idx on public.jobs (created_at desc) where status = 'published';
create trigger jobs_updated_at before update on public.jobs for each row execute function app.set_updated_at();

create or replace function app.guard_job()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.posted_by := app.requesting_user_id(); new.status := 'pending'; new.reviewed_by := null; new.is_featured := false; new.click_count := 0;
    return new;
  end if;
  if new.posted_by is distinct from old.posted_by or new.reviewed_by is distinct from old.reviewed_by
     or new.is_featured is distinct from old.is_featured or new.click_count is distinct from old.click_count
     or (new.status is distinct from old.status and new.status <> 'closed') then
    raise exception 'jobs are approved by admins' using errcode = '42501';
  end if;
  if old.status = 'published' and (new.title, new.description, new.company) is distinct from (old.title, old.description, old.company) then
    new.status := 'pending';   -- edits to live posts go back to review
  end if;
  return new;
end;
$$;
create trigger jobs_guard before insert or update on public.jobs for each row execute function app.guard_job();

-- ------------------------------------------------------------ newsletter ----
create table public.newsletter_subscribers (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  user_id            text references public.profiles(id) on delete set null,
  status             text not null default 'pending' check (status in ('pending','subscribed','unsubscribed','bounced')),
  confirm_token_hash text,                               -- double opt-in (sha256 of emailed token)
  resend_contact_id  text,
  source             text check (char_length(source) <= 60),
  confirmed_at       timestamptz,
  unsubscribed_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index newsletter_email_uniq on public.newsletter_subscribers (lower(email));
create trigger newsletter_subscribers_updated_at before update on public.newsletter_subscribers for each row execute function app.set_updated_at();

-- ---------------------------------------------- consent & data rights (DPPA) ----
create table public.consent_records (
  id           bigint generated always as identity primary key,
  user_id      text references public.profiles(id) on delete cascade,
  anonymous_id text,
  purpose      text not null check (purpose in ('terms','privacy','marketing_email','analytics','whatsapp','cookies_functional')),
  granted      boolean not null,
  policy_version text not null,
  ip_hash      text,                -- sha256(ip + salt); raw IPs are not stored
  user_agent   text check (char_length(user_agent) <= 400),
  created_at   timestamptz not null default now()
);
create index consent_records_user_idx on public.consent_records (user_id, purpose, created_at desc);

create table public.data_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('export','delete','rectify','object')),
  status        text not null default 'received' check (status in ('received','processing','completed','rejected')),
  details       text check (char_length(details) <= 2000),
  export_path   text,                     -- private bucket data-exports/{user_id}/...
  due_at        timestamptz not null default (now() + interval '30 days'),
  handled_by    text references public.profiles(id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index data_requests_status_idx on public.data_requests (status, due_at);
create trigger data_requests_updated_at before update on public.data_requests for each row execute function app.set_updated_at();

create or replace function app.guard_data_request()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.user_id := app.requesting_user_id(); new.status := 'received'; new.export_path := null; new.handled_by := null; new.completed_at := null;
    new.due_at := now() + interval '30 days';
    return new;
  end if;
  raise exception 'data requests are handled by the data protection officer' using errcode = '42501';
end;
$$;
create trigger data_requests_guard before insert or update on public.data_requests for each row execute function app.guard_data_request();

-- Everything we hold about the caller, as one JSON document (export right).
create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me text := app.requesting_user_id();
begin
  if me is null then raise exception 'sign in required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'profile', (select to_jsonb(p) - 'search_tsv' from public.profiles p where p.id = me),
    'contact', (select to_jsonb(pp) from public.profile_private pp where pp.user_id = me),
    'roles', (select jsonb_agg(role) from public.user_roles where user_id = me),
    'tutor_profile', (select to_jsonb(t) - 'flw_subaccount_id' from public.tutor_profiles t where t.user_id = me),
    'payout_methods', (select jsonb_agg(jsonb_build_object('kind', kind, 'network', network, 'account_name', account_name, 'last4', account_last4)) from public.payout_methods where tutor_id = me),
    'enrollments', (select jsonb_agg(to_jsonb(e)) from public.enrollments e where e.user_id = me),
    'lesson_progress', (select jsonb_agg(to_jsonb(l)) from public.lesson_progress l where l.user_id = me),
    'certificates', (select jsonb_agg(to_jsonb(c)) from public.certificates c where c.user_id = me),
    'projects', (select jsonb_agg(to_jsonb(p) - 'search_tsv') from public.projects p where p.owner_id = me),
    'posts', (select jsonb_agg(to_jsonb(p)) from public.posts p where p.author_id = me),
    'comments', (select jsonb_agg(to_jsonb(c)) from public.post_comments c where c.author_id = me),
    'messages_sent', (select jsonb_agg(jsonb_build_object('conversation_id', conversation_id, 'body', body, 'created_at', created_at)) from public.messages where sender_id = me),
    'event_registrations', (select jsonb_agg(to_jsonb(r)) from public.event_registrations r where r.user_id = me),
    'session_bookings', (select jsonb_agg(to_jsonb(b)) from public.session_bookings b where b.learner_id = me),
    'payments', (select jsonb_agg(to_jsonb(p) - 'raw') from public.payments p where p.user_id = me),
    'invoices', (select jsonb_agg(to_jsonb(i)) from public.invoices i where i.user_id = me),
    'payouts', (select jsonb_agg(to_jsonb(p) - 'raw') from public.payouts p where p.tutor_id = me),
    'subscriptions', (select jsonb_agg(to_jsonb(s)) from public.subscriptions s where s.user_id = me),
    'reviews_written', (select jsonb_agg(to_jsonb(r)) from public.tutor_reviews r where r.learner_id = me),
    'notifications', (select jsonb_agg(to_jsonb(n)) from public.notifications n where n.user_id = me),
    'notification_preferences', (select to_jsonb(np) from public.notification_preferences np where np.user_id = me),
    'consents', (select jsonb_agg(to_jsonb(c) - 'ip_hash') from public.consent_records c where c.user_id = me),
    'xp', (select to_jsonb(s) from public.user_stats s where s.user_id = me),
    'badges', (select jsonb_agg(b.code) from public.user_badges ub join public.badges b on b.id = ub.badge_id where ub.user_id = me),
    'referrals', (select jsonb_agg(jsonb_build_object('created_at', created_at, 'status', status)) from public.referrals where referrer_id = me));
end;
$$;

-- Erasure: anonymise the profile and remove personal content. Financial
-- records (payments, invoices, ledger) are retained for statutory
-- accounting purposes but are no longer linked to a name/contact.
-- Service role only — the server also deletes the Clerk user.
create or replace function public.erase_user(p_user text, p_actor text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();      -- SR-00b: server/cron only (after a verified data_request)
  delete from public.profile_private where user_id = p_user;
  delete from public.notification_preferences where user_id = p_user;
  delete from public.onboarding_state where user_id = p_user;
  delete from public.consent_records where user_id = p_user;
  delete from public.notifications where user_id = p_user;
  delete from public.device_tokens where user_id = p_user;
  delete from public.payout_methods where tutor_id = p_user and not exists (select 1 from public.payouts where method_id = payout_methods.id);
  update public.payout_methods set account_ciphertext = 'erased-erased-erased-erased', account_name = 'erased', deleted_at = now() where tutor_id = p_user;
  update public.messages set body = '[deleted]', attachment_path = null, deleted_at = now() where sender_id = p_user;
  update public.posts set body = '[deleted]', link_url = null, image_path = null, deleted_at = now() where author_id = p_user;
  update public.post_comments set body = '[deleted]', deleted_at = now() where author_id = p_user;
  update public.project_comments set body = '[deleted]', deleted_at = now() where author_id = p_user;
  update public.projects set deleted_at = now() where owner_id = p_user;
  update public.newsletter_subscribers set status = 'unsubscribed', email = 'erased+' || id || '@invalid.local', user_id = null where user_id = p_user;
  update public.profiles set username = null, display_name = 'Deleted user', avatar_url = null, headline = null, bio = null,
         location = null, skills = '{}', github_username = null, linkedin_url = null, website_url = null, is_public = false,
         email_opt_in = false, account_status = 'banned', status_reason = 'erased at user request', deleted_at = now()
   where id = p_user;
  delete from public.user_roles where user_id = p_user and role <> 'super_admin';
  update public.data_requests set status = 'completed', completed_at = now(), handled_by = p_actor
   where user_id = p_user and kind = 'delete' and status in ('received','processing');
end;
$$;

-- ---------------------------------------------------------- device tokens ----
create table public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null references public.profiles(id) on delete cascade,
  token        text not null unique check (char_length(token) between 10 and 4096),
  provider     text not null check (provider in ('expo','fcm','apns','webpush')),
  platform     text not null check (platform in ('android','ios','windows','macos','web')),
  app_version  text check (char_length(app_version) <= 40),
  last_seen_at timestamptz not null default now(),
  disabled_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens (user_id) where disabled_at is null;

create or replace function app.guard_device_token()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  new.user_id := app.requesting_user_id();
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then raise exception 'not yours' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger device_tokens_guard before insert or update on public.device_tokens for each row execute function app.guard_device_token();

-- ----------------------------------------------------------- social links ----
create type public.social_platform as enum ('youtube','instagram','tiktok','x','linkedin','discord','facebook',
  'whatsapp_channel','whatsapp_group','telegram','github','threads','other');

create table public.social_links (
  id             uuid primary key default gen_random_uuid(),
  platform       public.social_platform not null,
  url            text not null check (url ~ '^https://' and char_length(url) <= 500),
  label          text check (char_length(label) <= 60),
  display_order  integer not null default 0,
  is_active      boolean not null default true,
  updated_by     text references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- defence in depth: the API validates too (lib/validation/social.ts)
  constraint social_links_domain check (
    case platform
      when 'youtube'          then url ~* '^https://(www\.|m\.)?(youtube\.com|youtu\.be)/'
      when 'instagram'        then url ~* '^https://(www\.)?instagram\.com/'
      when 'tiktok'           then url ~* '^https://(www\.)?tiktok\.com/'
      when 'x'                then url ~* '^https://(www\.)?(x\.com|twitter\.com)/'
      when 'linkedin'         then url ~* '^https://([a-z]{2,3}\.)?linkedin\.com/'
      when 'discord'          then url ~* '^https://(www\.)?(discord\.gg|discord\.com)/'
      when 'facebook'         then url ~* '^https://(www\.|m\.)?(facebook\.com|fb\.com)/'
      when 'whatsapp_channel' then url ~* '^https://(www\.)?whatsapp\.com/channel/'
      when 'whatsapp_group'   then url ~* '^https://chat\.whatsapp\.com/'
      when 'telegram'         then url ~* '^https://(t\.me|telegram\.me)/'
      when 'github'           then url ~* '^https://(www\.)?github\.com/'
      when 'threads'          then url ~* '^https://(www\.)?threads\.(net|com)/'
      else true end)
);
create index social_links_order_idx on public.social_links (display_order) where is_active;
create trigger social_links_updated_at before update on public.social_links for each row execute function app.set_updated_at();

-- ------------------------------------------------------------- analytics ----
create table public.analytics_events (
  id            bigint generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  user_id       text,                         -- no FK: keep history after erasure (ids are pseudonymous)
  anonymous_id  text check (char_length(anonymous_id) <= 64),
  session_id    text check (char_length(session_id) <= 64),
  event_name    text not null check (event_name ~ '^[a-z_\.]{2,60}$'),
  path          text check (char_length(path) <= 500),
  referrer      text check (char_length(referrer) <= 500),
  utm_source    text check (char_length(utm_source) <= 100),
  utm_medium    text check (char_length(utm_medium) <= 100),
  utm_campaign  text check (char_length(utm_campaign) <= 100),
  platform      text check (platform in ('web','android','ios','windows','macos')),
  country       char(2),
  properties    jsonb not null default '{}' check (pg_column_size(properties) <= 4096)
);
create index analytics_events_time_idx on public.analytics_events using brin (occurred_at);
create index analytics_events_name_idx on public.analytics_events (event_name, occurred_at desc);
create index analytics_events_user_idx on public.analytics_events (user_id, occurred_at desc) where user_id is not null;

-- Outbound click counter used by /go/{id} (service role).
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
  end if;
  return u;
end;
$$;

-- SR-01: RLS on for every table created above (deny-by-default until policies in 0990).
select app.enable_rls_all();
