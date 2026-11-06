-- Round 12: admin review of member-submitted events (external_events) + the form fields the submit route used to drop.
-- NOT APPLIED to staging: the founder applies it, after 20261106020000_r12_money_l4.sql. Idempotent.
--
-- Before: external_events had a status (content_status, default pending_review) but no place for a rejection reason,
-- who reviewed it or when, and the admin buttons called /events/:id/approve|reject, which did not exist. The events form
-- also asked for a type, price, currency, description and contact email that were never stored.
-- Now:
--   * external_events gets event_type, price, currency, description (public, shown on the card) and review_reason,
--     reviewed_by, reviewed_at. review_reason is only set on a rejection, so it is never on a published (public) row.
--   * The submitter's contact email goes into a SEPARATE table, external_event_contacts, readable only by admins and the
--     submitter. It is not a column on external_events, because that table is readable by anon for published rows.
--   * public.admin_review_external_event(id, 'approve'|'reject', reason): admin scope 'approvals', row lock, only a
--     pending_review row can be decided, reason required to reject (3..300 chars), audit_log entry (before -> after),
--     in-app notification to the submitter.
-- The API degrades while this is unapplied: it falls back to a status-only update + server audit row + notification,
-- and the submit route stores only the original columns (plus price_text).

alter table public.external_events
  add column if not exists event_type    text,
  add column if not exists price         numeric(12,2),
  add column if not exists currency      text,
  add column if not exists description   text,
  add column if not exists review_reason text,
  add column if not exists reviewed_by   text references public.profiles(id) on delete set null,
  add column if not exists reviewed_at   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'external_events_r12_review_chk') then
    alter table public.external_events add constraint external_events_r12_review_chk check (
      (event_type is null or event_type in ('hackathon','meetup','conference','workshop','webinar','study jam'))
      and (price is null or (price >= 0 and price <= 1000000000))
      and (currency is null or currency in ('UGX','USD','KES'))
      and (description is null or char_length(description) <= 2000)
      and (review_reason is null or char_length(review_reason) between 3 and 300));
  end if;
end $$;

create index if not exists external_events_pending_idx on public.external_events (created_at) where status = 'pending_review';

-- Non-admin inserts may not pre-fill review fields (the guard already forces status/source/submitted_by).
create or replace function app.guard_external_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app.is_admin() or app.is_backend() then return new; end if;
  new.submitted_by := app.requesting_user_id(); new.status := 'pending_review'; new.verified := false; new.source := 'member';
  new.review_reason := null; new.reviewed_by := null; new.reviewed_at := null;
  return new;
end;
$$;

-- --------------------------------------------------------- submitter contact (private) ----
create table if not exists public.external_event_contacts (
  event_id      uuid primary key references public.external_events(id) on delete cascade,
  user_id       text not null references public.profiles(id) on delete cascade,
  contact_email text not null check (char_length(contact_email) between 3 and 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at    timestamptz not null default now()
);
alter table public.external_event_contacts enable row level security;
drop policy if exists xevent_contacts_read on public.external_event_contacts;
create policy xevent_contacts_read on public.external_event_contacts for select to authenticated
  using (app.is_admin() or user_id = app.requesting_user_id());
drop policy if exists xevent_contacts_insert on public.external_event_contacts;
create policy xevent_contacts_insert on public.external_event_contacts for insert to authenticated
  with check (user_id = app.requesting_user_id()
              and exists (select 1 from public.external_events e where e.id = event_id and e.submitted_by = app.requesting_user_id()));
revoke all on public.external_event_contacts from anon, authenticated;
grant select, insert on public.external_event_contacts to authenticated;
grant all on public.external_event_contacts to service_role;

-- ------------------------------------------------------------------ the review RPC ----
create or replace function public.admin_review_external_event(p_id uuid, p_decision text, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ev public.external_events; r text := nullif(btrim(coalesce(p_reason, '')), ''); next_status public.content_status;
begin
  perform app.require_scope('approvals');
  if p_decision not in ('approve', 'reject') then raise exception 'decision must be approve or reject' using errcode = '22023'; end if;
  if r is not null and char_length(r) > 300 then raise exception 'reason is too long (300 characters max)' using errcode = '22023'; end if;
  if p_decision = 'reject' and (r is null or char_length(r) < 3) then raise exception 'a reason (3+ characters) is required to reject' using errcode = '22023'; end if;
  select * into ev from public.external_events where id = p_id for update;
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  if ev.status <> 'pending_review' then raise exception 'this event was already reviewed (status %)', ev.status using errcode = 'P0001'; end if;
  next_status := case when p_decision = 'approve' then 'published' else 'rejected' end;
  update public.external_events
     set status = next_status, review_reason = case when p_decision = 'reject' then r end,
         reviewed_by = app.requesting_user_id(), reviewed_at = now()
   where id = p_id;
  perform app.audit_change('admin.event_' || p_decision, 'external_events', p_id::text,
    jsonb_build_object('status', ev.status), jsonb_build_object('status', next_status),
    jsonb_build_object('title', ev.title, 'reason', r, 'submitted_by', ev.submitted_by));
  perform app.notify(ev.submitted_by, 'event.review',
    case when p_decision = 'approve' then 'Your event "' || left(ev.title, 140) || '" is live'
         else 'Your event "' || left(ev.title, 140) || '" was not approved' end,
    r, '/events.html', jsonb_build_object('event_id', p_id, 'decision', p_decision));
  return jsonb_build_object('id', p_id, 'status', next_status, 'reason', r, 'reviewed_at', now());
end;
$$;
revoke execute on function public.admin_review_external_event(uuid, text, text) from public, anon;
grant execute on function public.admin_review_external_event(uuid, text, text) to authenticated, service_role;
