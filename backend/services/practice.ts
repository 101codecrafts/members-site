import 'server-only';
import { serviceClient } from '@/lib/supabase/admin';
import { rpc } from '@/repositories/rpc';
import { getRunner, type JudgeJob } from '@/lib/judge';
import type { Logger } from '@/lib/logger';

/** Runs a pending submission through the configured runner and records the verdict (service role). */
export async function judgeSubmission(submissionId: string, log?: Logger) {
  const runner = getRunner();
  if (!runner) { log?.warn('judge.not_configured', { submissionId }); return null; }   // TODO: set JUDGE0_URL (self-hosted Judge0 CE)
  const db = serviceClient();
  const job = (await rpc(db, 'judge_payload', { p_submission: submissionId })) as unknown as JudgeJob;
  try {
    const r = await runner.run(job);
    return await rpc(db, 'judge_record_result', {
      p_submission: submissionId, p_verdict: r.verdict, p_passed: r.passed, p_total: r.total, p_score: r.score,
      p_runtime_ms: r.runtime_ms ?? undefined, p_memory_kb: r.memory_kb ?? undefined, p_compile_output: r.compile_output ?? undefined, p_judge_ref: r.ref ?? undefined,
    });
  } catch (e) {
    log?.error('judge.failed', { submissionId, err: String(e) });
    return null;   // stays 'running'; cron/practice re-queues stale ones
  }
}
