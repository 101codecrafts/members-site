// r13 architecture (front end): CDN viewer header + the agent-team setup (AGENTS.md, CLAUDE.md, .claude/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url).pathname;
const read = (p) => readFileSync(ROOT + p, 'utf8');

function loadApi(cookie, href = 'https://members.test/courses.html') {
  const window = { CC_CONFIG: { apiBase: '/api' }, addEventListener() {}, dispatchEvent() {} };
  const ctx = vm.createContext({ window, console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Promise, JSON, Date,
    location: new URL(href), document: { cookie }, sessionStorage: { getItem: () => null, setItem() {} }, localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }), CustomEvent: class {} });
  vm.runInContext(read('js/api.js'), ctx);
  return (url) => JSON.parse(JSON.stringify(window.CC_V1.viewerHeader(url)));   // vm realm -> plain object
}

test('viewer header: sent same-origin only, and only with a Clerk session cookie', () => {
  assert.deepEqual(loadApi('theme=dark; __session=eyJabc')('/api/v1/articles'), { 'X-CC-Viewer': 'member' });
  assert.deepEqual(loadApi('__session_Xy1=eyJabc')('https://members.test/api/v1/news'), { 'X-CC-Viewer': 'member' });
  assert.deepEqual(loadApi('theme=dark; __client_uat=0')('/api/v1/articles'), {});
  assert.deepEqual(loadApi('__session=')('/api/v1/articles'), {}, 'empty cookie = signed out');
  assert.deepEqual(loadApi('__session=eyJabc')('https://api.other.test/api/v1/articles'), {}, 'cross-origin: never (no preflight surprise)');
});

test('agent team: AGENTS.md carries the hard rules; CLAUDE.md imports it', () => {
  const a = read('AGENTS.md');
  for (const must of ['js/ai-mascot.js', 'sw.js', '?static=1', 'No demo data', 'Edit `src/`', 'tools/agent-check.sh', 'previews only', 'migrations'])
    assert.ok(a.toLowerCase().includes(must.toLowerCase()), must);
  assert.match(read('CLAUDE.md'), /^@AGENTS\.md$/m);
});

test('agent team: settings.json hooks point at executable scripts; dangerous commands are denied', () => {
  const s = JSON.parse(read('.claude/settings.json'));
  for (const ev of ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop']) {
    assert.ok(Array.isArray(s.hooks[ev]) && s.hooks[ev].length, ev);
    for (const h of s.hooks[ev].flatMap((g) => g.hooks)) {
      const f = /\.claude\/hooks\/[a-z-]+\.sh/.exec(h.command)[0];
      assert.ok(existsSync(ROOT + f) && (statSync(ROOT + f).mode & 0o111), `${f} exists and is executable`);
    }
  }
  const deny = s.permissions.deny.join(' ');
  for (const d of ['git push origin main', 'vercel promote', 'vercel env', 'supabase db push', '.env', 'ai-mascot.js']) assert.ok(deny.includes(d), d);
});

test('agent team: planner / researcher / builder / reviewer have valid frontmatter; only the builder may edit', () => {
  for (const r of ['planner', 'researcher', 'builder', 'reviewer']) {
    const t = read(`.claude/agents/${r}.md`);
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(t);
    assert.ok(fm, r);
    assert.match(fm[1], new RegExp(`^name: ${r}$`, 'm'));
    assert.match(fm[1], /^description: .{20,}$/m);
    const readOnly = /^disallowedTools: .*Edit.*Write/m.test(fm[1]);
    assert.equal(readOnly, r !== 'builder', `${r} read-only=${readOnly}`);
  }
});

const hook = (name, input) => spawnSync('bash', [ROOT + `.claude/hooks/${name}`], { input: JSON.stringify(input), env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT.replace(/\/$/, '') }, encoding: 'utf8' });

test('pre-tool-use hook blocks guarded files (exit 2) and allows normal edits', () => {
  const p = (rel, extra = {}) => hook('pre-tool-use.sh', { tool_name: 'Edit', tool_input: { file_path: ROOT + rel, ...extra } });
  assert.equal(p('js/ai-mascot.js').status, 2);
  assert.equal(p('index.html').status, 2, 'generated page');
  assert.match(p('index.html').stderr, /Edit src\/index\.html/);
  assert.equal(p('.env.local').status, 2);
  assert.equal(p('src/index.html').status, 0);
  assert.equal(p('js/api.js').status, 0);
  const cur = /VERSION *= *"[^"]+"/.exec(read('sw.js'))[0];
  assert.equal(p('sw.js', { old_string: cur, new_string: 'const VERSION = "cc-v999";' }).status, 2, 'version bump blocked');
  assert.equal(p('sw.js', { old_string: 'x', new_string: `${cur}; // comment` }).status, 0, 'same version ok');
});

test('post-tool-use hook reports a JS syntax error back (exit 2)', () => {
  const tmp = ROOT + 'tests/.tmp-bad.js';
  try {
    require_write(tmp, 'function (');
    assert.equal(hook('post-tool-use.sh', { tool_input: { file_path: tmp } }).status, 2);
    require_write(tmp, 'const ok = 1;');
    assert.equal(hook('post-tool-use.sh', { tool_input: { file_path: tmp } }).status, 0);
  } finally { spawnSync('rm', ['-f', tmp]); }
});
function require_write(p, s) { spawnSync('bash', ['-c', 'cat > "$0"', p], { input: s }); }
