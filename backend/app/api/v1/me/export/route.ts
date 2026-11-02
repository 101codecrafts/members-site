import { route, preflight, body, query, unwrap } from '@/lib/http';
import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { rpc } from '@/repositories/rpc';
import { rateLimit, LIMITS } from '@/lib/ratelimit';
/** DPPA 2019 right of access: full JSON export of the caller's data. */
export const GET = route(async () => {
  const s = await requireUser();
  await rateLimit(LIMITS.export, s.userId);
  const data = await rpc(s.db, 'export_my_data');
  return new NextResponse(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json',
    'content-disposition': `attachment; filename="101codecrafts-my-data-${new Date().toISOString().slice(0, 10)}.json"` } });
});
export const OPTIONS = preflight;
