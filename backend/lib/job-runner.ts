/**
 * r13 architecture: the worker loop for app.jobs (migration 20261107013000_r13_jobs_queue.sql) and the first job
 * handler, storage.purge_user. Pure: the queue store and the storage client are passed in, so unit tests use fakes
 * and services/job-queue.ts wires the real Supabase clients.
 */

export interface JobRow { id: string; kind: string; payload: unknown; attempts: number; max_attempts: number }

export interface QueueStore {
  claim(worker: string, limit: number, kinds: string[] | null): Promise<JobRow[]>;
  complete(id: string, result: unknown): Promise<void>;
  /** returns the new status ('failed' = will retry, 'dead' = gave up) */
  fail(id: string, error: string, retry: boolean): Promise<string | null>;
}

/** Throw this from a handler when retrying cannot help (bad payload, unknown kind). */
export class PermanentJobError extends Error {
  constructor(message: string) { super(message); this.name = 'PermanentJobError'; }
}

export type JobHandler = (payload: unknown, job: JobRow) => Promise<unknown>;

export interface RunSummary { claimed: number; done: number; retrying: number; dead: number; batches: number; stopped: 'empty' | 'budget' | 'max_batches' }

/**
 * Claims and runs due jobs in batches until the queue is empty, the time budget is spent (Hobby functions stop at
 * 300 s: https://vercel.com/docs/limits) or maxBatches is reached. One failing job never stops the others.
 */
export async function runJobs(store: QueueStore, handlers: Record<string, JobHandler>, o: {
  worker: string; batchSize?: number; maxBatches?: number; budgetMs?: number; now?: () => number;
  onError?: (job: JobRow, err: unknown) => void;
}): Promise<RunSummary> {
  const now = o.now ?? Date.now;
  const start = now();
  const budget = o.budgetMs ?? 45_000;
  const kinds = Object.keys(handlers);
  const s: RunSummary = { claimed: 0, done: 0, retrying: 0, dead: 0, batches: 0, stopped: 'empty' };
  for (;;) {
    if (s.batches >= (o.maxBatches ?? 20)) { s.stopped = 'max_batches'; break; }
    if (now() - start >= budget) { s.stopped = 'budget'; break; }
    const jobs = await store.claim(o.worker, o.batchSize ?? 10, kinds);
    s.batches++;
    if (!jobs.length) { s.stopped = 'empty'; break; }
    s.claimed += jobs.length;
    for (const job of jobs) {
      const handler = handlers[job.kind];
      try {
        if (!handler) throw new PermanentJobError(`no handler for ${job.kind}`);
        const result = await handler(job.payload, job);
        await store.complete(job.id, result ?? null);
        s.done++;
      } catch (err) {
        o.onError?.(job, err);
        const msg = err instanceof Error ? err.message : String(err);
        const status = await store.fail(job.id, msg.slice(0, 2000), !(err instanceof PermanentJobError));
        if (status === 'dead') s.dead++; else s.retrying++;
      }
    }
  }
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// storage.purge_user
// ---------------------------------------------------------------------------------------------------------------

/** The slice of supabase-js storage the purge needs (db.storage.from(bucket).list/remove). */
export interface StorageLike {
  from(bucket: string): {
    list(prefix: string, opts: { limit: number; offset: number }): Promise<{ data: { name: string; id: string | null }[] | null; error: { message: string } | null }>;
    remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

export interface PurgePayload {
  user_id: string;
  prefixes: { bucket: string; prefix: string }[];
  paths: { bucket: string | null; path: string; note?: string }[];
}

/** Buckets the purge may touch. Paid content (course-media, listing-files, marketplace-private) is never listed. */
export const PURGE_BUCKETS = new Set(['avatars', 'launch-media', 'post-images', 'project-files', 'tutor-docs', 'certificates', 'data-exports']);

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{3,80}$/;

export function parsePurgePayload(raw: unknown): PurgePayload {
  const p = (raw ?? {}) as Partial<PurgePayload>;
  if (typeof p.user_id !== 'string' || !SAFE_SEGMENT.test(p.user_id)) throw new PermanentJobError('purge: invalid user_id');
  const own = `${p.user_id}/`;
  const prefixes = (Array.isArray(p.prefixes) ? p.prefixes : []).map((x) => {
    if (!x || !PURGE_BUCKETS.has(x.bucket)) throw new PermanentJobError(`purge: bucket not allowed: ${String(x?.bucket)}`);
    if (x.prefix !== own) throw new PermanentJobError('purge: prefix must be the member\'s own folder');
    return { bucket: x.bucket, prefix: x.prefix };
  });
  const paths = (Array.isArray(p.paths) ? p.paths : []).map((x) => {
    if (!x || typeof x.path !== 'string' || !x.path || x.path.includes('..') || x.path.startsWith('/')) throw new PermanentJobError('purge: invalid path');
    if (x.bucket !== null && !PURGE_BUCKETS.has(x.bucket)) throw new PermanentJobError(`purge: bucket not allowed: ${String(x.bucket)}`);
    return { bucket: x.bucket, path: x.path, note: x.note };
  });
  return { user_id: p.user_id, prefixes, paths };
}

/** Every object path under prefix (Supabase list() is one folder deep: entries with id null are folders). */
export async function listAll(storage: StorageLike, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 8) return [];
  const out: string[] = [];
  const dir = prefix.replace(/\/$/, '');
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.from(bucket).list(dir, { limit: 100, offset });
    if (error) throw new Error(`list ${bucket}/${dir}: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      const full = `${dir}/${r.name}`;
      if (r.id === null) out.push(...await listAll(storage, bucket, `${full}/`, depth + 1));
      else out.push(full);
    }
    if (rows.length < 100) break;
  }
  return out;
}

export interface PurgeResult { removed: number; by_bucket: Record<string, number>; needs_review: { path: string; note?: string }[] }

/** Deletes the member's own folders and the captured explicit paths. Idempotent: a re-run finds nothing left. */
export async function purgeUserStorage(raw: unknown, storage: StorageLike): Promise<PurgeResult> {
  const p = parsePurgePayload(raw);
  const res: PurgeResult = { removed: 0, by_bucket: {}, needs_review: [] };
  const targets = new Map<string, Set<string>>();
  const add = (b: string, path: string) => { if (!targets.has(b)) targets.set(b, new Set()); targets.get(b)!.add(path); };
  for (const { bucket, prefix } of p.prefixes) for (const path of await listAll(storage, bucket, prefix)) add(bucket, path);
  for (const x of p.paths) {
    if (x.bucket === null) res.needs_review.push({ path: x.path, note: x.note });   // KYC: bucket unknown, never guessed
    else add(x.bucket, x.path);
  }
  for (const [bucket, set] of targets) {
    const all = [...set];
    for (let i = 0; i < all.length; i += 100) {
      const chunk = all.slice(i, i + 100);
      const { error } = await storage.from(bucket).remove(chunk);
      if (error) throw new Error(`remove ${bucket}: ${error.message}`);
      res.removed += chunk.length;
      res.by_bucket[bucket] = (res.by_bucket[bucket] ?? 0) + chunk.length;
    }
  }
  return res;
}
