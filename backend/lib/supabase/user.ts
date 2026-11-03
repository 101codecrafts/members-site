import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { env } from '@/lib/env';

export type Db = SupabaseClient<Database>;

/**
 * Per-request client acting AS THE USER: anon key + the caller's verified
 * Clerk session token (Supabase third-party auth). Every query is filtered
 * by RLS — this is the default client for all member/tutor/admin endpoints.
 */
export function userClient(accessToken: string | null): Db {
  const e = env();
  return createClient<Database>(e.NEXT_PUBLIC_SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    accessToken: async () => accessToken,
    global: { headers: { 'x-client-info': '101cc-api' } },
  });
}

/** Anonymous client (public catalogue). Still RLS-filtered as role `anon`. */
export function anonClient(): Db {
  return userClient(null);
}
