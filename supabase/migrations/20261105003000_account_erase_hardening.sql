-- Round 11 (r11/profile-api): secure, working account erasure (Uganda DPPA 2019 right to erasure).
-- NOT applied to staging by the agent. The founder applies it.
--
-- Bugs fixed:
--  1. erase_user() always failed. Its last step set data_requests.handled_by = p_actor ('privacy-job' or 'clerk:user.deleted'),
--     but handled_by REFERENCES profiles(id). The FK violation rolled back the whole erase, so nothing was ever erased
--     and the daily job retried forever. The actor now goes to handled_actor (text); handled_by stays a profile id or null.
--  2. A user could insert any data_requests row for themselves (any status, a back-dated created_at), which skipped the
--     24 h cool-off. Inserts are now limited to status='received' with server defaults.
--  3. There was no way to cancel during the cool-off. Status 'cancelled' and an owner-only cancel policy are added.
--  4. The root admin (super_admin) could be erased by the privacy job. erase_user now refuses a super_admin unless the
--     actor is 'clerk:user.deleted' (the Clerk account is already gone). The API also refuses the request.

alter table public.data_requests add column if not exists handled_actor text check (char_length(handled_actor) <= 80);
alter table public.data_requests add column if not exists cancelled_at timestamptz;
alter table public.data_requests drop constraint if exists data_requests_status_check;
alter table public.data_requests add constraint data_requests_status_check check (status in ('received','processing','completed','rejected','cancelled'));
-- keep only the newest open erase request per user before the unique index (older duplicates -> rejected)
update public.data_requests d set status = 'rejected', handled_actor = 'r11-dedupe'
 where d.kind = 'delete' and d.status in ('received','processing')
   and exists (select 1 from public.data_requests e where e.user_id = d.user_id and e.kind = 'delete' and e.status in ('received','processing')
                and (e.created_at, e.id) > (d.created_at, d.id));
-- one open erase request per user (the API returns the existing one instead of queuing a second)
create unique index if not exists data_requests_one_open_delete on public.data_requests (user_id) where kind = 'delete' and status in ('received','processing');

create or replace function public.erase_user(p_user text, p_actor text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();      -- SR-00b: server/cron only (after a verified data_request)
  if exists (select 1 from public.user_roles where user_id = p_user and role = 'super_admin')
     and coalesce(p_actor, '') <> 'clerk:user.deleted' then
    raise exception 'root admin cannot be erased by this flow' using errcode = '42501';
  end if;
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
  update public.data_requests
     set status = 'completed', completed_at = now(), handled_actor = left(coalesce(p_actor, 'system'), 80),
         handled_by = case when p_actor is not null and exists (select 1 from public.profiles where id = p_actor) then p_actor else null end
   where user_id = p_user and kind = 'delete' and status in ('received','processing');
end;
$$;
revoke all on function public.erase_user(text, text) from public, anon, authenticated;
grant execute on function public.erase_user(text, text) to service_role;

-- the row guard: user inserts are normalised (now also created_at, so the 24 h cool-off can't be back-dated), and the
-- only user update allowed is cancelling your own open delete request
create or replace function app.guard_data_request()
returns trigger language plpgsql set search_path = '' as $$
begin
  if app.is_privileged() or app.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.user_id := app.requesting_user_id(); new.status := 'received'; new.export_path := null; new.handled_by := null; new.completed_at := null;
    new.handled_actor := null; new.cancelled_at := null; new.created_at := now(); new.updated_at := now();
    new.due_at := now() + interval '30 days';
    return new;
  end if;
  if tg_op = 'UPDATE' and old.user_id = app.requesting_user_id() and old.kind = 'delete' and old.status = 'received' and new.status = 'cancelled'
     and new.user_id = old.user_id and new.kind = old.kind and new.details is not distinct from old.details and new.export_path is not distinct from old.export_path
     and new.handled_by is not distinct from old.handled_by and new.completed_at is not distinct from old.completed_at and new.created_at = old.created_at then
    new.cancelled_at := now(); new.updated_at := now(); new.handled_actor := 'user-cancelled';
    return new;
  end if;
  raise exception 'data requests are handled by the data protection officer' using errcode = '42501';
end;
$$;

-- inserts: only a fresh 'received' request for yourself (no back-dating, no self-approval)
drop policy if exists data_requests_insert on public.data_requests;
create policy data_requests_insert on public.data_requests for insert to authenticated
  with check (user_id = (select app.requesting_user_id()) and status = 'received' and handled_by is null and handled_actor is null
              and completed_at is null and cancelled_at is null and created_at > now() - interval '5 minutes' and created_at <= now() + interval '1 minute');
-- owner may cancel their own open delete request during the cool-off (and nothing else)
drop policy if exists data_requests_cancel_own on public.data_requests;
create policy data_requests_cancel_own on public.data_requests for update to authenticated
  using (user_id = (select app.requesting_user_id()) and kind = 'delete' and status = 'received')
  with check (user_id = (select app.requesting_user_id()) and kind = 'delete' and status = 'cancelled' and handled_by is null and completed_at is null);
-- (column grants: status + cancelled_at only; the trigger sets the rest)
grant update (status, cancelled_at) on public.data_requests to authenticated;

select app.enable_rls_all();
