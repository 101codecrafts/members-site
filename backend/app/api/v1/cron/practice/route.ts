import { route } from '@/lib/http';
import { assertCron } from '@/lib/cron';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
import { judgeSubmission } from '@/services/practice';
export const runtime = 'nodejs';
export const maxDuration = 60;
/** Re-judges stuck submissions and runs plagiarism checks on contests that ended in the last 24h. */
export const GET = route(async ({ req, log }) => {
  assertCron(req);
  const db = serviceClient();
  const stuck = (await db.from('submissions').select('id').in('verdict', ['pending']).lt('created_at', new Date(Date.now() - 120_000).toISOString()).limit(20)).data ?? [];
  let rejudged = 0;
  for (const s of stuck) if (await judgeSubmission(s.id, log)) rejudged++;
  const ended = (await db.from('contests').select('id').lte('ends_at', new Date().toISOString()).gt('ends_at', new Date(Date.now() - 86_400_000).toISOString())).data ?? [];
  let flags = 0;
  for (const c of ended) flags += Number(await rpc(db, 'flag_plagiarism', { p_contest: c.id }));
  return { rejudged, contests_checked: ended.length, plagiarism_flags: flags };
});
