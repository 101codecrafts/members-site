-- =============================================================================
-- Platform: audit log, notification triggers, member workflows, ADMIN
-- control RPCs (every one checks role first and writes audit_log), search,
-- rate limiting, housekeeping.
-- =============================================================================

-- ---------------------------------------------------------------- audit ----
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    text,
  actor_role  text,
  action      text not null,
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb,
  context     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create index audit_log_table_idx on public.audit_log (table_name, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index audit_log_created_idx on public.audit_log using brin (created_at);

create or replace function app.redact(j jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select j - array['search_tsv','account_ciphertext','token_hash','confirm_token_hash','raw','payload']
$$;

create or replace function app.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, old_data, new_data)
  values (app.requesting_user_id(), coalesce(auth.jwt() ->> 'role', session_user::text), lower(tg_op), tg_table_name,
          coalesce(rec ->> 'id', rec ->> 'user_id', rec ->> 'key', rec ->> 'tx_ref'),
          case when tg_op in ('UPDATE','DELETE') then app.redact(to_jsonb(old)) end,
          case when tg_op in ('INSERT','UPDATE') then app.redact(to_jsonb(new)) end);
  return null;
end;
$$;

create or replace function app.audit_action(p_action text, p_table text, p_record text, p_context jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, context)
  values (app.requesting_user_id(), coalesce(auth.jwt() ->> 'role', session_user::text), p_action, p_table, p_record, coalesce(p_context, '{}'))
$$;

-- Server-side events that are not row changes (exports, logins to admin). Service role.
create or replace function public.write_audit(p_actor text, p_action text, p_table text, p_record text, p_context jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  insert into public.audit_log (actor_id, actor_role, action, table_name, record_id, context)
  values (p_actor, 'server', p_action, p_table, p_record, coalesce(p_context, '{}'));
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['user_roles','membership_applications','tutor_applications','tutor_profiles','payments','refunds','payouts',
                           'payout_methods','marketplace_orders','moderation_flags','courses','events','tools','announcements',
                           'site_settings','feature_flags','social_links','coupons','subscription_plans','jobs','launch_placements',
                           'guardian_consents','safeguarding_reports','data_requests','competitions','external_resources','news_items','course_media'] loop
    execute format('create trigger audit_%s after insert or update or delete on public.%I for each row execute function app.audit_row()', t, t);
  end loop;
end $$;
create trigger audit_profiles_status after update on public.profiles for each row
  when (old.account_status is distinct from new.account_status or old.deleted_at is distinct from new.deleted_at)
  execute function app.audit_row();

-- ------------------------------------------------- notification triggers ----
create or replace function app.on_message_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  insert into public.notifications (user_id, type, title, body, link, data)
  select cp.user_id, 'message.new', 'New message', left(new.body, 140), '/dashboard.html#messages/' || new.conversation_id,
         jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id, 'sender_id', new.sender_id)
    from public.conversation_participants cp
   where cp.conversation_id = new.conversation_id and cp.user_id <> new.sender_id and not cp.muted;
  return null;
end;
$$;
create trigger messages_notify after insert on public.messages for each row execute function app.on_message_insert();

-- Child safety at write time too: a message is refused if the pair may not talk.
create or replace function app.guard_message_safety()
returns trigger language plpgsql security definer set search_path = '' as $$
declare other text;
begin
  if app.is_backend() then return new; end if;
  for other in select user_id from public.conversation_participants where conversation_id = new.conversation_id and user_id <> new.sender_id loop
    if not app.can_message(new.sender_id, other) then
      raise exception 'messaging this member is not allowed' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
create trigger messages_safety before insert on public.messages for each row execute function app.guard_message_safety();

create or replace function app.on_comment_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner text; link text;
begin
  case tg_table_name
    when 'project_comments' then select owner_id into owner from public.projects where id = new.project_id; link := '/dashboard.html#projects/' || new.project_id;
    when 'post_comments' then select author_id into owner from public.posts where id = new.post_id; link := '/dashboard.html#feed/' || new.post_id;
    when 'launch_comments' then select owner_id into owner from public.launch_products where id = new.product_id; link := '/dashboard.html#launchpad/' || new.product_id;
  end case;
  if owner is not null and owner <> new.author_id then
    perform app.notify(owner, 'comment.new', 'New comment', left(new.body, 140), link, jsonb_build_object('comment_id', new.id));
  end if;
  return null;
end;
$$;
create trigger project_comments_notify after insert on public.project_comments for each row execute function app.on_comment_insert();
create trigger post_comments_notify after insert on public.post_comments for each row execute function app.on_comment_insert();
create trigger launch_comments_notify after insert on public.launch_comments for each row execute function app.on_comment_insert();

-- ------------------------------------------------------ member workflows ----
create or replace function public.start_direct_conversation(p_other text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id(); k text; c uuid;
begin
  if me is null or not app.is_member() then raise exception 'active account required' using errcode = '42501'; end if;
  if p_other = me then raise exception 'cannot message yourself' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_other and account_status = 'active' and deleted_at is null)
     or not app.can_message(me, p_other) then
    raise exception 'messaging this member is not allowed' using errcode = '42501';     -- one message: no probing
  end if;
  k := least(me, p_other) || '|' || greatest(me, p_other);
  select id into c from public.conversations where direct_key = k;
  if c is null then
    insert into public.conversations (kind, direct_key, created_by) values ('direct', k, me)
    on conflict (direct_key) do update set updated_at = now() returning id into c;
    insert into public.conversation_participants (conversation_id, user_id) values (c, me), (c, p_other) on conflict do nothing;
  end if;
  return c;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer language sql security invoker set search_path = '' as $$
  with u as (update public.notifications set read_at = now()
              where user_id = app.requesting_user_id() and read_at is null and (p_ids is null or id = any(p_ids)) returning 1)
  select count(*)::int from u
$$;

create or replace function public.touch_last_seen()
returns void language plpgsql security definer set search_path = '' as $$
declare me text := app.requesting_user_id();
begin
  if me is null then return; end if;
  update public.profiles set last_seen_at = now() where id = me and (last_seen_at is null or last_seen_at < now() - interval '5 minutes');
  perform app.record_activity(me);
end;
$$;

-- ======================================================== ADMIN CONTROL ====
create or replace function app.require_admin()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'admins only' using errcode = '42501'; end if;
end;
$$;
create or replace function app.require_super_admin()
returns void language plpgsql stable set search_path = '' as $$
begin
  if not app.is_super_admin() then raise exception 'super_admin only' using errcode = '42501'; end if;
end;
$$;

create or replace function public.admin_review_membership(p_application_id uuid, p_decision public.application_status, p_note text default null)
returns public.membership_applications language plpgsql security definer set search_path = '' as $$
declare a public.membership_applications; reviewer text := app.requesting_user_id();
begin
  perform app.require_admin();
  if p_decision not in ('approved','rejected') then raise exception 'decision must be approved or rejected' using errcode = '22023'; end if;
  select * into a from public.membership_applications where id = p_application_id for update;
  if not found then raise exception 'application not found' using errcode = 'P0002'; end if;
  if a.status <> 'pending' then raise exception 'application already %', a.status using errcode = 'P0001'; end if;
  update public.membership_applications set status = p_decision, reviewed_by = reviewer, reviewed_at = now(), review_note = p_note
   where id = a.id returning * into a;
  if p_decision = 'approved' then
    update public.profiles set account_status = 'active', joined_at = coalesce(joined_at, now()) where id = a.user_id;  -- minors: trigger demands guardian consent
    insert into public.user_roles (user_id, role, granted_by) values (a.user_id, 'learner', reviewer) on conflict do nothing;
    perform app.notify(a.user_id, 'membership.approved', 'Welcome to 101 Codecrafts!', 'Your membership was approved.', '/dashboard.html');
  else
    perform app.notify(a.user_id, 'membership.rejected', 'Membership application update',
                       coalesce(p_note, 'Your application was not approved this time.'), '/dashboard.html');
  end if;
  perform app.audit_action('admin.review_membership', 'membership_applications', a.id::text, jsonb_build_object('decision', p_decision));
  return a;
end;
$$;

create or replace function public.admin_bulk_review_membership(p_ids uuid[], p_decision public.application_status, p_note text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare i uuid; n int := 0;
begin
  perform app.require_admin();
  if cardinality(p_ids) > 500 then raise exception 'max 500 per batch' using errcode = '22023'; end if;
  foreach i in array p_ids loop
    begin
      perform public.admin_review_membership(i, p_decision, p_note); n := n + 1;
    exception when sqlstate 'P0001' or sqlstate 'P0002' then null;
    end;
  end loop;
  return n;
end;
$$;

create or replace function public.admin_review_tutor(p_application_id uuid, p_decision public.application_status, p_note text default null,
                                                     p_commission_pct numeric default null)
returns public.tutor_applications language plpgsql security definer set search_path = '' as $$
declare a public.tutor_applications; reviewer text := app.requesting_user_id();
begin
  perform app.require_admin();
  if p_decision not in ('approved','rejected') then raise exception 'decision must be approved or rejected' using errcode = '22023'; end if;
  select * into a from public.tutor_applications where id = p_application_id for update;
  if not found or a.status <> 'pending' then raise exception 'application not pending' using errcode = 'P0001'; end if;
  if p_decision = 'approved' and exists (select 1 from public.profiles where id = a.user_id and is_minor) then
    raise exception 'tutors must be adults' using errcode = 'P0001';
  end if;
  update public.tutor_applications set status = p_decision, reviewed_by = reviewer, reviewed_at = now(), review_note = p_note
   where id = a.id returning * into a;
  if p_decision = 'approved' then
    insert into public.tutor_profiles (user_id, bio, expertise, years_experience, verification_status, verified_at, verified_by, commission_pct_override)
    values (a.user_id, a.bio, a.expertise, a.years_experience, 'verified', now(), reviewer, p_commission_pct)
    on conflict (user_id) do update set verification_status = 'verified', verified_at = now(), verified_by = reviewer,
      bio = excluded.bio, expertise = excluded.expertise, commission_pct_override = coalesce(excluded.commission_pct_override, public.tutor_profiles.commission_pct_override);
    insert into public.user_roles (user_id, role, granted_by) values (a.user_id, 'tutor', reviewer) on conflict do nothing;
    perform app.notify(a.user_id, 'tutor.verified', 'You are now a verified tutor', 'Create your first course from the dashboard.', '/dashboard.html#teach');
  else
    perform app.notify(a.user_id, 'tutor.rejected', 'Tutor application update', coalesce(p_note, 'Your tutor application was not approved this time.'), '/dashboard.html');
  end if;
  perform app.audit_action('admin.review_tutor', 'tutor_applications', a.id::text, jsonb_build_object('decision', p_decision));
  return a;
end;
$$;

-- Suspend / ban / unban. Admin accounts can only be sanctioned by a super_admin.
create or replace function public.admin_set_account_status(p_user text, p_status public.account_status, p_reason text default null,
                                                           p_until timestamptz default null)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare p public.profiles;
begin
  perform app.require_admin();
  if p_user = app.requesting_user_id() then raise exception 'cannot change your own status' using errcode = '42501'; end if;
  if exists (select 1 from public.user_roles where user_id = p_user and role in ('admin','super_admin')) then
    perform app.require_super_admin();
  end if;
  if p_status in ('suspended','banned') and coalesce(char_length(p_reason), 0) < 3 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  update public.profiles set account_status = p_status, status_reason = p_reason,
         suspended_until = case when p_status = 'suspended' then p_until end
   where id = p_user returning * into p;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
  if p_status in ('suspended','banned') then
    update public.tutor_profiles set verification_status = 'suspended' where user_id = p_user and verification_status = 'verified';
  end if;
  perform app.notify(p_user, 'account.status', 'Account ' || p_status, p_reason, '/dashboard.html');
  perform app.audit_action('admin.set_account_status', 'profiles', p_user, jsonb_build_object('status', p_status, 'reason', p_reason, 'until', p_until));
  return p;
end;
$$;

-- Role changes: super_admin only. The last super_admin cannot be removed.
create or replace function public.admin_set_role(p_user text, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_super_admin();
  if p_grant then
    if p_role = 'tutor' and not exists (select 1 from public.tutor_profiles where user_id = p_user) then
      raise exception 'verify the tutor via admin_review_tutor first' using errcode = 'P0001';
    end if;
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, app.requesting_user_id()) on conflict do nothing;
  else
    delete from public.user_roles where user_id = p_user and role = p_role;
  end if;
  perform app.audit_action('admin.set_role', 'user_roles', p_user, jsonb_build_object('role', p_role, 'grant', p_grant));
end;
$$;

-- Publish/reject reviewable content (whitelisted tables only).
create or replace function public.admin_set_content_status(p_entity text, p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare owner text; title text; tbl text;
begin
  perform app.require_admin();
  case p_entity
    when 'course' then
      if p_status not in ('published','rejected','archived','draft','pending_review') then raise exception 'bad status' using errcode = '22023'; end if;
      update public.courses set status = p_status::public.content_status, review_note = p_note, reviewed_by = app.requesting_user_id(),
             published_at = case when p_status = 'published' then coalesce(published_at, now()) else published_at end
       where id = p_id returning tutor_id, courses.title into owner, title;
      tbl := 'courses';
    when 'launch_product' then
      update public.launch_products set status = p_status, launched_on = case when p_status = 'published' then coalesce(launched_on, (now() at time zone 'Africa/Kampala')::date) else launched_on end
       where id = p_id returning owner_id, name into owner, title;
      tbl := 'launch_products';
    when 'job' then
      update public.jobs set status = p_status, reviewed_by = app.requesting_user_id() where id = p_id returning posted_by, jobs.title into owner, title;
      tbl := 'jobs';
    when 'resource' then
      update public.external_resources set status = p_status where id = p_id returning added_by, external_resources.title into owner, title;
      tbl := 'external_resources';
    when 'event' then
      update public.events set status = p_status::public.event_status where id = p_id returning created_by, events.title into owner, title;
      tbl := 'events';
    when 'competition' then
      update public.competitions set status = p_status where id = p_id returning created_by, competitions.title into owner, title;
      tbl := 'competitions';
    when 'news' then
      update public.news_items set status = p_status where id = p_id returning added_by, news_items.title into owner, title;
      tbl := 'news_items';
    else raise exception 'unknown entity' using errcode = '22023';
  end case;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  perform app.notify(owner, 'course.review', '"' || title || '" is now ' || p_status, p_note, '/dashboard.html');
  perform app.audit_action('admin.set_content_status', tbl, p_id::text, jsonb_build_object('status', p_status, 'note', p_note));
end;
$$;

create or replace function public.admin_feature(p_entity text, p_id uuid, p_featured boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  case p_entity
    when 'course' then update public.courses set is_featured = p_featured where id = p_id;
    when 'project' then update public.projects set is_featured = p_featured where id = p_id;
    when 'tool' then update public.tools set is_featured = p_featured where id = p_id;
    when 'event' then update public.events set is_featured = p_featured where id = p_id;
    when 'resource' then update public.external_resources set is_featured = p_featured where id = p_id;
    when 'news' then update public.news_items set is_featured = p_featured where id = p_id;
    when 'job' then update public.jobs set is_featured = p_featured where id = p_id;
    when 'listing' then update public.marketplace_listings set is_featured = p_featured where id = p_id;
    else raise exception 'unknown entity' using errcode = '22023';
  end case;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  perform app.audit_action('admin.feature', p_entity, p_id::text, jsonb_build_object('featured', p_featured));
end;
$$;

create or replace function public.admin_review_placement(p_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.launch_placements set status = case when p_approve then 'approved' else 'rejected' end, approved_by = app.requesting_user_id()
   where id = p_id and status = 'requested';
  if not found then raise exception 'placement not pending' using errcode = 'P0001'; end if;
  perform app.audit_action('admin.review_placement', 'launch_placements', p_id::text, jsonb_build_object('approve', p_approve));
end;
$$;

-- Moderation: dismiss, hide/unhide the target, soft-delete it, or ban its author.
create or replace function public.admin_moderate(p_flag_id uuid, p_action text, p_note text default null)
returns public.moderation_flags language plpgsql security definer set search_path = '' as $$
declare f public.moderation_flags; tid uuid; author text;
begin
  perform app.require_admin();
  select * into f from public.moderation_flags where id = p_flag_id for update;
  if not found then raise exception 'flag not found' using errcode = 'P0002'; end if;
  tid := app.try_uuid(f.target_id);
  if p_action in ('hide','unhide','delete','ban_author') then
    case f.target_type
      when 'post' then
        update public.posts set hidden_at = case when p_action = 'unhide' then null else coalesce(hidden_at, now()) end,
               deleted_at = case when p_action = 'delete' then now() else deleted_at end, hidden_reason = p_note
         where id = tid returning author_id into author;
      when 'post_comment' then
        update public.post_comments set hidden_at = case when p_action = 'unhide' then null else coalesce(hidden_at, now()) end,
               deleted_at = case when p_action = 'delete' then now() else deleted_at end where id = tid returning author_id into author;
      when 'project_comment' then
        update public.project_comments set hidden_at = case when p_action = 'unhide' then null else coalesce(hidden_at, now()) end where id = tid returning author_id into author;
      when 'launch_comment' then
        update public.launch_comments set hidden_at = case when p_action = 'unhide' then null else coalesce(hidden_at, now()) end where id = tid returning author_id into author;
      when 'project' then
        update public.projects set hidden_at = case when p_action = 'unhide' then null else coalesce(hidden_at, now()) end where id = tid returning owner_id into author;
      when 'launch_product' then
        update public.launch_products set hidden_at = case when p_action = 'unhide' then null else coalesce(hidden_at, now()) end where id = tid returning owner_id into author;
      when 'review' then
        update public.tutor_reviews set hidden_at = case when p_action = 'unhide' then null else coalesce(hidden_at, now()) end where id = tid returning learner_id into author;
      when 'message' then
        update public.messages set deleted_at = now() where id = tid returning sender_id into author;
      when 'profile' then author := f.target_id;
      else null;
    end case;
    if p_action = 'ban_author' and author is not null then
      perform public.admin_set_account_status(author, 'banned', coalesce(p_note, 'Community guidelines violation'));
    end if;
  elsif p_action <> 'dismiss' then
    raise exception 'action must be dismiss|hide|unhide|delete|ban_author' using errcode = '22023';
  end if;
  update public.moderation_flags set status = case when p_action = 'dismiss' then 'dismissed'::public.flag_status else 'resolved'::public.flag_status end,
         resolved_by = app.requesting_user_id(), resolved_at = now(), resolution_note = p_note
   where target_type = f.target_type and target_id = f.target_id and status in ('open','reviewing');
  perform app.audit_action('admin.moderate', 'moderation_flags', f.id::text, jsonb_build_object('action', p_action, 'target', f.target_type, 'target_id', f.target_id));
  select * into f from public.moderation_flags where id = p_flag_id;
  return f;
end;
$$;

-- Payouts: approve / hold / reject. Above the threshold only a super_admin may approve.
create or replace function public.admin_review_payout(p_payout_id uuid, p_decision text, p_note text default null)
returns public.payouts language plpgsql security definer set search_path = '' as $$
declare po public.payouts; threshold bigint := coalesce((app.setting('payouts.super_admin_threshold_ugx'))::bigint, 1000000);
begin
  perform app.require_admin();
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then raise exception 'payout not found' using errcode = 'P0002'; end if;
  if po.status not in ('requested','held') then raise exception 'payout is %', po.status using errcode = 'P0001'; end if;
  if po.tutor_id = app.requesting_user_id() then raise exception 'cannot review your own payout' using errcode = '42501'; end if;
  if p_decision = 'approve' then
    if po.amount_ugx > threshold then perform app.require_super_admin(); end if;
    update public.payouts set status = 'approved', reviewed_by = app.requesting_user_id(), reviewed_at = now(), review_note = p_note where id = po.id returning * into po;
  elsif p_decision = 'hold' then
    update public.payouts set status = 'held', reviewed_by = app.requesting_user_id(), reviewed_at = now(), review_note = p_note where id = po.id returning * into po;
  elsif p_decision = 'reject' then
    update public.payouts set status = 'rejected', reviewed_by = app.requesting_user_id(), reviewed_at = now(), review_note = p_note where id = po.id returning * into po;
    perform app.notify(po.tutor_id, 'payout.rejected', 'Payout request rejected', p_note, '/dashboard.html#earnings');
  else
    raise exception 'decision must be approve|hold|reject' using errcode = '22023';
  end if;
  perform app.audit_action('admin.review_payout', 'payouts', po.id::text, jsonb_build_object('decision', p_decision, 'amount_ugx', po.amount_ugx));
  return po;
end;
$$;

-- Refunds: admin creates/approves; the server then calls Flutterwave and
-- finishes with complete_refund() (service role).
create or replace function public.admin_issue_refund(p_payment_id uuid, p_amount_ugx bigint default null, p_reason text default 'Admin refund',
                                                     p_refund_id uuid default null)
returns public.refunds language plpgsql security definer set search_path = '' as $$
declare p public.payments; r public.refunds; amt bigint;
begin
  perform app.require_admin();
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.status not in ('successful','partially_refunded') or p.amount_ugx = 0 then raise exception 'payment not refundable' using errcode = 'P0001'; end if;
  amt := coalesce(p_amount_ugx, p.amount_ugx - p.refunded_ugx);
  if amt <= 0 or amt > p.amount_ugx - p.refunded_ugx then raise exception 'invalid refund amount' using errcode = '22023'; end if;
  if amt > coalesce((app.setting('payouts.super_admin_threshold_ugx'))::bigint, 1000000) then perform app.require_super_admin(); end if;
  if p_refund_id is not null then
    update public.refunds set status = 'processing', approved_by = app.requesting_user_id(), amount_ugx = amt
     where id = p_refund_id and payment_id = p.id and status = 'requested' returning * into r;
    if not found then raise exception 'refund request not found' using errcode = 'P0002'; end if;
  else
    insert into public.refunds (payment_id, amount_ugx, reason, status, requested_by, approved_by)
    values (p.id, amt, p_reason, 'processing', app.requesting_user_id(), app.requesting_user_id()) returning * into r;
  end if;
  perform app.audit_action('admin.issue_refund', 'refunds', r.id::text, jsonb_build_object('payment_id', p.id, 'amount_ugx', amt));
  return r;
end;
$$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb, p_is_public boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_key in ('commission_pct','payments.split_enabled','payouts.super_admin_threshold_ugx','payouts.hold_days') then
    perform app.require_super_admin();       -- money settings
  end if;
  if p_key = 'payouts.hold_days' and (p_value #>> '{}')::int < coalesce((app.setting('refunds.window_days'))::int, 14) then
    raise exception 'hold days must be >= refund window' using errcode = '22023';
  end if;
  insert into public.site_settings (key, value, is_public, updated_by) values (p_key, p_value, coalesce(p_is_public, false), app.requesting_user_id())
  on conflict (key) do update set value = excluded.value, is_public = coalesce(p_is_public, public.site_settings.is_public), updated_by = excluded.updated_by;
end;
$$;

create or replace function public.admin_set_flag(p_key text, p_enabled boolean, p_rollout_pct int default 100, p_roles public.app_role[] default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  insert into public.feature_flags (key, enabled, rollout_pct, allowed_roles, updated_by)
  values (p_key, p_enabled, p_rollout_pct, p_roles, app.requesting_user_id())
  on conflict (key) do update set enabled = excluded.enabled, rollout_pct = excluded.rollout_pct, allowed_roles = excluded.allowed_roles, updated_by = excluded.updated_by;
end;
$$;

create or replace function public.admin_reorder_social_links(p_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.social_links s set display_order = x.ord, updated_by = app.requesting_user_id()
    from unnest(p_ids) with ordinality as x(id, ord) where s.id = x.id;
end;
$$;

create or replace function public.admin_verify_guardian(p_consent_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.guardian_consents set verified_at = now(), verification_method = 'admin_manual' where id = p_consent_id and verified_at is null;
  if not found then raise exception 'consent not pending' using errcode = 'P0001'; end if;
end;
$$;

-- Announcement fan-out: one set-based insert (fast for 10K+ members).
create or replace function public.fanout_announcement(p_announcement_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare a public.announcements; n int;
begin
  if not (app.is_backend() or app.is_admin()) then raise exception 'admins only' using errcode = '42501'; end if;
  select * into a from public.announcements where id = p_announcement_id for update;
  if not found or a.published_at is null then raise exception 'announcement not published' using errcode = 'P0002'; end if;
  if a.fanned_out_at is not null then return 0; end if;
  insert into public.notifications (user_id, type, title, body, link, data)
  select p.id, 'announcement', a.title, left(a.body, 280), coalesce(a.link, '/dashboard.html#announcements'), jsonb_build_object('announcement_id', a.id)
    from public.profiles p
   where p.deleted_at is null and p.account_status = 'active'
     and (a.audience in ('public','members')
          or exists (select 1 from public.user_roles r where r.user_id = p.id and
                     ((a.audience = 'learners' and r.role = 'learner') or (a.audience = 'tutors' and r.role = 'tutor')
                      or (a.audience = 'admins' and r.role in ('admin','super_admin')))));
  get diagnostics n = row_count;
  update public.announcements set fanned_out_at = now() where id = a.id;
  perform app.audit_action('admin.broadcast', 'announcements', a.id::text, jsonb_build_object('recipients', n));
  return n;
end;
$$;

-- ---------------------------------------------------------------- search ----
-- SECURITY INVOKER: every branch is filtered by the caller's RLS. Optional level filter.
create or replace function public.search_all(q text, kinds text[] default null, max_results int default 20,
                                             p_level public.education_level default null)
returns table (kind text, id text, title text, subtitle text, slug text, rank real)
language sql stable security invoker set search_path = '' as $$
  with qq as (
    select app.prefix_tsquery('english'::regconfig, q) as en, app.prefix_tsquery('simple'::regconfig, q) as si,
           '%' || replace(replace(replace(coalesce(q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%' as lk,   -- SR-12
           least(greatest(coalesce(max_results, 20), 1), 50) as lim)
  select * from (
    select 'course'::text, c.id::text, c.title, c.summary, c.slug, ts_rank(c.search_tsv, qq.en)
      from public.courses c, qq
     where (kinds is null or 'course' = any(kinds)) and qq.en is not null and c.search_tsv @@ qq.en and c.status = 'published'
       and c.deleted_at is null and (p_level is null or p_level = any(c.levels) or cardinality(c.levels) = 0)
    union all
    select 'project', p.id::text, p.title, p.summary, p.slug, ts_rank(p.search_tsv, qq.en)
      from public.projects p, qq
     where (kinds is null or 'project' = any(kinds)) and qq.en is not null and p.search_tsv @@ qq.en and p.deleted_at is null
    union all
    select 'resource', r.id::text, r.title, r.description, r.id::text, ts_rank(r.search_tsv, qq.en)
      from public.external_resources r, qq
     where (kinds is null or 'resource' = any(kinds)) and qq.en is not null and r.search_tsv @@ qq.en and r.status = 'published'
       and (p_level is null or p_level = any(r.levels) or cardinality(r.levels) = 0)
    union all
    select 'launch', l.id::text, l.name, l.tagline, l.slug, ts_rank(l.search_tsv, qq.en)
      from public.launch_products l, qq
     where (kinds is null or 'launch' = any(kinds)) and qq.en is not null and l.search_tsv @@ qq.en and l.status = 'published'
    union all
    select 'person', pr.id, nullif(pr.display_name, ''), pr.headline, pr.username, ts_rank(pr.search_tsv, qq.si)
      from public.profiles pr, qq
     where (kinds is null or 'person' = any(kinds)) and qq.si is not null and pr.search_tsv @@ qq.si
       and pr.account_status = 'active' and pr.deleted_at is null
    union all
    select 'tool', t.id::text, t.name, t.description, t.slug, 0.5::real
      from public.tools t, qq
     where (kinds is null or 'tool' = any(kinds)) and t.status = 'published' and (t.name ilike qq.lk or t.category ilike qq.lk)
  ) s (kind, id, title, subtitle, slug, rank)
  order by rank desc, title
  limit (select lim from qq)
$$;

-- Course recommendations by level + interests (invoker → RLS applies).
create or replace function public.recommend_courses(max_results int default 10)
returns setof public.courses language sql stable security invoker set search_path = '' as $$
  with me as (select p.education_level, coalesce(o.interests, '{}') as interests
                from public.profiles p left join public.onboarding_state o on o.user_id = p.id
               where p.id = app.requesting_user_id())
  select c.* from public.courses c left join me on true
   where c.status = 'published' and c.deleted_at is null
     and not exists (select 1 from public.enrollments e where e.course_id = c.id and e.user_id = app.requesting_user_id())
   order by (me.education_level = any(c.levels))::int desc nulls last,
            cardinality(array(select unnest(c.tags) intersect select unnest(me.interests))) desc nulls last,
            c.is_featured desc, c.rating_avg desc, c.enrollments_count desc
   limit least(greatest(coalesce(max_results, 10), 1), 50)
$$;

-- --------------------------------------------------------- rate limiting ----
create table app.rate_limits (
  bucket_key    text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket_key, window_start)
);
alter table app.rate_limits enable row level security;

create or replace function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare w timestamptz; h int;
begin
  perform app.require_backend();
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into app.rate_limits as rl (bucket_key, window_start, hits) values (left(p_key, 200), w, 1)
  on conflict (bucket_key, window_start) do update set hits = rl.hits + 1 returning rl.hits into h;
  return query select h <= p_max, greatest(p_max - h, 0), w + make_interval(secs => p_window_seconds);
end;
$$;

-- ----------------------------------------------------------- housekeeping ----
-- Daily (service role): expire subscriptions, abandon stale checkouts, purge
-- raw payloads (DPPA minimisation, SR-11), drop old rate-limit windows.
create or replace function public.run_daily_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a int; b int; c int;
begin
  perform app.require_backend();
  update public.subscriptions set status = 'past_due' where status = 'active' and current_period_end < now() and not cancel_at_period_end;
  update public.subscriptions set status = 'expired' where (status = 'past_due' and current_period_end < now() - interval '7 days')
                                                     or (status = 'active' and cancel_at_period_end and current_period_end < now());
  get diagnostics a = row_count;
  with stale as (select tx_ref from public.payments where status = 'pending' and created_at < now() - interval '24 hours')
  select count(*) into b from stale, lateral (select app.apply_payment_internal(stale.tx_ref, null, 'abandoned', null, null)) x;
  update public.payments set raw = null where raw is not null and verified_at < now() - interval '90 days';
  update public.webhook_events set payload = '{}' where received_at < now() - interval '30 days' and payload <> '{}';
  delete from app.rate_limits where window_start < now() - interval '1 day';
  delete from public.analytics_events where occurred_at < now() - interval '400 days';
  delete from public.error_events where occurred_at < now() - interval '90 days';
  update public.profiles set account_status = 'active', suspended_until = null, status_reason = null
   where account_status = 'suspended' and suspended_until is not null and suspended_until < now();
  get diagnostics c = row_count;
  return jsonb_build_object('subscriptions_expired', a, 'checkouts_abandoned', b, 'suspensions_lifted', c);
end;
$$;

select app.enable_rls_all();
