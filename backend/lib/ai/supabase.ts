import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase clients for AI features (server only).
 *
 * - userClient(token): acts AS the signed-in member. The Clerk session token is
 *   passed through Supabase third-party auth, so RLS sees auth.jwt()->>'sub' =
 *   Clerk user id. Used for conversation history and whiteboards.
 * - publicClient(): anon key, no user — RLS exposes only public/published rows.
 * - serviceClient(): service-role key. Used ONLY for embedding ingestion and the
 *   rate-limit counter (both are SECURITY DEFINER / admin operations). Never sent
 *   to the browser.
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), SUPABASE_SERVICE_ROLE_KEY
 * (or SUPABASE_SECRET_KEY).
 */

function url(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || undefined;
}
function anonKey(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined;
}
function serviceKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || undefined;
}

export function supabaseConfigured(): boolean {
  return Boolean(url() && anonKey());
}
export function serviceConfigured(): boolean {
  return Boolean(url() && serviceKey());
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } } as const;

export function userClient(getToken: () => Promise<string | null>): SupabaseClient | null {
  const u = url();
  const k = anonKey();
  if (!u || !k) return null;
  return createClient(u, k, { ...noSession, accessToken: async () => (await getToken()) ?? null });
}

let _public: SupabaseClient | null = null;
export function publicClient(): SupabaseClient | null {
  const u = url();
  const k = anonKey();
  if (!u || !k) return null;
  _public ??= createClient(u, k, noSession);
  return _public;
}

let _service: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient | null {
  const u = url();
  const k = serviceKey();
  if (!u || !k) return null;
  _service ??= createClient(u, k, noSession);
  return _service;
}
