import { route } from '@/lib/http';
import { assertCron } from '@/lib/cron';
import { communityJobs } from '@/services/community';
export const runtime = 'nodejs';
export const maxDuration = 60;
/** Daily: opportunity expiry + 7d/1d deadline reminders, meeting 24h reminders. (15-min reminders need a sub-daily scheduler: Supabase pg_cron or GitHub Actions.) */
export const GET = route(async ({ req, log }) => { assertCron(req); return communityJobs(log); });
