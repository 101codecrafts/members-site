import 'server-only';
import type { Database } from '@/types/database';
import type { Db } from '@/lib/supabase/user';

type Fns = Database['public']['Functions'];
export type RpcArgs<N extends keyof Fns> = Fns[N]['Args'];
export type RpcReturn<N extends keyof Fns> = Fns[N]['Returns'];

/**
 * Repository primitive: call a Postgres function and unwrap the result.
 * All authorization lives in the function itself (role checks, ownership,
 * audit) + RLS, so the same call is safe from any client.
 */
export async function rpc<N extends keyof Fns>(db: Db, name: N, args?: RpcArgs<N>): Promise<RpcReturn<N>> {
  // supabase-js overloads are very generic; the Database type gives us the real contract above.
  const call = db.rpc as unknown as (n: string, a?: object) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
  const { data, error } = await call.call(db, name as string, (args ?? {}) as object);
  if (error) throw error;
  return data as RpcReturn<N>;
}
