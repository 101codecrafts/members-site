import { NextResponse } from 'next/server';
import { route, preflight } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
import { envCheck, overall, type Check } from '@/lib/health';
import { assertCron } from '@/lib/cron';
export const dynamic = 'force-dynamic';
/** r13 readiness probe: DB round trip, required settings present. 503 when down.
 *  Release r13-guest: the job-queue check is left out (its migration is not applied).
 *  Anyone sees the status of each check; the details (missing setting names, queue counts) need the cron secret. */
export const GET = route(async ({ req }) => {
  let detailed = false;
  try { assertCron(req); detailed = true; } catch { /* public view */ }
  const started = Date.now();
  let db: Check;
  try {
    const { error } = await anonClient().from('feature_flags').select('key').limit(1);
    db = error ? { status: 'fail', detail: 'query_failed' } : { status: 'ok', detail: { ms: Date.now() - started } };
  } catch { db = { status: 'fail', detail: 'unreachable' }; }
  const env = envCheck(process.env);
  const checks: Record<string, Check> = { db, config: env.required, optional_config: env.optional };
  const o = overall(checks);
  if (!detailed) for (const k of Object.keys(checks)) checks[k] = { status: checks[k]!.status };
  return NextResponse.json({ data: { status: o.status, checks, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 'dev', time: new Date().toISOString() } },
    { status: o.http });
});
export const OPTIONS = preflight;
