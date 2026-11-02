import 'server-only';
import { AppError } from '@/lib/errors';
import { serviceClient } from '@/lib/supabase/admin';

/**
 * Postgres fixed-window limiter (public.rate_limit_hit, service role only).
 * Free and good enough for 10K+ members; swap for Upstash Redis by replacing
 * this one function if traffic outgrows it.
 */
export interface LimitRule { name: string; max: number; windowSeconds: number; key?: string }

export const LIMITS = {
  public: { name: 'public', max: 120, windowSeconds: 60 },
  write: { name: 'write', max: 30, windowSeconds: 60 },
  auth: { name: 'auth', max: 10, windowSeconds: 60 },
  checkout: { name: 'checkout', max: 10, windowSeconds: 600 },
  unfurl: { name: 'unfurl', max: 20, windowSeconds: 600 },
  track: { name: 'track', max: 300, windowSeconds: 60 },
  errors: { name: 'errors', max: 60, windowSeconds: 60 },
  export: { name: 'export', max: 5, windowSeconds: 3600 },
} satisfies Record<string, LimitRule>;

export async function rateLimit(rule: LimitRule, subject: string): Promise<void> {
  const key = `${rule.name}:${rule.key ?? subject}`;
  const { data, error } = await serviceClient().rpc('rate_limit_hit', { p_key: key, p_max: rule.max, p_window_seconds: rule.windowSeconds });
  if (error) return; // fail open on limiter outage; never block legit users because the limiter broke
  const row = data?.[0];
  if (row && !row.allowed) throw new AppError('rate_limited', `Too many requests. Try again after ${row.reset_at}`);
}
