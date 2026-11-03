-- =============================================================================
-- Community platform: video meetings (provider abstraction, encrypted OAuth
-- tokens, private join links, attendance, recordings, reminders), targeted
-- announcements with read receipts, opportunities board, tech events &
-- meetups (external + 101-hosted extensions), sign-up email guard.
-- =============================================================================

-- ============================================================== meetings ====
create type public.meeting_provider as enum ('jitsi','google_meet','zoom','teams','external');
create type public.meeting_context  as enum ('tutor_session','group','competition','event');

-- OAuth tokens for Google / Zoom / Microsoft, AES-GCM encrypted by the server
-- (lib/crypto encryptSecret with MEETING_TOKEN_KEY). RLS on with NO client
-- policies and no grants: service role only.
create table public.meeting_oauth_tokens (
  user_id        text not null references public.profiles(id) on delete cascade,
  provider       public.meeting_provider not null check (provider in ('google_meet','zoom','teams')),
  account_email  text,
  scope          text,
  access_enc     text not null,
  refresh_enc    text,
  expires_at     timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_id, provider)
);

create table public.meetings (
  id              uuid primary key default gen_random_uuid(),
  host_id         text not null references public.profiles(id) on delete cascade,
  context_type    public.meeting_context not null,
  context_id      uuid not null,
  provider        public.meeting_provider not null default 'jitsi',
  title           text not null check (char_length(title) between 3 and 200),
  starts_at       timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 10 and 600),
  status          text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  external_id     text,                                 -- Zoom meeting id / Google event id / Graph meeting id
  recording_url   text check (recording_url is null or recording_url ~ '^https://'),
  reminded_24h_at timestamptz, reminded_15m_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (context_type, context_id, starts_at)
);
create index meetings_start_idx on public.meetings (starts_at) where status = 'scheduled';
create index meetings_external_idx on public.meetings (provider, external_id);

-- SR-02 pattern: links never in the catalog row; served only by meeting_join().
create table public.meeting_private (
  meeting_id  uuid primary key references public.meetings(id) on delete cascade,
  join_url    text not null check (join_url ~ '^https://'),
  host_url    text check (host_url is null or host_url ~ '^https://'),
  passcode    text
);

create table public.meeting_attendance (
  meeting_id  uuid not null references public.meetings(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  source      text not null default 'join_click' check (source in ('join_click','zoom_webhook','teams','google','manual')),
  primary key (meeting_id, user_id, joined_at)
);

create or replace function app.is_meeting_host(p_meeting uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.meetings m where m.id = p_meeting and m.host_id = app.requesting_user_id())
$$;

-- Who may join: host/admin, or the context's paid/enrolled participants. Minors additionally
-- need verified guardian consent and a verified tutor host.
create or replace function app.can_join_meeting(p_meeting uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare m public.meetings; me text := app.requesting_user_id(); ok boolean := false;
begin
  select * into m from public.meetings where id = p_meeting;
  if m.id is null or me is null then return false; end if;
  if m.host_id = me or app.is_admin() then return true; end if;
  ok := case m.context_type
    when 'tutor_session' then exists (select 1 from public.session_bookings b where b.session_id = m.context_id and b.learner_id = me and b.status in ('confirmed','attended'))
    when 'event' then exists (select 1 from public.event_registrations r where r.event_id = m.context_id and r.user_id = me and r.status in ('registered','attended'))
    when 'group' then exists (select 1 from public.study_group_members g where g.group_id = m.context_id and g.user_id = me)
    when 'competition' then app.is_entrant(m.context_id) or app.is_judge(m.context_id)
  end;
  if ok and app.caller_is_minor() then
    ok := app.has_guardian_consent(me)
          and exists (select 1 from public.tutor_profiles t where t.user_id = m.host_id and t.verification_status = 'verified');
  end if;
  return coalesce(ok, false);
end;
$$;

-- Host creates the meeting row; the server creates the provider meeting then calls meeting_set_link (service).
create or replace function public.meeting_create(p_context public.meeting_context, p_context_id uuid, p_provider public.meeting_provider, p_title text, p_starts_at timestamptz, p_duration int default 60)
returns public.meetings language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); m public.meetings; allowed boolean;
begin
  allowed := app.is_admin() or case p_context
    when 'tutor_session' then app.owns_session(p_context_id)
    when 'event' then app.owns_event(p_context_id)
    when 'group' then app.is_group_manager(p_context_id)
    when 'competition' then app.is_admin()
  end;
  if not coalesce(allowed, false) then raise exception 'only the organiser can schedule this meeting' using errcode = '42501'; end if;
  insert into public.meetings (host_id, context_type, context_id, provider, title, starts_at, duration_minutes)
  values (me, p_context, p_context_id, p_provider, p_title, p_starts_at, coalesce(p_duration, 60)) returning * into m;
  return m;
end;
$$;

create or replace function public.meeting_set_link(p_meeting uuid, p_join_url text, p_host_url text default null, p_passcode text default null, p_external_id text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  insert into public.meeting_private (meeting_id, join_url, host_url, passcode) values (p_meeting, p_join_url, p_host_url, p_passcode)
  on conflict (meeting_id) do update set join_url = excluded.join_url, host_url = excluded.host_url, passcode = excluded.passcode;
  update public.meetings set external_id = coalesce(p_external_id, external_id) where id = p_meeting;
end;
$$;

-- Join: returns the link only to allowed participants, only from 15 min before start until the end; logs attendance.
create or replace function public.meeting_join(p_meeting uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.meetings; mp public.meeting_private; host boolean;
begin
  select * into m from public.meetings where id = p_meeting;
  if m.id is null or not app.can_join_meeting(p_meeting) then raise exception 'not allowed to join' using errcode = '42501'; end if;
  if m.status = 'cancelled' then raise exception 'meeting cancelled' using errcode = 'P0001'; end if;
  host := m.host_id = app.requesting_user_id();
  if not host and (now() < m.starts_at - interval '15 minutes' or now() > m.starts_at + make_interval(mins => m.duration_minutes + 30)) then
    raise exception 'join opens 15 minutes before start' using errcode = 'P0001';
  end if;
  select * into mp from public.meeting_private where meeting_id = m.id;
  if mp.meeting_id is null then raise exception 'link not ready' using errcode = 'P0002'; end if;
  insert into public.meeting_attendance (meeting_id, user_id, source) values (m.id, app.requesting_user_id(), 'join_click');
  return jsonb_build_object('provider', m.provider, 'join_url', case when host then coalesce(mp.host_url, mp.join_url) else mp.join_url end,
                            'passcode', mp.passcode, 'expires_at', now() + interval '15 minutes');
end;
$$;

create or replace function public.meeting_record_attendance(p_provider public.meeting_provider, p_external_id text, p_user text, p_event text, p_at timestamptz default now())
returns void language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  perform app.require_backend();
  select id into mid from public.meetings where provider = p_provider and external_id = p_external_id;
  if mid is null then return; end if;
  if p_event = 'meeting.started' then update public.meetings set status = 'live' where id = mid;
  elsif p_event = 'meeting.ended' then update public.meetings set status = 'ended' where id = mid;
    update public.meeting_attendance set left_at = coalesce(left_at, p_at) where meeting_id = mid;
  elsif p_event = 'participant_joined' and p_user is not null then
    insert into public.meeting_attendance (meeting_id, user_id, joined_at, source) values (mid, p_user, p_at, 'zoom_webhook') on conflict do nothing;
  elsif p_event = 'participant_left' and p_user is not null then
    update public.meeting_attendance set left_at = p_at where meeting_id = mid and user_id = p_user and left_at is null;
  end if;
end;
$$;

-- Cron (service) claims meetings needing a 24h / 15min reminder exactly once.
create or replace function public.meetings_claim_reminders(p_kind text)
returns table (meeting_id uuid, title text, starts_at timestamptz, provider public.meeting_provider)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  if p_kind = '24h' then
    return query update public.meetings m set reminded_24h_at = now()
      where m.status = 'scheduled' and m.reminded_24h_at is null and m.starts_at between now() + interval '23 hours' and now() + interval '25 hours'
      returning m.id, m.title, m.starts_at, m.provider;
  else
    return query update public.meetings m set reminded_15m_at = now()
      where m.status = 'scheduled' and m.reminded_15m_at is null and m.starts_at between now() and now() + interval '20 minutes'
      returning m.id, m.title, m.starts_at, m.provider;
  end if;
end;
$$;

-- ========================================================= announcements ====
alter table public.announcements
  add column target_roles     public.app_role[] not null default '{}',
  add column target_levels    public.education_level[] not null default '{}',
  add column target_group_ids uuid[] not null default '{}',
  add column target_course_ids uuid[] not null default '{}',
  add column send_push        boolean not null default false,
  add column email_digest     boolean not null default false;   -- include in the weekly Resend digest instead of an immediate email
-- published_at in the future = scheduled publish; null = draft (admin-only).

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         text not null references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create or replace function app.announcement_targets_me(a public.announcements)
returns boolean language sql stable security definer set search_path = '' as $$
  select (cardinality(a.target_roles) = 0 or exists (select 1 from public.user_roles r where r.user_id = app.requesting_user_id() and r.role = any(a.target_roles)))
     and (cardinality(a.target_levels) = 0 or exists (select 1 from public.profiles p where p.id = app.requesting_user_id() and p.education_level = any(a.target_levels)))
     and (cardinality(a.target_group_ids) = 0 or exists (select 1 from public.study_group_members g where g.user_id = app.requesting_user_id() and g.group_id = any(a.target_group_ids)))
     and (cardinality(a.target_course_ids) = 0 or exists (select 1 from public.enrollments e where e.user_id = app.requesting_user_id() and e.course_id = any(a.target_course_ids) and e.status = 'active'))
$$;

drop policy announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to anon, authenticated using (
  (select app.is_admin())
  or (published_at is not null and published_at <= now() and (expires_at is null or expires_at > now())
      and (audience = 'public' and cardinality(target_roles) = 0 and cardinality(target_levels) = 0 and cardinality(target_group_ids) = 0 and cardinality(target_course_ids) = 0
           or (audience = 'members' and (select app.is_member()) and app.announcement_targets_me(announcements))
           or (audience = 'learners' and (select app.has_role('learner')) and app.announcement_targets_me(announcements))
           or (audience = 'tutors' and (select app.is_tutor()) and app.announcement_targets_me(announcements)))));

create policy announcement_reads_own on public.announcement_reads for all to authenticated
  using (user_id = app.requesting_user_id() or app.is_admin()) with check (user_id = app.requesting_user_id());

-- ========================================================= opportunities ====
create type public.opportunity_type as enum ('scholarship','internship','job','hackathon','grant','fellowship','competition','bootcamp','volunteer');
create table public.opportunities (
  id               uuid primary key default gen_random_uuid(),
  type             public.opportunity_type not null,
  title            text not null check (char_length(title) between 5 and 200),
  org              text not null check (char_length(org) between 2 and 120),
  summary          text check (char_length(summary) <= 2000),
  location         text, country text, remote boolean not null default false,
  levels           public.education_level[] not null default '{}',     -- eligibility; empty = any
  min_age          int check (min_age between 5 and 99),
  deadline_at      timestamptz,
  deadline_tz      text not null default 'Africa/Kampala',
  url              text not null check (url ~ '^https://'),
  source           text not null default 'member' check (source ~ '^[a-z0-9_.-]{2,40}$'),
  canonical_url    text not null,
  tags             text[] not null default '{}',
  status           public.content_status not null default 'pending_review',
  verified_by_admin boolean not null default false,
  submitted_by     text references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (canonical_url)
);
create index opportunities_live_idx on public.opportunities (deadline_at) where status = 'published';

create table public.opportunity_saves (
  user_id         text not null references public.profiles(id) on delete cascade,
  opportunity_id  uuid not null references public.opportunities(id) on delete cascade,
  reminded_7d_at  timestamptz, reminded_1d_at timestamptz,
  created_at      timestamptz not null default now(),
  primary key (user_id, opportunity_id)
);

-- Minors see only age-appropriate types and nothing with a higher min_age.
create or replace function app.opportunity_visible(o public.opportunities)
returns boolean language sql stable security definer set search_path = '' as $$
  select o.status = 'published' and (o.deadline_at is null or o.deadline_at > now())
     and (not app.caller_is_minor() or (o.type in ('scholarship','competition','hackathon','bootcamp','volunteer') and coalesce(o.min_age, 0) < 18))
$$;

create or replace function app.guard_opportunity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_admin() or app.is_backend() then return new; end if;
  new.submitted_by := app.requesting_user_id(); new.status := 'pending_review'; new.verified_by_admin := false; new.source := 'member';
  return new;
end;
$$;
create trigger opportunities_guard before insert on public.opportunities for each row execute function app.guard_opportunity();

create or replace function public.expire_opportunities()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform app.require_backend();
  update public.opportunities set status = 'archived' where status = 'published' and deadline_at < now();
  get diagnostics n = row_count; return n;
end;
$$;

create or replace function public.opportunity_claim_reminders(p_kind text)
returns table (user_id text, opportunity_id uuid, title text, deadline_at timestamptz, url text)
language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  if p_kind = '7d' then
    return query update public.opportunity_saves s set reminded_7d_at = now() from public.opportunities o
      where o.id = s.opportunity_id and s.reminded_7d_at is null and o.status = 'published' and o.deadline_at between now() + interval '6 days' and now() + interval '7 days'
      returning s.user_id, o.id, o.title, o.deadline_at, o.url;
  else
    return query update public.opportunity_saves s set reminded_1d_at = now() from public.opportunities o
      where o.id = s.opportunity_id and s.reminded_1d_at is null and o.status = 'published' and o.deadline_at between now() and now() + interval '1 day'
      returning s.user_id, o.id, o.title, o.deadline_at, o.url;
  end if;
end;
$$;

-- ============================================================ tech events ====
create type public.event_organiser as enum ('google_gdg','microsoft','openai','anthropic','hugging_face','alibaba_cloud','aws','mlh','101','other');
create type public.event_mode as enum ('physical','online','hybrid');

create table public.external_events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 3 and 200),
  organiser     public.event_organiser not null default 'other',
  organiser_name text,
  mode          public.event_mode not null default 'physical',
  venue         text, city text, country text default 'Uganda',
  lat           numeric(9,6), lng numeric(9,6),
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  timezone      text not null default 'Africa/Kampala',
  price_text    text,
  source        text not null default 'member' check (source ~ '^[a-z0-9_.-]{2,40}$'),
  source_url    text not null check (source_url ~ '^https://'),
  dedupe_key    text not null unique,                 -- source + external id or canonical URL
  min_age       int,
  status        public.content_status not null default 'pending_review',
  verified      boolean not null default false,
  submitted_by  text references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index external_events_upcoming_idx on public.external_events (starts_at) where status = 'published';

create or replace function app.guard_external_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_admin() or app.is_backend() then return new; end if;
  new.submitted_by := app.requesting_user_id(); new.status := 'pending_review'; new.verified := false; new.source := 'member';
  return new;
end;
$$;
create trigger external_events_guard before insert on public.external_events for each row execute function app.guard_external_event();

alter table public.events
  add column organiser public.event_organiser not null default '101',
  add column mode public.event_mode not null default 'physical',
  add column city text, add column lat numeric(9,6), add column lng numeric(9,6),
  add column waitlist_enabled boolean not null default true,
  add column minors_need_guardian boolean not null default true,
  add column reminder_2h_sent_at timestamptz;

-- RSVP with capacity + waitlist; minors need guardian consent for physical/hybrid events.
create or replace function public.event_rsvp(p_event uuid)
returns public.event_registrations language plpgsql security definer set search_path = '' as $$
declare e public.events; me text := app.requesting_user_id(); r public.event_registrations; taken int;
begin
  if me is null or not app.is_member() then raise exception 'members only' using errcode = '42501'; end if;
  select * into e from public.events where id = p_event and status = 'published' and deleted_at is null for update;
  if e.id is null then raise exception 'event not found' using errcode = 'P0002'; end if;
  if e.price_ugx > 0 then raise exception 'paid event: use checkout' using errcode = 'P0001'; end if;
  if e.mode <> 'online' and e.minors_need_guardian and app.caller_is_minor() and not app.has_guardian_consent(me) then
    raise exception 'guardian consent required for in-person events' using errcode = '42501';
  end if;
  select count(*) into taken from public.event_registrations where event_id = e.id and status in ('registered','attended');
  insert into public.event_registrations (event_id, user_id, status)
  values (e.id, me, case when e.capacity is not null and taken >= e.capacity then (case when e.waitlist_enabled then 'waitlisted' else null end)::public.registration_status else 'registered' end)
  on conflict (event_id, user_id) do update set status = excluded.status where public.event_registrations.status = 'cancelled'
  returning * into r;
  if r.id is null then select * into r from public.event_registrations where event_id = e.id and user_id = me; end if;
  return r;
end;
$$;

-- Cancelling frees a seat and promotes the first waitlisted member.
create or replace function public.event_cancel_rsvp(p_event uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare nxt uuid;
begin
  update public.event_registrations set status = 'cancelled' where event_id = p_event and user_id = app.requesting_user_id() and status in ('registered','waitlisted');
  if found then
    select id into nxt from public.event_registrations where event_id = p_event and status = 'waitlisted' order by created_at limit 1 for update skip locked;
    if nxt is not null then
      update public.event_registrations set status = 'registered' where id = nxt;
      perform app.notify((select user_id from public.event_registrations where id = nxt), 'event.waitlist_promoted', 'You are in!', 'A seat opened up for an event you waitlisted.', '/events.html');
    end if;
  end if;
end;
$$;

-- Organiser check-in after the server verified the HMAC ticket signature.
create or replace function public.event_check_in(p_event uuid, p_user text)
returns public.event_registrations language plpgsql security definer set search_path = '' as $$
declare r public.event_registrations;
begin
  if not (app.owns_event(p_event) or app.is_admin()) then raise exception 'organisers only' using errcode = '42501'; end if;
  update public.event_registrations set status = 'attended', checked_in_at = coalesce(checked_in_at, now())
   where event_id = p_event and user_id = p_user and status in ('registered','attended') returning * into r;
  if r.id is null then raise exception 'no valid registration' using errcode = 'P0002'; end if;
  return r;
end;
$$;

-- =========================================================== email guard ====
create table public.email_domain_rules (
  domain     text primary key check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  rule       text not null check (rule in ('allow','deny')),
  note       text,
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
insert into public.email_domain_rules (domain, rule, note) values ('students.cavendish.ac.ug', 'allow', 'Cavendish University student mail')
on conflict do nothing;

create table public.security_events (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind ~ '^[a-z][a-z0-9_.]{2,60}$'),
  user_id      text,
  email_domain text,
  ip_hash      text,
  detail       jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index security_events_kind_idx on public.security_events (kind, created_at desc);

-- Normalised identity for duplicate detection (gmail dots/+tags). Stored hashed only.
create table public.email_fingerprints (
  fingerprint text primary key,         -- sha256(normalised email + salt), computed by the server
  user_id     text not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create or replace function public.email_domain_rule(p_domain text)
returns text language sql stable security definer set search_path = '' as $$
  select r.rule from public.email_domain_rules r where lower(p_domain) = r.domain or lower(p_domain) like '%.' || r.domain
  order by (r.rule = 'allow') desc, length(r.domain) desc limit 1
$$;

create or replace function public.log_security_event(p_kind text, p_user text default null, p_domain text default null, p_ip_hash text default null, p_detail jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  insert into public.security_events (kind, user_id, email_domain, ip_hash, detail) values (p_kind, p_user, p_domain, p_ip_hash, coalesce(p_detail, '{}'));
end;
$$;

-- ================================================================== RLS ======
create policy meetings_read on public.meetings for select to authenticated using (host_id = app.requesting_user_id() or app.is_admin() or app.can_join_meeting(id));
create policy meetings_host_upd on public.meetings for update to authenticated using (host_id = app.requesting_user_id() or app.is_admin()) with check (host_id = app.requesting_user_id() or app.is_admin());
create policy attendance_read on public.meeting_attendance for select to authenticated using (user_id = app.requesting_user_id() or app.is_meeting_host(meeting_id) or app.is_admin());

create policy opp_read on public.opportunities for select to anon, authenticated using (app.opportunity_visible(opportunities) or app.is_admin() or submitted_by = app.requesting_user_id());
create policy opp_submit on public.opportunities for insert to authenticated with check (app.is_member());
create policy opp_admin on public.opportunities for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy opp_admin_del on public.opportunities for delete to authenticated using (app.is_admin());
create policy opp_saves_own on public.opportunity_saves for all to authenticated using (user_id = app.requesting_user_id()) with check (user_id = app.requesting_user_id());

create policy xevents_read on public.external_events for select to anon, authenticated
  using ((status = 'published' and (min_age is null or not app.caller_is_minor() or min_age < 18)) or app.is_admin() or submitted_by = app.requesting_user_id());
create policy xevents_submit on public.external_events for insert to authenticated with check (app.is_member());
create policy xevents_admin on public.external_events for update to authenticated using (app.is_admin()) with check (app.is_admin());
create policy xevents_admin_del on public.external_events for delete to authenticated using (app.is_admin());

create policy domain_rules_admin on public.email_domain_rules for all to authenticated using (app.is_admin()) with check (app.is_admin());
create policy security_events_admin on public.security_events for select to authenticated using (app.is_admin());
-- Service-role-only tables: explicit deny-all policies document intent (and satisfy the policy-coverage CI test).
create policy oauth_tokens_service_only on public.meeting_oauth_tokens for select to authenticated using (false);
create policy meeting_private_service_only on public.meeting_private for select to authenticated using (false);
create policy email_fp_service_only on public.email_fingerprints for select to authenticated using (false);

-- ================================================================ grants ======
revoke all on public.meeting_oauth_tokens, public.meetings, public.meeting_private, public.meeting_attendance, public.announcement_reads,
  public.opportunities, public.opportunity_saves, public.external_events, public.email_domain_rules, public.security_events, public.email_fingerprints from anon, authenticated;
grant select on public.meetings, public.meeting_attendance, public.announcement_reads, public.opportunity_saves, public.email_domain_rules, public.security_events to authenticated;
grant update (title, starts_at, duration_minutes, status, recording_url) on public.meetings to authenticated;
grant insert, delete on public.announcement_reads, public.opportunity_saves to authenticated;
grant select on public.opportunities, public.external_events to anon, authenticated;
grant insert on public.opportunities to authenticated;      -- guard trigger forces pending_review/member source for non-admins
grant update, delete on public.opportunities, public.external_events to authenticated;   -- RLS: admins only
grant insert on public.external_events to authenticated;    -- guard trigger forces pending_review/member source for non-admins
grant insert, update, delete on public.email_domain_rules to authenticated;               -- RLS: admins only
grant select, insert, update, delete on public.meeting_oauth_tokens, public.meetings, public.meeting_private, public.meeting_attendance, public.announcement_reads,
  public.opportunities, public.opportunity_saves, public.external_events, public.email_domain_rules, public.security_events, public.email_fingerprints to service_role;

grant execute on function app.is_meeting_host(uuid), app.can_join_meeting(uuid), app.announcement_targets_me(public.announcements),
  app.opportunity_visible(public.opportunities) to anon, authenticated, service_role;
grant execute on function public.meeting_create(public.meeting_context, uuid, public.meeting_provider, text, timestamptz, int), public.meeting_join(uuid),
  public.event_rsvp(uuid), public.event_cancel_rsvp(uuid), public.event_check_in(uuid, text) to authenticated;
grant execute on function public.meeting_set_link(uuid, text, text, text, text), public.meeting_record_attendance(public.meeting_provider, text, text, text, timestamptz),
  public.meetings_claim_reminders(text), public.expire_opportunities(), public.opportunity_claim_reminders(text),
  public.email_domain_rule(text), public.log_security_event(text, text, text, text, jsonb) to service_role;

select app.enable_rls_all();
