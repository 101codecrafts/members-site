import { route } from '@/lib/http';
import { assertCron } from '@/lib/cron';
import { runDueJobs } from '@/services/job-queue';
export const runtime = 'nodejs';
export const maxDuration = 60;
/** r13: drains the Postgres job queue (app.jobs). Vercel cron once a day on Hobby; an external tick (GitHub Actions
 *  .github/workflows/worker-tick.yml, Supabase Cron + pg_net) may call it more often with the same CRON_SECRET. */
export const GET = route(async ({ req, log }) => {
  assertCron(req);
  return runDueJobs(log, { budgetMs: 45_000 });
});
