import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Error monitoring without an SDK dependency:
 *  1. always: insert a PII-free row into public.error_events (service role)
 *  2. optional: forward to Sentry (free tier) or self-hosted GlitchTip when
 *     SENTRY_DSN is set, using the public store endpoint.
 * TODO(ops): set SENTRY_DSN in Vercel to enable (see docs/BACKEND.md §Observability).
 */
export async function captureException(e: unknown, context: Record<string, unknown> = {}): Promise<void> {
  const err = e instanceof Error ? e : new Error(String(e));
  const fingerprint = createHash('sha256').update(`${err.name}:${err.message}`.slice(0, 500)).digest('hex').slice(0, 32);
  try {
    const { serviceClient } = await import('@/lib/supabase/admin');
    await serviceClient().from('error_events').insert({
      source: 'api', level: 'error', message: err.message.slice(0, 1000), fingerprint,
      stack: err.stack?.slice(0, 8000) ?? null, path: typeof context.path === 'string' ? context.path : null,
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null, context: { request_id: context.request_id ?? null },
    });
  } catch { /* monitoring must never throw */ }

  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace('/', '');
    const endpoint = `${u.protocol}//${u.host}/api/${projectId}/store/`;
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${u.username}, sentry_client=101cc/1.0` },
      body: JSON.stringify({ message: err.message, level: 'error', platform: 'node', fingerprint: [fingerprint],
        exception: { values: [{ type: err.name, value: err.message }] }, tags: { request_id: String(context.request_id ?? '') } }),
      signal: AbortSignal.timeout(2000),
    });
  } catch { /* ignore */ }
}
