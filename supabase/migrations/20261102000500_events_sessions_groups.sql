-- =============================================================================
-- Events (+ private join info, registrations), tutor live sessions /
-- mentorship bookings (Cal.com), study groups
-- =============================================================================

create table public.events (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text not null check (char_length(title) between 3 and 140),
  description         text check (char_length(description) <= 20000),
  starts_at           timestamptz not null,
  ends_at             timestamptz,
  timezone            text not null default 'Africa/Kampala',
  location            text check (char_length(location) <= 200),
  is_online           boolean not null default false,
  cal_com_url         text check (cal_com_url is null or cal_com_url ~ '^https://(app\.)?cal\.com/'),
  cover_url           text,
  capacity            integer check (capacity is null or capacity > 0),
  price_ugx           bigint not null default 0 check (price_ugx >= 0 and price_ugx <= 100000000),
  status              public.event_status not null default 'draft',
  is_featured         boolean not null default false,
  created_by          text references public.profiles(id) on delete set null,   -- tutor or admin (owner)
  registrations_count integer not null default 0,
  attended_count      integer not null default 0,
  reminder_sent_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  check (ends_at is null or ends_at > starts_at)
);
create index events_upcoming_idx on public.events (starts_at) where status = 'published' and deleted_at is null;
create index events_owner_idx on public.events (created_by);
create trigger events_updated_at before update on public.events for each row execute function app.set_updated_at();

create table public.event_private (
  event_id     uuid primary key references public.events(id) on delete cascade,
  meeting_url  text check (meeting_url is null or meeting_url ~ '^https://'),
  venue_notes  text check (char_length(venue_notes) <= 2000),
  updated_at   timestamptz not null default now()
);
create trigger event_private_updated_at before update on public.event_private for each row execute function app.set_updated_at();

create table public.event_registrations (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,
  user_id           text not null references public.profiles(id) on delete cascade,
  status            public.registration_status not null default 'registered',
  payment_id        uuid,
  checked_in_at     timestamptz,
  reminder_sent_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (event_id, user_id)
);
create index event_registrations_user_idx on public.event_registrations (user_id);
create index event_registrations_event_idx on public.event_registrations (event_id, status);
create trigger event_registrations_updated_at before update on public.event_registrations for each row execute function app.set_updated_at();

create or replace function app.is_registered(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.event_registrations r where r.event_id = p_event
                 and r.user_id = app.requesting_user_id() and r.status in ('registered','attended'))
$$;

create or replace function app.owns_event(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.events e where e.id = p_event and e.created_by = app.requesting_user_id())
$$;

create or replace function app.guard_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := app.requesting_user_id(); new.is_featured := false;
    new.registrations_count := 0; new.attended_count := 0; new.reminder_sent_at := null;
    return new;
  end if;
  if new.created_by is distinct from old.created_by or new.is_featured is distinct from old.is_featured
     or new.registrations_count is distinct from old.registrations_count or new.attended_count is distinct from old.attended_count
     or new.reminder_sent_at is distinct from old.reminder_sent_at then
    raise exception 'protected event fields' using errcode = '42501';
  end if;
  if old.price_ugx <> new.price_ugx and old.registrations_count > 0 then
    raise exception 'cannot change price after registrations exist' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger events_guard before insert or update on public.events for each row execute function app.guard_event();

-- Seat info under a row lock (definer: must count everyone's registrations).
create or replace function app.event_seat_info(p_event uuid, out price bigint, out capacity int, out taken int)
language plpgsql security definer set search_path = '' as $$
begin
  select e.price_ugx, e.capacity into price, capacity from public.events e where e.id = p_event for update;
  select count(*) into taken from public.event_registrations r where r.event_id = p_event and r.status in ('registered','attended');
end;
$$;

-- Capacity + waitlist + transition rules. SECURITY INVOKER on purpose:
-- current_user tells us whether a trusted path (service role or a definer
-- function such as create_checkout/fulfil_payment) is writing.
create or replace function app.registration_rules()
returns trigger language plpgsql set search_path = '' as $$
declare si record; trusted boolean := app.is_privileged() or app.is_admin();
begin
  if tg_op = 'INSERT' then
    select * into si from app.event_seat_info(new.event_id);
    if not trusted then
      new.user_id := app.requesting_user_id(); new.payment_id := null; new.checked_in_at := null; new.status := 'registered';
      if si.price > 0 then raise exception 'paid event: use checkout' using errcode = '42501'; end if;
    end if;
    if new.status in ('registered','waitlisted') and si.capacity is not null then
      new.status := case when si.taken >= si.capacity then 'waitlisted' else 'registered' end;
    end if;
  elsif not trusted then
    if app.owns_event(old.event_id) then
      if new.user_id is distinct from old.user_id or new.event_id is distinct from old.event_id
         or new.payment_id is distinct from old.payment_id or new.status not in ('attended','cancelled','registered','waitlisted') then
        raise exception 'organisers may only manage attendance' using errcode = '42501';
      end if;
    elsif new.user_id is distinct from old.user_id or new.event_id is distinct from old.event_id
       or new.payment_id is distinct from old.payment_id or new.checked_in_at is distinct from old.checked_in_at
       or (new.status is distinct from old.status and new.status <> 'cancelled') then
      raise exception 'learners can only cancel their registration' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger event_registrations_rules before insert or update on public.event_registrations for each row execute function app.registration_rules();

create or replace function app.registration_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ev_id uuid := coalesce(new.event_id, old.event_id); cap int; taken int; promote uuid;
begin
  select capacity into cap from public.events where id = ev_id;
  select count(*) into taken from public.event_registrations where event_id = ev_id and status in ('registered','attended');
  if cap is not null and taken < cap then
    select id into promote from public.event_registrations where event_id = ev_id and status = 'waitlisted' order by created_at limit 1;
    if promote is not null then
      update public.event_registrations set status = 'registered' where id = promote;
      return null;                     -- the nested update recomputes counters
    end if;
  end if;
  update public.events set registrations_count = taken,
         attended_count = (select count(*) from public.event_registrations where event_id = ev_id and status = 'attended')
   where id = ev_id;
  return null;
end;
$$;
create trigger event_registrations_after after insert or update of status or delete on public.event_registrations
  for each row execute function app.registration_after();

-- ---------------------------------------- tutor live sessions / mentorship ----
create table public.tutor_sessions (
  id                uuid primary key default gen_random_uuid(),
  tutor_id          text not null references public.profiles(id) on delete cascade,
  kind              public.session_kind not null default 'one_on_one',
  title             text not null check (char_length(title) between 3 and 140),
  description       text check (char_length(description) <= 5000),
  course_id         uuid references public.courses(id) on delete set null,
  starts_at         timestamptz not null,
  duration_minutes  integer not null default 60 check (duration_minutes between 15 and 480),
  capacity          integer not null default 1 check (capacity between 1 and 500),
  price_ugx         bigint not null default 0 check (price_ugx >= 0 and price_ugx <= 50000000),
  cal_com_url       text check (cal_com_url is null or cal_com_url ~ '^https://(app\.)?cal\.com/'),
  meeting_url       text check (meeting_url is null or meeting_url ~ '^https://'),   -- exposed via session_join_info()
  status            public.session_status not null default 'scheduled',
  bookings_count    integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (kind <> 'one_on_one' or capacity = 1)
);
create index tutor_sessions_tutor_idx on public.tutor_sessions (tutor_id, starts_at);
create index tutor_sessions_upcoming_idx on public.tutor_sessions (starts_at) where status = 'scheduled';
create trigger tutor_sessions_updated_at before update on public.tutor_sessions for each row execute function app.set_updated_at();

create table public.session_bookings (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.tutor_sessions(id) on delete cascade,
  learner_id     text not null references public.profiles(id) on delete cascade,
  status         public.booking_status not null default 'pending_payment',
  payment_id     uuid,
  learner_note   text check (char_length(learner_note) <= 1000),
  cal_booking_uid text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (session_id, learner_id)
);
create index session_bookings_learner_idx on public.session_bookings (learner_id);
create trigger session_bookings_updated_at before update on public.session_bookings for each row execute function app.set_updated_at();
alter table public.tutor_reviews add constraint tutor_reviews_session_fk foreign key (session_id) references public.tutor_sessions(id) on delete set null;

create or replace function app.owns_session(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tutor_sessions s where s.id = p_session and s.tutor_id = app.requesting_user_id())
$$;

create or replace function app.has_attended_tutor(p_tutor text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.session_bookings b join public.tutor_sessions s on s.id = b.session_id
                 where s.tutor_id = p_tutor and b.learner_id = app.requesting_user_id() and b.status in ('confirmed','attended'))
$$;

create or replace function app.guard_session()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.tutor_id := app.requesting_user_id(); new.bookings_count := 0; return new; end if;
  if new.tutor_id is distinct from old.tutor_id or new.bookings_count is distinct from old.bookings_count
     or (old.bookings_count > 0 and new.price_ugx is distinct from old.price_ugx) then
    raise exception 'protected session fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger tutor_sessions_guard before insert or update on public.tutor_sessions for each row execute function app.guard_session();

create or replace function app.session_seat_info(p_session uuid, out tutor_id text, out price bigint, out capacity int,
                                             out taken int, out status public.session_status, out starts_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  select s.tutor_id, s.price_ugx, s.capacity, s.status, s.starts_at into tutor_id, price, capacity, status, starts_at
    from public.tutor_sessions s where s.id = p_session for update;
  select count(*) into taken from public.session_bookings b where b.session_id = p_session and b.status in ('confirmed','attended','pending_payment');
end;
$$;

-- Bookings: free sessions confirm immediately; paid ones are created by
-- create_checkout() and confirmed by the payment webhook. INVOKER (see above).
create or replace function app.booking_rules()
returns trigger language plpgsql set search_path = '' as $$
declare si record; me text := app.requesting_user_id(); trusted boolean := app.is_privileged() or app.is_admin();
begin
  select * into si from app.session_seat_info(coalesce(new.session_id, old.session_id));
  if tg_op = 'INSERT' then
    if not trusted then
      new.learner_id := me; new.payment_id := null; new.status := 'confirmed';
      if si.price > 0 then raise exception 'paid session: use checkout' using errcode = '42501'; end if;
      if si.tutor_id = me then raise exception 'cannot book your own session' using errcode = '22023'; end if;
    end if;
    if si.status <> 'scheduled' or si.starts_at < now() then raise exception 'session not bookable' using errcode = 'P0001'; end if;
    if si.taken >= si.capacity then raise exception 'session is full' using errcode = 'P0001'; end if;
  elsif not trusted then
    if si.tutor_id = me then
      if new.status not in ('attended','no_show','cancelled','confirmed') or new.learner_id is distinct from old.learner_id
         or new.payment_id is distinct from old.payment_id then
        raise exception 'tutors may mark attendance or cancel only' using errcode = '42501';
      end if;
    elsif new.learner_id is distinct from old.learner_id or new.payment_id is distinct from old.payment_id
          or (new.status is distinct from old.status and new.status <> 'cancelled') then
      raise exception 'learners can only cancel' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger session_bookings_rules before insert or update on public.session_bookings for each row execute function app.booking_rules();

create or replace function app.booking_counter()
returns trigger language plpgsql security definer set search_path = '' as $$
declare sid uuid := coalesce(new.session_id, old.session_id);
begin
  update public.tutor_sessions set bookings_count =
    (select count(*) from public.session_bookings where session_id = sid and status in ('confirmed','attended'))
   where id = sid;
  return null;
end;
$$;
create trigger session_bookings_count after insert or update of status or delete on public.session_bookings for each row execute function app.booking_counter();

-- Join link only for the tutor, admins and confirmed learners.
create or replace function public.session_join_info(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.tutor_sessions;
begin
  select * into s from public.tutor_sessions where id = p_session;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  if not (s.tutor_id = app.requesting_user_id() or app.is_admin() or exists (
          select 1 from public.session_bookings b where b.session_id = s.id and b.learner_id = app.requesting_user_id()
             and b.status in ('confirmed','attended'))) then
    raise exception 'not booked' using errcode = '42501';
  end if;
  return jsonb_build_object('meeting_url', s.meeting_url, 'cal_com_url', s.cal_com_url, 'starts_at', s.starts_at);
end;
$$;

-- ----------------------------------------------------------- study groups ----
create table public.study_groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 3 and 80),
  description      text check (char_length(description) <= 2000),
  course_id        uuid references public.courses(id) on delete set null,
  owner_id         text not null references public.profiles(id) on delete cascade,
  is_private       boolean not null default false,
  max_members      integer not null default 50 check (max_members between 2 and 500),
  members_count    integer not null default 0,
  meeting_schedule text check (char_length(meeting_schedule) <= 200),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create trigger study_groups_updated_at before update on public.study_groups for each row execute function app.set_updated_at();

create table public.study_group_members (
  group_id   uuid not null references public.study_groups(id) on delete cascade,
  user_id    text not null references public.profiles(id) on delete cascade,
  role       public.group_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index study_group_members_user_idx on public.study_group_members (user_id);

create or replace function app.is_group_member(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.study_group_members m where m.group_id = p_group and m.user_id = app.requesting_user_id())
$$;
create or replace function app.is_group_manager(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.study_group_members m where m.group_id = p_group
                 and m.user_id = app.requesting_user_id() and m.role in ('owner','moderator'))
$$;
create or replace function app.can_view_group(p_group uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.study_groups g where g.id = p_group and g.deleted_at is null and not g.is_private)
         or app.is_group_member(p_group) or app.is_admin()
$$;

create or replace function app.guard_group()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.owner_id := app.requesting_user_id(); new.members_count := 0; return new; end if;
  if new.owner_id is distinct from old.owner_id or new.members_count is distinct from old.members_count then
    raise exception 'protected group fields' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger study_groups_guard before insert or update on public.study_groups for each row execute function app.guard_group();

create or replace function app.study_group_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.study_group_members (group_id, user_id, role) values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return null;
end;
$$;
create trigger study_groups_owner_join after insert on public.study_groups for each row execute function app.study_group_after_insert();

create or replace function app.study_group_member_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare g public.study_groups;
begin
  if tg_op = 'INSERT' then
    select * into g from public.study_groups where id = new.group_id for update;
    if g.members_count >= g.max_members then raise exception 'study group is full' using errcode = 'P0001'; end if;
    update public.study_groups set members_count = members_count + 1 where id = new.group_id;
  else
    update public.study_groups set members_count = greatest(members_count - 1, 0) where id = old.group_id;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger study_group_members_rules_ins before insert on public.study_group_members for each row execute function app.study_group_member_rules();
create trigger study_group_members_rules_del after delete on public.study_group_members for each row execute function app.study_group_member_rules();
