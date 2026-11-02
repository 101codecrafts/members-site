import { route, preflight, body, query, unwrap } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
export const dynamic = 'force-dynamic';
export const GET = route(async () => {
  const started = Date.now();
  const { error } = await anonClient().from('feature_flags').select('key').limit(1);
  return { status: error ? 'degraded' : 'ok', db: error ? 'error' : 'ok', db_ms: Date.now() - started,
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? 'dev', time: new Date().toISOString() };
});
export const OPTIONS = preflight;
