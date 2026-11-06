/**
 * r13: readiness evaluation, pure (unit-tested). /api/v1/health stays the cheap liveness probe; /api/v1/health/ready
 * answers 503 when the deployment cannot serve members (DB down or a required setting missing), so an uptime monitor
 * (UptimeRobot / Better Stack free tiers) can page on it. Only setting NAMES are reported, never values.
 */
export const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'CLERK_WEBHOOK_SIGNING_SECRET', 'CRON_SECRET',
] as const;
/** Features degrade (not down) without these. */
export const OPTIONAL_ENV = ['RESEND_API_KEY', 'FLW_SECRET_KEY', 'FLW_SECRET_HASH', 'OPENROUTER_API_KEY', 'SENTRY_DSN'] as const;

export type CheckStatus = 'ok' | 'warn' | 'fail';
export interface Check { status: CheckStatus; detail?: unknown }

export function envCheck(env: Record<string, string | undefined>): { required: Check; optional: Check } {
  const missingReq = REQUIRED_ENV.filter((k) => !env[k]);
  const missingOpt = OPTIONAL_ENV.filter((k) => !env[k]);
  return {
    required: missingReq.length ? { status: 'fail', detail: { missing: missingReq } } : { status: 'ok' },
    optional: missingOpt.length ? { status: 'warn', detail: { missing: missingOpt } } : { status: 'ok' },
  };
}

/** Job queue: warn when it is not migrated, when anything is dead, or when the oldest due job waited > 26 h
 *  (the daily cron runs once a day with ±59 min precision on Hobby, so a healthy queue is never older than that). */
export function queueCheck(stats: Record<string, number> | null): Check {
  if (!stats) return { status: 'warn', detail: 'not_migrated_or_unreachable' };
  if ((stats.dead ?? 0) > 0 || (stats.oldest_due_seconds ?? 0) > 26 * 3600) return { status: 'warn', detail: stats };
  return { status: 'ok', detail: stats };
}

export function overall(checks: Record<string, Check>): { status: 'ok' | 'degraded' | 'down'; http: number } {
  const v = Object.values(checks);
  if (v.some((c) => c.status === 'fail')) return { status: 'down', http: 503 };
  if (v.some((c) => c.status === 'warn')) return { status: 'degraded', http: 200 };
  return { status: 'ok', http: 200 };
}
