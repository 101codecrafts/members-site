-- Round 13 architecture: a small durable job queue in Postgres + the first job kind, storage.purge_user.
-- NOT APPLIED to staging: the founder applies it (after 20261106030000_r12_event_review). Idempotent.
--
-- Why: Vercel Hobby cron runs at most once a day (https://vercel.com/docs/cron-jobs/usage-and-pricing), and slow
-- or failure-prone side effects (deleting Storage files, emails, provider payouts) should not run inside a user
-- request. Work is written as a row in app.jobs inside the same transaction as the change that needs it, and a
-- worker (backend/services/job-queue.ts, called from /api/v1/cron/jobs and the daily cron) claims rows with
-- FOR UPDATE SKIP LOCKED, runs them, and retries with exponential backoff until max_attempts, then marks them dead.
-- Pattern only; no new extension (Supabase Queues / pgmq would also work, see ARCHITECTURE.md).
--
-- First user: account erasure. app.erase_extra_pii (r12) nulls tutor ID document and store KYC paths, and the
-- r12 comment says "Stored FILES ... must still be deleted from Storage by the backend deletion job". Nothing did.
-- A BEFORE trigger now captures those paths (before the AFTER trigger nulls them) and enqueues one purge job.

create table if not exists app.jobs (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind ~ '^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$' and length(kind) <= 80),
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'queued' check (status in ('queued','running','done','failed','dead','cancelled')),
  attempts      int  not null default 0 check (attempts >= 0),
  max_attempts  int  not null default 8 check (max_attempts between 1 and 50),
  run_after     timestamptz not null default now(),
  locked_by     text,
  locked_until  timestamptz,
  last_error    text,
  result        jsonb,
  dedupe_key    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create unique index if not exists jobs_dedupe_open on app.jobs (dedupe_key) where dedupe_key is not null and status in ('queued','running','failed');
create index if not exists jobs_due on app.jobs (run_after) where status in ('queued','failed');
create index if not exists jobs_lease on app.jobs (locked_until) where status = 'running';
create index if not exists jobs_kind_status on app.jobs (kind, status);
alter table app.jobs enable row level security;   -- no policies: service role / definer functions only
revoke all on app.jobs from public, anon, authenticated;

-- enqueue: returns the id of the open job with the same dedupe key when there is one
create or replace function public.job_enqueue(p_kind text, p_payload jsonb default '{}'::jsonb, p_run_after timestamptz default now(),
                                              p_dedupe_key text default null, p_max_attempts int default 8)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  return app.job_enqueue_internal(p_kind, p_payload, p_run_after, p_dedupe_key, p_max_attempts);
end;
$$;

create or replace function app.job_enqueue_internal(p_kind text, p_payload jsonb, p_run_after timestamptz, p_dedupe_key text, p_max_attempts int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into app.jobs (kind, payload, run_after, dedupe_key, max_attempts)
  values (p_kind, coalesce(p_payload, '{}'::jsonb), coalesce(p_run_after, now()), p_dedupe_key, coalesce(p_max_attempts, 8))
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued','running','failed') do nothing
  returning id into v_id;
  if v_id is null then   -- an open job with this dedupe key already exists
    select id into v_id from app.jobs where dedupe_key = p_dedupe_key and status in ('queued','running','failed') limit 1;
  end if;
  return v_id;
end;
$$;

-- claim due jobs (queued/failed whose run_after passed, or running whose lease expired = crashed worker)
create or replace function public.job_claim(p_worker text, p_limit int default 10, p_kinds text[] default null, p_lease_seconds int default 240)
returns setof app.jobs language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  return query
  with due as (
    select j.id from app.jobs j
     where ((j.status in ('queued','failed') and j.run_after <= now()) or (j.status = 'running' and j.locked_until < now()))
       and (p_kinds is null or j.kind = any(p_kinds))
     order by j.run_after, j.created_at
     limit greatest(1, least(coalesce(p_limit, 10), 100))
     for update skip locked
  )
  update app.jobs j
     set status = 'running', attempts = j.attempts + 1, locked_by = left(coalesce(p_worker, 'worker'), 80),
         locked_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 240), 900))), updated_at = now()
    from due where j.id = due.id
  returning j.*;
end;
$$;

create or replace function public.job_complete(p_id uuid, p_result jsonb default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.require_backend();
  update app.jobs set status = 'done', result = p_result, last_error = null, locked_by = null, locked_until = null,
         finished_at = now(), updated_at = now()
   where id = p_id and status = 'running';
end;
$$;

-- failure: retry after min(30 s * 2^(attempts-1), 6 h); dead after max_attempts
create or replace function public.job_fail(p_id uuid, p_error text, p_retry boolean default true)
returns text language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  perform app.require_backend();
  update app.jobs
     set status = case when not coalesce(p_retry, true) or attempts >= max_attempts then 'dead' else 'failed' end,
         run_after = now() + least(interval '6 hours', make_interval(secs => 30 * power(2, greatest(attempts - 1, 0)))),
         last_error = left(coalesce(p_error, 'error'), 2000), locked_by = null, locked_until = null, updated_at = now(),
         finished_at = case when not coalesce(p_retry, true) or attempts >= max_attempts then now() else null end
   where id = p_id and status = 'running'
  returning status into v_status;
  return v_status;
end;
$$;

-- health / admin view: counts per status and the age of the oldest due job
create or replace function public.job_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when app.is_backend() then jsonb_build_object(
    'queued',  (select count(*) from app.jobs where status = 'queued'),
    'running', (select count(*) from app.jobs where status = 'running'),
    'failed',  (select count(*) from app.jobs where status = 'failed'),
    'dead',    (select count(*) from app.jobs where status = 'dead'),
    'oldest_due_seconds', (select coalesce(extract(epoch from now() - min(run_after))::int, 0) from app.jobs
                            where status in ('queued','failed') and run_after <= now()))
  else null end
$$;

-- housekeeping (called by run_daily_maintenance's caller): finished jobs are kept 30 days, dead ones 90
create or replace function public.job_prune()
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform app.require_backend();
  delete from app.jobs where (status in ('done','cancelled') and finished_at < now() - interval '30 days')
                         or (status = 'dead' and finished_at < now() - interval '90 days');
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.job_enqueue(text, jsonb, timestamptz, text, int), public.job_claim(text, int, text[], int),
  public.job_complete(uuid, jsonb), public.job_fail(uuid, text, boolean), public.job_stats(), public.job_prune(),
  app.job_enqueue_internal(text, jsonb, timestamptz, text, int) from public, anon, authenticated;
grant execute on function public.job_enqueue(text, jsonb, timestamptz, text, int), public.job_claim(text, int, text[], int),
  public.job_complete(uuid, jsonb), public.job_fail(uuid, text, boolean), public.job_stats(), public.job_prune() to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- storage.purge_user: enqueued when a profile is erased (profiles.deleted_at null -> set).
-- prefixes: buckets whose first path segment is the member's own id (storage_realtime policies + certificate job).
--   NOT included on purpose (founder decision, see ARCHITECTURE.md): course-media and listing-files /
--   marketplace-private product files (buyers keep what they paid for), group-files and test-* (owned by a group
--   or a campaign, not the member).
-- paths: explicit files whose path the r12 erase trigger is about to null (tutor ID document, store KYC files).
--   KYC files have no bucket recorded anywhere; they are passed with bucket null and the worker reports them for
--   manual review instead of guessing.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function app.enqueue_storage_purge()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_paths jsonb;
begin
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_paths from (
    select jsonb_build_object('bucket', 'tutor-docs', 'path', ta.id_document_path) as x
      from public.tutor_applications ta where ta.user_id = new.id and ta.id_document_path is not null
    union all
    select jsonb_build_object('bucket', null, 'path', d, 'note', 'store kyc document')
      from public.mkt_stores s join public.mkt_store_private sp on sp.store_id = s.id, unnest(sp.kyc_documents) d
     where s.owner_id = new.id
  ) q;
  perform app.job_enqueue_internal('storage.purge_user',
    jsonb_build_object('user_id', new.id,
      'prefixes', jsonb_build_array(
        jsonb_build_object('bucket', 'avatars',       'prefix', new.id || '/'),
        jsonb_build_object('bucket', 'launch-media',  'prefix', new.id || '/'),
        jsonb_build_object('bucket', 'post-images',   'prefix', new.id || '/'),
        jsonb_build_object('bucket', 'project-files', 'prefix', new.id || '/'),
        jsonb_build_object('bucket', 'tutor-docs',    'prefix', new.id || '/'),
        jsonb_build_object('bucket', 'certificates',  'prefix', new.id || '/'),
        jsonb_build_object('bucket', 'data-exports',  'prefix', new.id || '/')),
      'paths', v_paths),
    now(), 'storage.purge_user:' || new.id, 10);
  return new;
end;
$$;
revoke execute on function app.enqueue_storage_purge() from public, anon, authenticated;

-- BEFORE so it runs ahead of the AFTER trigger profiles_erase_extra_pii, which nulls the paths
drop trigger if exists profiles_enqueue_storage_purge on public.profiles;
create trigger profiles_enqueue_storage_purge before update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function app.enqueue_storage_purge();

select app.enable_rls_all();
