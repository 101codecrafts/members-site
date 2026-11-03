import 'server-only';
import { env } from '@/lib/env';

/**
 * Pluggable code runner. The default implementation targets a SELF-HOSTED
 * Judge0 CE (https://github.com/judge0/judge0) at JUDGE0_URL — never a public
 * shared instance (hidden tests would leak). Swap by implementing Runner.
 */
export type Verdict = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE' | 'IE';
export interface JudgeTest { id: string; input: string; expected: string; weight: number }
export interface JudgeJob { language: string; code: string; time_limit_ms: number; memory_limit_kb: number; tests: JudgeTest[] }
export interface JudgeResult { verdict: Verdict; passed: number; total: number; score: number; runtime_ms: number | null; memory_kb: number | null; compile_output: string | null; ref: string | null }
export interface Runner { readonly name: string; run(job: JudgeJob): Promise<JudgeResult> }

// Judge0 CE language ids (judge0/judge0 v1.13 defaults). TODO-CONFIRM against GET /languages on the deployed instance.
export const JUDGE0_LANG: Record<string, number> = {
  python: 71, javascript: 63, typescript: 74, c: 50, cpp: 54, java: 62, go: 60, rust: 73, csharp: 51, kotlin: 78,
};

const norm = (s: string) => s.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd()).join('\n').trim();

export class Judge0Runner implements Runner {
  readonly name = 'judge0';
  constructor(private readonly url: string, private readonly token?: string) {}
  async run(job: JudgeJob): Promise<JudgeResult> {
    const lang = JUDGE0_LANG[job.language];
    if (!lang) return { verdict: 'CE', passed: 0, total: job.tests.length, score: 0, runtime_ms: null, memory_kb: null, compile_output: `Unsupported language ${job.language}`, ref: null };
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.token) headers['X-Auth-Token'] = this.token;
    const res = await fetch(`${this.url.replace(/\/$/, '')}/submissions/batch?base64_encoded=true&wait=false`, {
      method: 'POST', headers, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ submissions: job.tests.map((t) => ({
        language_id: lang, source_code: b64(job.code), stdin: b64(t.input), expected_output: b64(t.expected),
        cpu_time_limit: job.time_limit_ms / 1000, memory_limit: job.memory_limit_kb, enable_network: false,
      })) }),
    });
    if (!res.ok) throw new Error(`judge0 ${res.status}`);
    const tokens = ((await res.json()) as Array<{ token: string }>).map((x) => x.token);
    const deadline = Date.now() + 45_000;
    type J0 = { status: { id: number }; time: string | null; memory: number | null; compile_output: string | null };
    let rows: J0[] = [];
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 800));
      const r = await fetch(`${this.url.replace(/\/$/, '')}/submissions/batch?tokens=${tokens.join(',')}&base64_encoded=true&fields=status,time,memory,compile_output`, { headers, signal: AbortSignal.timeout(10_000) });
      rows = ((await r.json()) as { submissions: J0[] }).submissions;
      if (rows.every((x) => x.status.id >= 3)) break;
    }
    return summarise(job.tests, rows.map((x) => ({ status: x.status.id, time: x.time ? Number(x.time) : null, memory: x.memory, compile: x.compile_output ? unb64(x.compile_output) : null })), tokens[0] ?? null);
  }
}

/** Judge0 status ids → verdicts; first failing test decides; IOI score = weighted pass share. */
export function summarise(tests: JudgeTest[], rows: Array<{ status: number; time: number | null; memory: number | null; compile: string | null }>, ref: string | null): JudgeResult {
  const map = (id: number): Verdict => id === 3 ? 'AC' : id === 4 ? 'WA' : id === 5 ? 'TLE' : id === 6 ? 'CE' : id >= 7 && id <= 12 ? 'RE' : id === 13 ? 'IE' : 'IE';
  const verdicts = rows.map((r) => map(r.status));
  const totalW = tests.reduce((a, t) => a + t.weight, 0) || 1;
  const passW = tests.reduce((a, t, i) => a + (verdicts[i] === 'AC' ? t.weight : 0), 0);
  const firstBad = verdicts.find((v) => v !== 'AC');
  return {
    verdict: rows.length < tests.length ? 'IE' : firstBad ?? 'AC',
    passed: verdicts.filter((v) => v === 'AC').length, total: tests.length,
    score: Math.round((10000 * passW) / totalW) / 100,
    runtime_ms: rows.length ? Math.round(Math.max(...rows.map((r) => r.time ?? 0)) * 1000) : null,
    memory_kb: rows.length ? Math.max(...rows.map((r) => r.memory ?? 0)) : null,
    compile_output: rows.find((r) => r.compile)?.compile ?? null, ref,
  };
}
export { norm as normaliseOutput };

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s: string) => Buffer.from(s, 'base64').toString('utf8');

export function getRunner(): Runner | null {
  const e = env();
  return e.JUDGE0_URL ? new Judge0Runner(e.JUDGE0_URL, e.JUDGE0_AUTH_TOKEN) : null;
}
