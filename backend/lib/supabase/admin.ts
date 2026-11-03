import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';
import type { Db } from './user';

/**
 * SERVICE-ROLE client — bypasses RLS. Least privilege rule: import this ONLY
 * from server-side services that run without a user (webhooks, cron, the
 * unfurler, privacy jobs). ESLint `no-restricted-imports` enforces it.
 */
let cached: Db | undefined;
export function serviceClient(): Db {
  if (!cached) {
    const e = env();
    cached = createClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-client-info': '101cc-service' } },
    });
  }
  return cached;
}
