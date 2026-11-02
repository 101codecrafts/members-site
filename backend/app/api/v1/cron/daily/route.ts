import { route } from '@/lib/http';
import { assertCron } from '@/lib/cron';
export const runtime = 'nodejs';
export const maxDuration = 60;
import { dailyJobs } from '@/services/jobs';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
export const GET = route(async ({ req, log }) => {
  assertCron(req);
  const expired = await rpc(serviceClient(), 'expire_external_courses');
  return { ...(await dailyJobs(log)), external_courses_expired: expired };
});
