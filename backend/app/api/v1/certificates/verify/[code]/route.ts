import { route, preflight } from '@/lib/http';
import { anonClient } from '@/lib/supabase/user';
import { rpc } from '@/repositories/rpc';
import { badRequest } from '@/lib/errors';
export const GET = route<{ code: string }>(async ({ params }) => {
  const code = params.code.toUpperCase();
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw badRequest('Invalid code');
  return rpc(anonClient(), 'verify_certificate', { p_code: code });
}, { cacheSeconds: 60 });
export const OPTIONS = preflight;
