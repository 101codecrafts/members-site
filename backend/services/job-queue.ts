import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';
import type { Logger } from '@/lib/logger';
import { purgeUserStorage, runJobs, type JobHandler, type JobRow, type QueueStore, type RunSummary, type StorageLike } from '@/lib/job-runner';

/**
 * r13: Postgres job queue worker (app.jobs, migration 20261107013000_r13_jobs_queue.sql — not applied yet).
 * Called by /api/v1/cron/jobs and at the end of the daily cron. Until the migration is applied the RPCs do not
 * exist; the worker then reports `not_migrated` instead of failing the cron.
 */

type RpcFn = (name: string, args?: object) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
const MISSING = new Set(['42883', '42P01', 'PGRST202', 'PGRST205']);

function store(): QueueStore {
  const db = serviceClient();
  const call = (db.rpc as unknown as RpcFn).bind(db);   // the job_* functions are newer than types/database.ts
  const must = async (name: string, args: object) => {
    const { data, error } = await call(name, args);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    return data;
  };
  return {
    claim: async (worker, limit, kinds) => ((await must('job_claim', { p_worker: worker, p_limit: limit, p_kinds: kinds })) ?? []) as JobRow[],
    complete: async (id, result) => { await must('job_complete', { p_id: id, p_result: result }); },
    fail: async (id, error, retry) => (await must('job_fail', { p_id: id, p_error: error, p_retry: retry })) as string | null,
  };
}

export function handlers(): Record<string, JobHandler> {
  return {
    'storage.purge_user': async (payload) => purgeUserStorage(payload, serviceClient().storage as unknown as StorageLike),
  };
}

export async function runDueJobs(log: Logger, o: { budgetMs?: number } = {}): Promise<RunSummary | { skipped: 'not_migrated' }> {
  const worker = `vercel:${process.env.VERCEL_REGION ?? 'local'}:${(process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev').slice(0, 7)}`;
  try {
    const summary = await runJobs(store(), handlers(), {
      worker, budgetMs: o.budgetMs ?? 45_000,
      onError: (job, err) => log.warn('job_failed', { job: job.id, kind: job.kind, attempt: job.attempts, error: err instanceof Error ? err.message.slice(0, 300) : 'error' }),
    });
    log.info('jobs_run', { ...summary });
    return summary;
  } catch (err) {
    if (MISSING.has((err as { code?: string }).code ?? '')) { log.warn('jobs_not_migrated'); return { skipped: 'not_migrated' }; }
    throw err;
  }
}

/** Queue depth for /health/ready: null when the queue is not migrated (or the service key is missing). */
export async function jobStats(): Promise<Record<string, number> | null> {
  try {
    const db = serviceClient();
    const { data, error } = await (db.rpc as unknown as RpcFn).call(db, 'job_stats', {});
    return error ? null : (data as Record<string, number> | null);
  } catch { return null; }
}
