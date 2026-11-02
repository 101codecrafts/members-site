"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client authenticated with the member's Clerk session token
 * (Supabase third-party auth). RLS + Realtime authorization see the Clerk user id.
 * Returns null when Supabase env is missing (local scratch mode).
 */
let client: SupabaseClient | null = null;
let tokenGetter: (() => Promise<string | null>) | null = null;

export function browserSupabase(getToken: () => Promise<string | null>): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  tokenGetter = getToken;
  client ??= createClient(url, key, {
    accessToken: async () => (tokenGetter ? await tokenGetter() : null),
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
