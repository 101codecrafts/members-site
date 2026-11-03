-- =============================================================================
-- Education levels, child safety (minors), groups v2, team projects,
-- Launchpad (showcase), beta Testing area, Competitions/Hackathons.
-- =============================================================================

-- ------------------------------------------------------- education levels ----
alter table public.profiles
  add column education_level public.education_level,
  add column institution     text check (char_length(institution) <= 160),   -- forced null for minors
  add column class_year      text check (char_length(class_year) <= 40),
  add column is_minor        boolean not null default false;                  -- derived from DOB (server-trusted)
create index profiles_level_idx on public.profiles (education_level) where deleted_at is null;

alter table public.profile_private add column date_of_birth date check (date_of_birth > '1900-01-01');

alter table public.tutor_profiles     add column levels_taught public.education_level[] not null default '{}';
alter table public.courses            add column levels public.education_level[] not null default '{}',
                                      add column age_rating public.age_rating not null default 'all';
alter table public.learning_paths     add column levels public.education_level[] not null default '{}';
alter table public.external_resources add column levels public.education_level[] not null default '{}',
                                      add column age_rating public.age_rating not null default 'all';
alter table public.events             add column levels public.education_level[] not null default '{}',
                                      add column age_rating public.age_rating not null default 'all';
create index courses_levels_idx on public.courses using gin (levels);
create index external_resources_levels_idx on public.external_resources using gin (levels);

create or replace function app.caller_is_minor()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_minor from public.profiles p where p.id = app.requesting_user_id()), false)
$$;

-- Content allowed for the caller's age: minors never see 16+/18+ items.
create or replace function app.age_ok(r public.age_rating)
returns boolean language sql stable set search_path = '' as $$
  select r in ('all','13_plus') or not app.caller_is_minor()
$$;

create or replace function app.sync_minor_flag()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.date_of_birth is not null then
    update public.profiles set is_minor = (new.date_of_birth > (now() - interval '18 years')::date) where id = new.user_id;
  end if;
  return null;
end;
$$;
create trigger profile_private_minor after insert or update of date_of_birth on public.profile_private
  for each row execute function app.sync_minor_flag();

create or replace function app.minor_privacy()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_minor then
    new.institution := null; new.is_public := false; new.website_url := null; new.linkedin_url := null;
  end if;
  return new;
end;
$$;
create trigger profiles_minor_privacy before insert or update on public.profiles for each row execute function app.minor_privacy();

create or replace function app.guard_minor_flag()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.is_privileged() and new.is_minor is distinct from old.is_minor then
    raise exception 'is_minor is derived from date of birth' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_minor before update on public.profiles for each row execute function app.guard_minor_flag();

create or replace function app.guard_dob()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not app.is_privileged() and tg_op = 'UPDATE' and old.date_of_birth is not null and new.date_of_birth is distinct from old.date_of_birth then
    raise exception 'date of birth can only be corrected by an admin' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profile_private_guard_dob before update on public.profile_private for each row execute function app.guard_dob();

create table public.guardian_consents (
  id                  uuid primary key default gen_random_uuid(),
  user_id             text not null references public.profiles(id) on delete cascade,
  guardian_name       text not null check (char_length(guardian_name) between 2 and 120),
  guardian_phone      text check (guardian_phone ~ '^\+?[0-9]{7,15}$'),
  guardian_email      text check (guardian_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  relationship        text not null check (relationship in ('parent','guardian','teacher','other')),
  token_hash          text,
  token_expires_at    timestamptz,
  verified_at         timestamptz,
  verification_method text check (verification_method in ('email_link','sms_otp','admin_manual')),
  revoked_at          timestamptz,
  created_at          timestamptz not null default now(),
  check (guardian_phone is not null or guardian_email is not null)
);
alter table public.guardian_consents enable row level security;
create index guardian_consents_user_idx on public.guardian_consents (user_id);

create or replace function app.has_guardian_consent(p_user text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.guardian_consents g where g.user_id = p_user and g.verified_at is not null and g.revoked_at is null)
$$;

create or replace function app.guard_guardian_consent()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    new.user_id := app.requesting_user_id(); new.verified_at := null; new.verification_method := null; new.token_hash := null;
    return new;
  end if;
  raise exception 'guardian consent is verified by the server' using errcode = '42501';
end;
$$;
create trigger guardian_consents_guard before insert or update on public.guardian_consents for each row execute function app.guard_guardian_consent();

create or replace function app.enforce_minor_activation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.account_status = 'active' and old.account_status is distinct from 'active'
     and new.is_minor and not app.has_guardian_consent(new.id) then
    raise exception 'guardian consent required before activating a minor' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger profiles_minor_activation before update of account_status on public.profiles for each row execute function app.enforce_minor_activation();

create table public.user_blocks (
  blocker_id  text not null references public.profiles(id) on delete cascade,
  blocked_id  text not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;

create or replace function app.is_blocked_between(a text, b text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function app.is_tutor_of(p_tutor text, p_learner text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tutor_profiles t where t.user_id = p_tutor and t.verification_status = 'verified')
     and (exists (select 1 from public.enrollments e join public.courses c on c.id = e.course_id
                   where e.user_id = p_learner and c.tutor_id = p_tutor and e.status in ('active','completed'))
       or exists (select 1 from public.session_bookings b join public.tutor_sessions s on s.id = b.session_id
                   where b.learner_id = p_learner and s.tutor_id = p_tutor and b.status in ('confirmed','attended')))
$$;

-- Minors may only talk to other minors, their own verified tutors, or admins. Blocks always win.
create or replace function app.can_message(a text, b text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not app.is_blocked_between(a, b) and (
           (select not is_minor from public.profiles where id = a) and (select not is_minor from public.profiles where id = b)
        or (select is_minor from public.profiles where id = a) and (select is_minor from public.profiles where id = b)
        or exists (select 1 from public.user_roles where user_id in (a, b) and role in ('admin','super_admin'))
        or app.is_tutor_of(a, b) or app.is_tutor_of(b, a))
$$;

create table public.safeguarding_reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   text references public.profiles(id) on delete set null,
  subject_id    text references public.profiles(id) on delete set null,
  minor_id      text references public.profiles(id) on delete set null,
  category      text not null check (category in ('grooming','inappropriate_contact','bullying','self_harm','exploitation','other')),
  details       text not null check (char_length(details) between 10 and 5000),
  evidence_refs jsonb not null default '[]',
  priority      text not null default 'high' check (priority in ('high','urgent')),
  status        text not null default 'open' check (status in ('open','investigating','escalated','closed')),
  handled_by    text references public.profiles(id) on delete set null,
  outcome       text check (char_length(outcome) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.safeguarding_reports enable row level security;
create trigger safeguarding_reports_updated_at before update on public.safeguarding_reports for each row execute function app.set_updated_at();

create or replace function app.guard_safeguarding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_backend() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.reporter_id := app.requesting_user_id(); new.status := 'open'; new.handled_by := null; new.outcome := null;
    insert into public.notifications (user_id, type, title, body, link)
    select ur.user_id, 'account.safeguarding', 'Safeguarding report', 'A new ' || new.category || ' report needs review.', '/admin.html#safeguarding'
      from public.user_roles ur where ur.role in ('admin','super_admin');
    return new;
  end if;
  raise exception 'safeguarding reports are handled by admins' using errcode = '42501';
end;
$$;
create trigger safeguarding_reports_guard before insert or update on public.safeguarding_reports for each row execute function app.guard_safeguarding();

-- ------------------------------------------------------------- groups v2 ----
alter table public.study_groups
  add column kind        text not null default 'study' check (kind in ('study','project_team','chapter','club')),
  add column level       public.education_level,
  add column join_policy text not null default 'open' check (join_policy in ('open','request','invite')),
  add column institution text check (char_length(institution) <= 160),
  add column minors_only boolean not null default false,
  add column adults_only boolean not null default false,
  add constraint study_groups_age_scope check (not (minors_only and adults_only));
comment on table public.study_groups is 'Groups: study groups, project teams, school/university chapters, clubs.';

create table public.group_join_requests (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.study_groups(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  message     text check (char_length(message) <= 500),
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by  text references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (group_id, user_id)
);
alter table public.group_join_requests enable row level security;
create table public.group_invites (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.study_groups(id) on delete cascade,
  invitee_id  text references public.profiles(id) on delete cascade,
  code        text unique check (code ~ '^[A-Z0-9]{8,16}$'),
  invited_by  text references public.profiles(id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  check (invitee_id is not null or code is not null)
);
alter table public.group_invites enable row level security;
alter table public.events add column group_id uuid references public.study_groups(id) on delete set null;

create or replace function app.guard_group_invite()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  new.invited_by := app.requesting_user_id(); new.accepted_at := null;
  if not app.is_group_manager(new.group_id) then raise exception 'group managers only' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger group_invites_guard before insert or update on public.group_invites for each row execute function app.guard_group_invite();

create or replace function app.group_age_ok(p_group uuid, p_user text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case when g.minors_only then p.is_minor when g.adults_only then not p.is_minor else true end
    from public.study_groups g, public.profiles p where g.id = p_group and p.id = p_user
$$;

create or replace function public.join_group(p_group uuid, p_invite_code text default null, p_message text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); g public.study_groups; inv public.group_invites;
begin
  if not app.is_member() then raise exception 'active account required' using errcode = '42501'; end if;
  select * into g from public.study_groups where id = p_group and deleted_at is null;
  if not found then raise exception 'group not found' using errcode = 'P0002'; end if;
  if not coalesce(app.group_age_ok(p_group, me), false) then raise exception 'this group is age-restricted' using errcode = '42501'; end if;
  if exists (select 1 from public.study_group_members where group_id = p_group and user_id = me) then return 'member'; end if;
  if p_invite_code is not null or g.join_policy = 'invite' then
    select * into inv from public.group_invites where group_id = p_group and accepted_at is null and expires_at > now()
       and ((p_invite_code is not null and code = upper(p_invite_code)) or invitee_id = me) limit 1;
    if not found then raise exception 'valid invite required' using errcode = '42501'; end if;
    update public.group_invites set accepted_at = now() where id = inv.id and invitee_id is not null;
    insert into public.study_group_members (group_id, user_id) values (p_group, me);
    return 'member';
  elsif g.join_policy = 'request' or g.is_private then
    insert into public.group_join_requests (group_id, user_id, message) values (p_group, me, p_message)
    on conflict (group_id, user_id) do update set status = 'pending', message = excluded.message;
    insert into public.notifications (user_id, type, title, link)
    select m.user_id, 'group.join_request', 'New request to join ' || g.name, '/dashboard.html#groups/' || g.id
      from public.study_group_members m where m.group_id = g.id and m.role in ('owner','moderator');
    return 'requested';
  else
    insert into public.study_group_members (group_id, user_id) values (p_group, me);
    return 'member';
  end if;
end;
$$;

create or replace function public.decide_join_request(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.group_join_requests;
begin
  select * into r from public.group_join_requests where id = p_request and status = 'pending' for update;
  if not found or not (app.is_group_manager(r.group_id) or app.is_admin()) then
    raise exception 'request not available' using errcode = '42501';
  end if;
  update public.group_join_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_by = app.requesting_user_id() where id = r.id;
  if p_approve then
    insert into public.study_group_members (group_id, user_id) values (r.group_id, r.user_id) on conflict do nothing;
    perform app.notify(r.user_id, 'group.approved', 'You joined the group', null, '/dashboard.html#groups/' || r.group_id);
  end if;
end;
$$;

-- ------------------------------------------------------- team projects ----
alter table public.projects
  add column group_id   uuid references public.study_groups(id) on delete set null,
  add column status     text not null default 'active' check (status in ('planning','active','completed','archived')),
  add column level      public.education_level;

create table public.project_members (
  project_id  uuid not null references public.projects(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  role        text not null default 'contributor' check (role in ('owner','maintainer','contributor')),
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.project_members enable row level security;
create index project_members_user_idx on public.project_members (user_id);

create table public.project_milestones (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  title        text not null check (char_length(title) between 2 and 140),
  due_on       date,
  completed_at timestamptz,
  position     integer not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.project_milestones enable row level security;
create table public.project_tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  milestone_id  uuid references public.project_milestones(id) on delete set null,
  title         text not null check (char_length(title) between 2 and 200),
  details       text check (char_length(details) <= 5000),
  status        text not null default 'todo' check (status in ('todo','doing','review','done')),
  assignee_id   text references public.profiles(id) on delete set null,
  due_on        date,
  position      integer not null default 0,
  created_by    text references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.project_tasks enable row level security;
create index project_tasks_project_idx on public.project_tasks (project_id, status, position);
create trigger project_tasks_updated_at before update on public.project_tasks for each row execute function app.set_updated_at();

create or replace function app.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.owner_id = app.requesting_user_id())
      or exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = app.requesting_user_id())
$$;
create or replace function app.is_project_maintainer(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.owner_id = app.requesting_user_id())
      or exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = app.requesting_user_id() and m.role in ('owner','maintainer'))
$$;
create or replace function app.can_view_project(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects p where p.id = p_project and p.deleted_at is null and p.hidden_at is null and (
           p.visibility = 'public' or (p.visibility = 'members' and app.is_member())
           or (p.visibility = 'group' and p.group_id is not null and app.is_group_member(p.group_id))))
      or app.is_project_member(p_project) or app.is_admin()
$$;
create or replace function app.project_owner_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members (project_id, user_id, role) values (new.id, new.owner_id, 'owner') on conflict do nothing;
  return null;
end;
$$;
create trigger projects_owner_member after insert on public.projects for each row execute function app.project_owner_member();

create or replace function app.guard_project_task()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then new.created_by := app.requesting_user_id(); end if;
  if new.assignee_id is not null and not exists (select 1 from public.project_members m where m.project_id = new.project_id and m.user_id = new.assignee_id) then
    raise exception 'assignee must be a project member' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger project_tasks_guard before insert or update on public.project_tasks for each row execute function app.guard_project_task();

-- ------------------------------------------------------------- launchpad ----
create table public.launch_products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  owner_id        text not null references public.profiles(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete set null,
  group_id        uuid references public.study_groups(id) on delete set null,
  name            text not null check (char_length(name) between 2 and 80),
  tagline         text not null check (char_length(tagline) between 5 and 140),
  description     text check (char_length(description) <= 10000),
  logo_url        text check (logo_url is null or logo_url ~ '^https://'),
  demo_url        text check (demo_url is null or demo_url ~ '^https://'),
  repo_url        text check (repo_url is null or repo_url ~ '^https://'),
  stack_tags      text[] not null default '{}' check (cardinality(stack_tags) <= 20),
  stage           text not null default 'building' check (stage in ('idea','building','beta','launched')),
  level           public.education_level,
  age_rating      public.age_rating not null default 'all',
  status          text not null default 'draft' check (status in ('draft','pending_review','published','rejected','archived')),
  launched_on     date,
  upvotes_count   integer not null default 0,
  comments_count  integer not null default 0,
  followers_count integer not null default 0,
  views_count     integer not null default 0,
  clicks_count    integer not null default 0,
  hidden_at       timestamptz,
  search_tsv      tsvector generated always as (
                    setweight(to_tsvector('english'::regconfig, coalesce(name,'') || ' ' || coalesce(tagline,'')), 'A') ||
                    setweight(to_tsvector('english'::regconfig, app.tags_to_text(stack_tags)), 'B') ||
                    setweight(to_tsvector('english'::regconfig, coalesce(description,'')), 'C')) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.launch_products enable row level security;
create index launch_products_live_idx on public.launch_products (launched_on desc, upvotes_count desc) where status = 'published';
create index launch_products_search_idx on public.launch_products using gin (search_tsv);
create trigger launch_products_updated_at before update on public.launch_products for each row execute function app.set_updated_at();

create table public.launch_makers (
  product_id  uuid not null references public.launch_products(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  role        text not null default 'maker' check (role in ('owner','maker')),
  primary key (product_id, user_id)
);
create table public.launch_media (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.launch_products(id) on delete cascade,
  kind        text not null default 'screenshot' check (kind in ('screenshot','video')),
  url         text not null check (url ~ '^https://'),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create table public.launch_upvotes (
  product_id  uuid not null references public.launch_products(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (product_id, user_id)
);
create table public.launch_follows (
  product_id  uuid not null references public.launch_products(id) on delete cascade,
  user_id     text not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (product_id, user_id)
);
create table public.launch_comments (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.launch_products(id) on delete cascade,
  author_id   text not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.launch_comments(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 5000),
  hidden_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index launch_comments_product_idx on public.launch_comments (product_id, created_at);
create table public.launch_updates (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.launch_products(id) on delete cascade,
  author_id   text not null references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 3 and 140),
  body        text check (char_length(body) <= 10000),
  version     text check (char_length(version) <= 30),
  created_at  timestamptz not null default now()
);
-- Featured / Launch of the day / ad slots: free = admin approved; paid boost = ledger payment.
create table public.launch_placements (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.launch_products(id) on delete cascade,
  slot         text not null check (slot in ('launch_of_the_day','featured','homepage_banner','newsletter')),
  starts_on    date not null,
  ends_on      date not null,
  kind         text not null default 'free' check (kind in ('free','paid_boost')),
  status       text not null default 'requested' check (status in ('requested','approved','rejected','live','ended')),
  payment_id   uuid references public.payments(id) on delete set null,
  requested_by text references public.profiles(id) on delete set null,
  approved_by  text references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create unique index launch_placements_one_lotd on public.launch_placements (starts_on) where slot = 'launch_of_the_day' and status in ('approved','live');
select app.enable_rls_all();

create or replace function app.is_maker(p_product uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.launch_products p where p.id = p_product and p.owner_id = app.requesting_user_id())
      or exists (select 1 from public.launch_makers m where m.product_id = p_product and m.user_id = app.requesting_user_id())
$$;
create or replace function app.can_view_product(p_product uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.launch_products p where p.id = p_product and p.status = 'published' and p.hidden_at is null and app.age_ok(p.age_rating))
      or app.is_maker(p_product) or app.is_admin()
$$;

create or replace function app.guard_launch_product()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.owner_id := app.requesting_user_id();
    if new.status not in ('draft','pending_review') then new.status := 'draft'; end if;
    new.upvotes_count := 0; new.comments_count := 0; new.followers_count := 0; new.views_count := 0; new.clicks_count := 0; new.hidden_at := null;
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id or new.hidden_at is distinct from old.hidden_at
     or (new.upvotes_count, new.comments_count, new.followers_count, new.views_count, new.clicks_count)
        is distinct from (old.upvotes_count, old.comments_count, old.followers_count, old.views_count, old.clicks_count)
     or (new.status is distinct from old.status and new.status not in ('draft','pending_review','archived')) then
    raise exception 'protected launch fields (publishing is reviewed by admins)' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger launch_products_guard before insert or update on public.launch_products for each row execute function app.guard_launch_product();
create trigger launch_comments_guard before insert or update on public.launch_comments for each row execute function app.guard_ugc('author_id');
create trigger launch_upvotes_guard before insert on public.launch_upvotes for each row execute function app.guard_ugc('user_id');
create trigger launch_follows_guard before insert on public.launch_follows for each row execute function app.guard_ugc('user_id');
create trigger launch_updates_guard before insert on public.launch_updates for each row execute function app.guard_ugc('author_id');

create or replace function app.guard_placement()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.requested_by := app.requesting_user_id(); new.status := 'requested'; new.approved_by := null; new.kind := 'free'; new.payment_id := null;
    if not app.is_maker(new.product_id) then raise exception 'makers only' using errcode = '42501'; end if;
    return new;
  end if;
  raise exception 'placements are approved by admins' using errcode = '42501';
end;
$$;
create trigger launch_placements_guard before insert or update on public.launch_placements for each row execute function app.guard_placement();

create or replace function app.launch_counters()
returns trigger language plpgsql security definer set search_path = '' as $$
declare pid uuid := coalesce(new.product_id, old.product_id); d int := case when tg_op = 'INSERT' then 1 else -1 end;
begin
  case tg_table_name
    when 'launch_upvotes'  then update public.launch_products set upvotes_count  = greatest(upvotes_count + d, 0)  where id = pid;
    when 'launch_follows'  then update public.launch_products set followers_count = greatest(followers_count + d, 0) where id = pid;
    when 'launch_comments' then update public.launch_products set comments_count = greatest(comments_count + d, 0) where id = pid;
  end case;
  return null;
end;
$$;
create trigger launch_upvotes_count after insert or delete on public.launch_upvotes for each row execute function app.launch_counters();
create trigger launch_follows_count after insert or delete on public.launch_follows for each row execute function app.launch_counters();
create trigger launch_comments_count after insert or delete on public.launch_comments for each row execute function app.launch_counters();

create or replace function app.launch_update_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, type, title, body, link)
  select f.user_id, 'launch.update', new.title, left(new.body, 200), '/dashboard.html#launchpad/' || new.product_id
    from public.launch_follows f where f.product_id = new.product_id and f.user_id <> new.author_id;
  return null;
end;
$$;
create trigger launch_updates_notify after insert on public.launch_updates for each row execute function app.launch_update_notify();

create or replace function public.promote_project_to_launchpad(p_project uuid, p_tagline text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare pr public.projects; lp uuid;
begin
  if not app.is_project_maintainer(p_project) then raise exception 'project maintainers only' using errcode = '42501'; end if;
  select * into pr from public.projects where id = p_project;
  insert into public.launch_products (slug, owner_id, project_id, group_id, name, tagline, description, repo_url, demo_url, stack_tags, level, status)
  values (pr.slug || '-' || substr(md5(pr.id::text), 1, 6), app.requesting_user_id(), pr.id, pr.group_id, pr.title, p_tagline,
          pr.description, pr.repo_url, case when pr.demo_url ~ '^https://' then pr.demo_url end, pr.tech_stack, pr.level, 'pending_review')
  returning id into lp;
  insert into public.launch_makers (product_id, user_id, role)
  select lp, m.user_id, case when m.user_id = app.requesting_user_id() then 'owner' else 'maker' end from public.project_members m where m.project_id = p_project
  on conflict do nothing;
  return lp;
end;
$$;

-- ---------------------------------------------------------- testing area ----
create table public.test_campaigns (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.launch_products(id) on delete cascade,
  created_by     text not null references public.profiles(id) on delete cascade,
  title          text not null check (char_length(title) between 3 and 140),
  instructions   text not null check (char_length(instructions) between 20 and 20000),
  test_url       text check (test_url is null or test_url ~ '^https://'),
  build_path     text,
  platforms      text[] not null default '{web}' check (platforms <@ array['web','android','ios','windows','macos','linux']),
  tester_slots   integer not null default 20 check (tester_slots between 1 and 1000),
  reward_xp      integer not null default 0 check (reward_xp between 0 and 1000),
  age_rating     public.age_rating not null default 'all',
  deadline       timestamptz not null,
  status         text not null default 'open' check (status in ('draft','open','closed')),
  testers_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger test_campaigns_updated_at before update on public.test_campaigns for each row execute function app.set_updated_at();
create table public.test_testers (
  campaign_id  uuid not null references public.test_campaigns(id) on delete cascade,
  user_id      text not null references public.profiles(id) on delete cascade,
  status       text not null default 'applied' check (status in ('applied','accepted','rejected','completed')),
  platform     text,
  applied_at   timestamptz not null default now(),
  primary key (campaign_id, user_id)
);
create table public.test_feedback (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.test_campaigns(id) on delete cascade,
  tester_id        text not null references public.profiles(id) on delete cascade,
  kind             text not null check (kind in ('bug','feedback','ux','performance','crash')),
  severity         text check (severity in ('low','medium','high','critical')),
  title            text not null check (char_length(title) between 3 and 200),
  steps            text check (char_length(steps) <= 5000),
  expected         text check (char_length(expected) <= 2000),
  actual           text check (char_length(actual) <= 2000),
  platform         text,
  device           text check (char_length(device) <= 120),
  screenshot_paths text[] not null default '{}' check (cardinality(screenshot_paths) <= 10),
  status           text not null default 'open' check (status in ('open','confirmed','fixed','wont_fix','duplicate')),
  maker_note       text check (char_length(maker_note) <= 2000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index test_feedback_campaign_idx on public.test_feedback (campaign_id, status);
create trigger test_feedback_updated_at before update on public.test_feedback for each row execute function app.set_updated_at();
alter table public.user_stats add column tester_reputation integer not null default 0;

-- Rendered as <iframe sandbox="..."> — allow-same-origin is deliberately NOT allowed.
create table public.preview_embeds (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.launch_products(id) on delete cascade,
  url         text not null check (url ~ '^https://' and char_length(url) <= 1000),
  sandbox     text[] not null default '{allow-scripts}' check (sandbox <@ array['allow-scripts','allow-forms','allow-popups','allow-pointer-lock','allow-downloads']),
  height_px   integer not null default 640 check (height_px between 200 and 2000),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
select app.enable_rls_all();

create or replace function app.is_campaign_maker(p_campaign uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.test_campaigns c where c.id = p_campaign and app.is_maker(c.product_id))
$$;
create or replace function app.is_accepted_tester(p_campaign uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.test_testers t where t.campaign_id = p_campaign and t.user_id = app.requesting_user_id() and t.status in ('accepted','completed'))
$$;

create or replace function app.guard_test_rows()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_table_name = 'test_campaigns' then
    if tg_op = 'INSERT' then
      new.created_by := app.requesting_user_id(); new.testers_count := 0;
      if not app.is_maker(new.product_id) then raise exception 'makers only' using errcode = '42501'; end if;
    elsif new.created_by is distinct from old.created_by or new.testers_count is distinct from old.testers_count or new.product_id is distinct from old.product_id then
      raise exception 'protected campaign fields' using errcode = '42501';
    end if;
  elsif tg_table_name = 'test_testers' then
    if tg_op = 'INSERT' then new.user_id := app.requesting_user_id(); new.status := 'applied';
    elsif not app.is_campaign_maker(old.campaign_id) or new.user_id is distinct from old.user_id then
      raise exception 'makers decide on testers' using errcode = '42501';
    end if;
  elsif tg_table_name = 'test_feedback' then
    if tg_op = 'INSERT' then
      new.tester_id := app.requesting_user_id(); new.status := 'open'; new.maker_note := null;
      if not app.is_accepted_tester(new.campaign_id) then raise exception 'accepted testers only' using errcode = '42501'; end if;
    elsif app.is_campaign_maker(old.campaign_id) then
      if (to_jsonb(new) - array['status','maker_note','updated_at']) is distinct from (to_jsonb(old) - array['status','maker_note','updated_at']) then
        raise exception 'makers only triage feedback' using errcode = '42501';
      end if;
    elsif new.status is distinct from old.status or new.maker_note is distinct from old.maker_note or new.tester_id is distinct from old.tester_id then
      raise exception 'testers cannot triage' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger test_campaigns_guard before insert or update on public.test_campaigns for each row execute function app.guard_test_rows();
create trigger test_testers_guard before insert or update on public.test_testers for each row execute function app.guard_test_rows();
create trigger test_feedback_guard before insert or update on public.test_feedback for each row execute function app.guard_test_rows();

create or replace function app.test_effects()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.test_campaigns;
begin
  if tg_table_name = 'test_testers' then
    update public.test_campaigns set testers_count = (select count(*) from public.test_testers where campaign_id = new.campaign_id and status in ('accepted','completed'))
     where id = new.campaign_id returning * into c;
    if c.testers_count > c.tester_slots then raise exception 'all tester slots are taken' using errcode = 'P0001'; end if;
  elsif new.status in ('confirmed','fixed') and old.status = 'open' then
    select * into c from public.test_campaigns where id = new.campaign_id;
    insert into public.user_stats (user_id) values (new.tester_id) on conflict do nothing;
    update public.user_stats set tester_reputation = tester_reputation + case new.severity when 'critical' then 5 when 'high' then 3 else 1 end where user_id = new.tester_id;
    if c.reward_xp > 0 then
      insert into public.xp_events (user_id, action, xp, ref_id) values (new.tester_id, 'test_feedback_accepted', c.reward_xp, new.id::text) on conflict do nothing;
      if found then update public.user_stats set xp_total = xp_total + c.reward_xp where user_id = new.tester_id; end if;
    end if;
    perform app.notify(new.tester_id, 'xp.test_feedback', 'Your report was ' || new.status, new.title, '/dashboard.html#testing');
  end if;
  return null;
end;
$$;
create trigger test_testers_effects after insert or update of status on public.test_testers for each row execute function app.test_effects();
create trigger test_feedback_effects after update of status on public.test_feedback for each row execute function app.test_effects();

-- ---------------------------------------------------------- competitions ----
create table public.competitions (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title               text not null check (char_length(title) between 3 and 140),
  description         text check (char_length(description) <= 20000),
  rules_md            text check (char_length(rules_md) <= 50000),
  levels              public.education_level[] not null default '{}',
  registration_mode   text not null default 'both' check (registration_mode in ('individual','team','both')),
  max_team_size       integer not null default 4 check (max_team_size between 1 and 20),
  registration_opens  timestamptz not null,
  registration_closes timestamptz not null,
  submissions_close   timestamptz not null,
  results_at          timestamptz,
  prizes              jsonb not null default '[]',
  cover_url           text,
  status              text not null default 'draft' check (status in ('draft','published','judging','completed','cancelled')),
  created_by          text references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (registration_closes > registration_opens and submissions_close >= registration_closes)
);
create trigger competitions_updated_at before update on public.competitions for each row execute function app.set_updated_at();
create table public.competition_tracks (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 80),
  description     text,
  level           public.education_level
);
create table public.competition_teams (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 60),
  captain_id      text not null references public.profiles(id) on delete cascade,
  join_code       text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at      timestamptz not null default now(),
  unique (competition_id, name)
);
create table public.competition_entrants (
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  user_id         text not null references public.profiles(id) on delete cascade,
  team_id         uuid references public.competition_teams(id) on delete set null,
  track_id        uuid references public.competition_tracks(id) on delete set null,
  registered_at   timestamptz not null default now(),
  primary key (competition_id, user_id)
);
create table public.competition_submissions (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  track_id        uuid references public.competition_tracks(id) on delete set null,
  user_id         text references public.profiles(id) on delete cascade,
  team_id         uuid references public.competition_teams(id) on delete cascade,
  title           text not null check (char_length(title) between 3 and 140),
  summary         text check (char_length(summary) <= 5000),
  repo_url        text check (repo_url is null or repo_url ~ '^https://'),
  demo_url        text check (demo_url is null or demo_url ~ '^https://'),
  video_url       text check (video_url is null or video_url ~ '^https://'),
  submitted_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  final_score     numeric(7,2),
  rank            integer,
  check (num_nonnulls(user_id, team_id) = 1)
);
create unique index competition_submissions_one_user on public.competition_submissions (competition_id, user_id) where user_id is not null;
create unique index competition_submissions_one_team on public.competition_submissions (competition_id, team_id) where team_id is not null;
create table public.competition_judges (
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  judge_id        text not null references public.profiles(id) on delete cascade,
  primary key (competition_id, judge_id)
);
create table public.rubric_criteria (
  id              uuid primary key default gen_random_uuid(),
  competition_id  uuid not null references public.competitions(id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 80),
  weight          numeric(5,2) not null default 1 check (weight > 0),
  max_score       integer not null default 10 check (max_score between 1 and 100)
);
create table public.submission_scores (
  submission_id  uuid not null references public.competition_submissions(id) on delete cascade,
  criterion_id   uuid not null references public.rubric_criteria(id) on delete cascade,
  judge_id       text not null references public.profiles(id) on delete cascade,
  score          integer not null check (score >= 0),
  comment        text check (char_length(comment) <= 2000),
  scored_at      timestamptz not null default now(),
  primary key (submission_id, criterion_id, judge_id)
);
select app.enable_rls_all();

create or replace function app.is_judge(p_comp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.competition_judges j where j.competition_id = p_comp and j.judge_id = app.requesting_user_id())
$$;
create or replace function app.is_entrant(p_comp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.competition_entrants e where e.competition_id = p_comp and e.user_id = app.requesting_user_id())
$$;
create or replace function app.owns_submission(p_sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.competition_submissions s
                  left join public.competition_entrants e on e.team_id = s.team_id and e.user_id = app.requesting_user_id()
                 where s.id = p_sub and (s.user_id = app.requesting_user_id() or e.user_id is not null))
$$;

create or replace function app.guard_competition_rows()
returns trigger language plpgsql set search_path = '' as $$
declare comp public.competitions; r record;
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_table_name = 'competition_entrants' then
    select * into comp from public.competitions where id = new.competition_id;
    new.user_id := app.requesting_user_id();
    if comp.status <> 'published' or now() not between comp.registration_opens and comp.registration_closes then
      raise exception 'registration is closed' using errcode = 'P0001'; end if;
    if cardinality(comp.levels) > 0 and not exists (select 1 from public.profiles p where p.id = new.user_id and p.education_level = any(comp.levels)) then
      raise exception 'this competition is for other education levels' using errcode = '42501'; end if;
    if new.team_id is not null and not exists (select 1 from public.competition_teams t where t.id = new.team_id and t.competition_id = new.competition_id) then
      raise exception 'team not in this competition' using errcode = '22023'; end if;
  elsif tg_table_name = 'competition_submissions' then
    select * into comp from public.competitions where id = new.competition_id;
    if now() > comp.submissions_close then raise exception 'submissions are closed' using errcode = 'P0001'; end if;
    if tg_op = 'INSERT' then
      if new.team_id is null then new.user_id := app.requesting_user_id(); end if;
      new.final_score := null; new.rank := null;
    elsif new.final_score is distinct from old.final_score or new.rank is distinct from old.rank then
      raise exception 'scores are computed from judging' using errcode = '42501';
    end if;
  elsif tg_table_name = 'submission_scores' then
    new.judge_id := app.requesting_user_id();
    select c.* into comp from public.competitions c join public.competition_submissions s on s.competition_id = c.id where s.id = new.submission_id;
    select * into r from public.rubric_criteria where id = new.criterion_id;
    if not app.is_judge(comp.id) or r.competition_id <> comp.id then raise exception 'judges only' using errcode = '42501'; end if;
    if new.score > r.max_score then raise exception 'score above maximum' using errcode = '22023'; end if;
  elsif tg_table_name = 'competition_teams' then
    new.captain_id := app.requesting_user_id();
  end if;
  return new;
end;
$$;
create trigger competition_entrants_guard before insert on public.competition_entrants for each row execute function app.guard_competition_rows();
create trigger competition_submissions_guard before insert or update on public.competition_submissions for each row execute function app.guard_competition_rows();
create trigger submission_scores_guard before insert or update on public.submission_scores for each row execute function app.guard_competition_rows();
create trigger competition_teams_guard before insert on public.competition_teams for each row execute function app.guard_competition_rows();

create view public.competition_leaderboard with (security_invoker = true) as
select s.competition_id, s.id as submission_id, s.title, s.user_id, s.team_id,
       round(sum(sc.score::numeric / rc.max_score * rc.weight) / nullif(count(distinct sc.judge_id), 0)
             / nullif((select sum(weight) from public.rubric_criteria where competition_id = s.competition_id), 0) * 100, 2) as score_pct
  from public.competition_submissions s
  join public.submission_scores sc on sc.submission_id = s.id
  join public.rubric_criteria rc on rc.id = sc.criterion_id
 group by s.competition_id, s.id, s.title, s.user_id, s.team_id;

create or replace function public.finalize_competition(p_comp uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
  with ranked as (select submission_id, score_pct, rank() over (order by score_pct desc nulls last) rk
                    from public.competition_leaderboard where competition_id = p_comp)
  update public.competition_submissions s set final_score = r.score_pct, rank = r.rk from ranked r where s.id = r.submission_id;
  get diagnostics n = row_count;
  update public.competitions set status = 'completed', results_at = now() where id = p_comp;
  insert into public.certificates (verify_code, user_id, title, recipient_name)
  select app.random_code() || '-' || app.random_code() || '-' || app.random_code(), e.user_id,
         c.title || ' — ' || case s.rank when 1 then '1st place' when 2 then '2nd place' else '3rd place' end,
         coalesce(nullif(p.display_name, ''), 'Participant')
    from public.competition_submissions s
    join public.competitions c on c.id = s.competition_id
    join public.competition_entrants e on e.competition_id = s.competition_id and (e.user_id = s.user_id or e.team_id = s.team_id)
    join public.profiles p on p.id = e.user_id
   where s.competition_id = p_comp and s.rank <= 3;
  return n;
end;
$$;

-- SR-01: RLS on for every table created above (deny-by-default until policies in 0990).
select app.enable_rls_all();
