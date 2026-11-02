#!/usr/bin/env node
/**
 * 101 Codecrafts debug agent - LLM root-cause triage for CI failures and bug reports.
 *
 * Local:
 *   AI_GATEWAY_API_KEY=... node scripts/debug-agent.mjs --log path/to/failure.log [--log more.log]
 *   AI_GATEWAY_API_KEY=... node scripts/debug-agent.mjs --run "npm run typecheck" --cwd backend
 *   node scripts/debug-agent.mjs --log x.log --dry-run        # print the prompt, no API call
 * CI (see .github/workflows/ai-triage.yml):
 *   node scripts/debug-agent.mjs --ci-run $RUN_ID --post [--draft-pr]
 *   node scripts/debug-agent.mjs --issue $ISSUE_NUMBER --post
 *
 * Model: inclusionai/ling-3.1-flash-1019 via the Vercel AI Gateway (OpenAI-compatible),
 * falling back to free gateway models. Override with AI_TRIAGE_MODELS="a,b,c".
 * It never merges anything. --draft-pr only opens a DRAFT pull request when the model's
 * patch applies cleanly (git apply --check) on a fresh ai-triage/* branch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flag = k => argv.includes(k);
const opts = k => argv.flatMap((a, i) => (a === k ? [argv[i + 1]] : []));
const opt = (k, d) => opts(k)[0] ?? d;

const GATEWAY = process.env.AI_GATEWAY_URL || 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MODELS = (process.env.AI_TRIAGE_MODELS || 'inclusionai/ling-3.1-flash-1019,nvidia/nemotron-3.5-lightning-free,reflection/beam-free').split(',').map(s => s.trim()).filter(Boolean);
const KEY = process.env.AI_GATEWAY_API_KEY;
const GH = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY || guessRepo();
const MAX_LOG = Number(process.env.AI_TRIAGE_MAX_LOG_CHARS || 60000);
const MARK = '<!-- 101cc-debug-agent -->';

function sh(cmd, o = {}) { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64e6, ...o }); } catch (e) { return (e.stdout || '') + (e.stderr || ''); } }
function guessRepo() { const u = sh('git config --get remote.origin.url').trim(); const m = u.match(/github\.com[:/](.+?)(\.git)?$/); return m ? m[1] : ''; }

/** Strip secrets and noise before anything leaves the runner. */
export function redact(s) {
  return String(s)
    .replace(/(gh[pousr]_[A-Za-z0-9]{20,})/g, '[REDACTED_GH_TOKEN]')
    .replace(/(sk-[A-Za-z0-9_-]{20,}|vck_[A-Za-z0-9_-]{20,})/g, '[REDACTED_KEY]')
    .replace(/(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, '[REDACTED_JWT]')
    .replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/g, '$1[REDACTED]@')
    .replace(/((?:api[_-]?key|secret|password|token|authorization)["'\s:=]+)([^\s"',]{8,})/gi, '$1[REDACTED]')
    .replace(/\x1b\[[0-9;]*m/g, '')
    .replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /gm, '');
}

/** Keep the parts of a long log that matter: error lines with context, plus the tail. */
export function condense(log, max = MAX_LOG) {
  const lines = redact(log).split('\n');
  if (lines.join('\n').length <= max) return lines.join('\n');
  const hit = /error|fail|✖|×|exception|traceback|cannot|not found|ERR!|TS\d{4}|::error|panic|undefined is not|denied|violat/i;
  const keep = new Set();
  lines.forEach((l, i) => { if (hit.test(l)) for (let j = Math.max(0, i - 6); j <= Math.min(lines.length - 1, i + 12); j++) keep.add(j); });
  for (let j = Math.max(0, lines.length - 80); j < lines.length; j++) keep.add(j);
  let out = [], prev = -2;
  for (const i of [...keep].sort((a, b) => a - b)) { if (i !== prev + 1) out.push('…'); out.push(lines[i]); prev = i; }
  let s = out.join('\n');
  return s.length > max ? s.slice(0, max / 2) + '\n…[truncated]…\n' + s.slice(-max / 2) : s;
}

/** Pull source excerpts for file:line references found in the log. */
export function sourceContext(log, root = process.cwd(), maxFiles = 8) {
  const refs = new Map();
  const re = /((?:[\w.-]+\/)*[\w.-]+\.(?:ts|tsx|js|mjs|cjs|sql|css|html|json|yml|yaml|py))[:(](\d+)/g;
  for (const m of log.matchAll(re)) { const f = m[1].replace(/^\.\//, ''); if (!refs.has(f)) refs.set(f, Number(m[2])); if (refs.size >= maxFiles * 3) break; }
  const out = [];
  for (const [f, line] of refs) {
    const cands = [f, path.join('backend', f), path.join('supabase', f)].map(p => path.join(root, p));
    const file = cands.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!file) continue;
    const src = fs.readFileSync(file, 'utf8').split('\n');
    const a = Math.max(0, line - 15), b = Math.min(src.length, line + 15);
    out.push(`--- ${path.relative(root, file)} (lines ${a + 1}-${b}) ---\n` + src.slice(a, b).map((l, i) => `${a + i + 1}: ${l}`).join('\n'));
    if (out.length >= maxFiles) break;
  }
  return redact(out.join('\n\n'));
}

async function gh(pathname, init = {}) {
  if (!GH) throw new Error('GITHUB_TOKEN is required for GitHub API calls');
  const r = await fetch(`https://api.github.com${pathname}`, { ...init, headers: { authorization: `Bearer ${GH}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`GitHub ${init.method || 'GET'} ${pathname} -> ${r.status} ${await r.text().catch(() => '')}`.slice(0, 400));
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

async function ciLogs(runId) {
  const run = await gh(`/repos/${REPO}/actions/runs/${runId}`);
  const { jobs } = await gh(`/repos/${REPO}/actions/runs/${runId}/jobs?per_page=50`);
  const failed = jobs.filter(j => j.conclusion === 'failure' || j.conclusion === 'timed_out');
  let text = `Workflow: ${run.name}  branch: ${run.head_branch}  sha: ${run.head_sha}  event: ${run.event}\n`;
  for (const j of failed) {
    const steps = j.steps.filter(s => s.conclusion === 'failure').map(s => s.name).join(', ');
    let log = ''; try { log = await gh(`/repos/${REPO}/actions/jobs/${j.id}/logs`); } catch (e) { log = String(e.message); }
    text += `\n===== JOB: ${j.name} (failed steps: ${steps}) =====\n${condense(log, Math.floor(MAX_LOG / Math.max(1, failed.length)))}\n`;
  }
  const pr = (run.pull_requests || [])[0];
  return { text, sha: run.head_sha, branch: run.head_branch, prNumber: pr?.number, title: `CI failure in ${run.name} on ${run.head_branch}` };
}

async function issueContext(n) {
  const is = await gh(`/repos/${REPO}/issues/${n}`);
  let text = `Issue #${n}: ${is.title}\n\n${is.body || ''}\n`;
  // add the latest failed CI run on the default branch, if any
  try {
    const runs = await gh(`/repos/${REPO}/actions/runs?status=failure&per_page=1`);
    if (runs.workflow_runs?.[0]) text += '\n\nLatest failed CI run:\n' + (await ciLogs(runs.workflow_runs[0].id)).text;
  } catch {}
  return { text: redact(text), issueNumber: n, title: is.title };
}

function localContext() {
  let text = '';
  for (const f of opts('--log')) text += `\n===== ${f} =====\n` + condense(fs.readFileSync(f, 'utf8'));
  for (const cmd of opts('--run')) {
    const r = spawnSync(cmd, { shell: true, cwd: opt('--cwd', '.'), encoding: 'utf8', maxBuffer: 64e6 });
    text += `\n===== $ ${cmd} (exit ${r.status}) =====\n` + condense((r.stdout || '') + (r.stderr || ''));
  }
  if (!text && !process.stdin.isTTY) text = condense(fs.readFileSync(0, 'utf8'));
  return { text, title: 'local debug' };
}

const SYSTEM = `You are the debugging agent for the 101 Codecrafts members site: a static HTML/CSS/JS front end (repo root), a Next.js 15 + Supabase backend (backend/), Postgres migrations with RLS (supabase/migrations), Playwright smoke tests (tests/smoke).
Given CI logs or a bug report plus source excerpts, reply in GitHub-flavoured Markdown with exactly these sections:
### Root cause
(1-4 sentences, name the file:line that is wrong; say "uncertain" and why when the logs do not show it)
### Evidence
(the 1-5 log lines that prove it, quoted)
### Suggested fix
(plain-language steps)
### Patch
(ONE fenced \`\`\`diff block with a minimal unified diff against the repo root, paths prefixed a/ and b/. Omit the block if you are not confident.)
### Risk
(what the patch could break; mention RLS/security impact for any SQL change)
Rules: never suggest disabling RLS, deleting tests, weakening lint/type rules, or committing secrets. Prefer the smallest change.`;

async function callLLM(user) {
  if (!KEY) throw new Error('AI_GATEWAY_API_KEY is not set');
  const errs = [];
  for (const model of MODELS) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 90000);
      const r = await fetch(GATEWAY, { method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model, temperature: 0.1, max_tokens: 2500, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] }) });
      clearTimeout(t);
      if (!r.ok) { errs.push(`${model}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); continue; }
      const j = await r.json();
      const content = j.choices?.[0]?.message?.content?.trim();
      if (content) return { model, content };
      errs.push(`${model}: empty response`);
    } catch (e) { errs.push(`${model}: ${e.message}`); }
  }
  throw new Error('all models failed:\n' + errs.join('\n'));
}

function extractDiff(md) { const m = md.match(/```diff\n([\s\S]*?)```/); return m ? m[1].replace(/\n?$/, '\n') : null; }

async function draftPR(diff, ctx) {
  const branch = `ai-triage/${ctx.issueNumber ? 'issue-' + ctx.issueNumber : 'run-' + (opt('--ci-run') || Date.now())}`;
  fs.writeFileSync('/tmp/ai.patch', diff);
  if (spawnSync('git', ['apply', '--check', '/tmp/ai.patch']).status !== 0) return 'patch did not apply cleanly; no PR opened';
  sh(`git checkout -B ${branch}`); sh('git apply /tmp/ai.patch');
  sh('git -c user.name="101cc-debug-agent" -c user.email="debug-agent@users.noreply.github.com" commit -am "ai-triage: suggested fix (needs human review)"');
  const push = spawnSync('git', ['push', '-f', 'origin', branch], { encoding: 'utf8' });
  if (push.status !== 0) return 'push failed: ' + redact(push.stderr).slice(0, 300);
  const base = ctx.branch || (await gh(`/repos/${REPO}`)).default_branch;
  const pr = await gh(`/repos/${REPO}/pulls`, { method: 'POST', body: JSON.stringify({ title: `[ai-triage] ${ctx.title}`.slice(0, 120), head: branch, base, draft: true,
    body: `${MARK}\nDraft patch proposed by the debug agent. **Not reviewed. Do not merge without a human review and green CI.**\n\n${ctx.issueNumber ? `Refs #${ctx.issueNumber}` : `From CI run ${opt('--ci-run')}`}` }) });
  return `draft PR opened: ${pr.html_url}`;
}

async function post(body, ctx) {
  if (ctx.issueNumber || ctx.prNumber) {
    const n = ctx.issueNumber || ctx.prNumber;
    // update our previous comment instead of piling up new ones
    const comments = await gh(`/repos/${REPO}/issues/${n}/comments?per_page=100`);
    const mine = comments.find(c => c.body?.includes(MARK));
    if (mine) return (await gh(`/repos/${REPO}/issues/comments/${mine.id}`, { method: 'PATCH', body: JSON.stringify({ body }) })).html_url;
    return (await gh(`/repos/${REPO}/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body }) })).html_url;
  }
  if (ctx.sha) return (await gh(`/repos/${REPO}/commits/${ctx.sha}/comments`, { method: 'POST', body: JSON.stringify({ body }) })).html_url;
  return null;
}

async function main() {
  const ctx = opt('--ci-run') ? await ciLogs(opt('--ci-run')) : opt('--issue') ? await issueContext(opt('--issue')) : localContext();
  if (!ctx.text.trim()) { console.error('nothing to analyse: pass --log, --run, --ci-run or --issue'); process.exit(2); }
  const recent = redact(sh('git log --oneline -8') + '\n' + sh('git diff --stat HEAD~1 HEAD 2>/dev/null').slice(0, 3000));
  const prompt = `${ctx.title}\n\n## Logs / report\n${ctx.text}\n\n## Source excerpts\n${sourceContext(ctx.text) || '(none found)'}\n\n## Recent commits\n${recent}`;
  if (flag('--dry-run')) { console.log(prompt); return; }
  let result;
  try { result = await callLLM(prompt); }
  catch (e) { console.error(e.message); if (!flag('--post')) process.exit(1); result = { model: 'none', content: `The debug agent could not reach a model.\n\n\`\`\`\n${e.message.slice(0, 1500)}\n\`\`\`` }; }
  let prNote = '';
  const diff = extractDiff(result.content);
  if (flag('--draft-pr') && diff) { try { prNote = await draftPR(diff, ctx); } catch (e) { prNote = 'draft PR failed: ' + e.message.slice(0, 300); } }
  const body = `${MARK}\n## 🤖 Debug agent triage\n_Model: \`${result.model}\` · automated suggestion, verify before acting · never auto-merged_\n\n${result.content}${prNote ? `\n\n---\n${prNote}` : ''}`;
  if (opt('--out')) fs.writeFileSync(opt('--out'), body);
  if (flag('--post')) console.log('posted:', await post(body, ctx)); else console.log(body);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(redact(e.stack || e.message)); process.exit(1); });
