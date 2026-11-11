// r13: the API app serves the static front end, so it must carry the static repo's vercel.json redirects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const cfg = new URL('../next.config.mjs', import.meta.url).pathname;
function load() {
  const code = `const m = await import(${JSON.stringify(cfg)}); console.log(JSON.stringify({ r: await m.default.redirects(), w: await m.default.rewrites() }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout) as { r: { source: string; destination: string; permanent: boolean }[]; w: { source: string; destination: string }[] };
}

test('old auth URLs permanently redirect to /auth.html, like the static vercel.json', () => {
  const { r } = load();
  for (const s of ['/signin', '/signin.html', '/signup', '/signup.html', '/login', '/onboarding', '/onboarding.html', '/register']) {
    const hit = r.find((x) => x.source === s);
    assert.ok(hit, s);
    assert.equal(hit.destination, '/auth.html');
    assert.equal(hit.permanent, true);
  }
  assert.ok(r.some((x) => x.source === '/ai.html' && x.destination === '/ai-tools.html' && x.permanent));
});

test('/auth rewrites to the static auth page', () => {
  assert.ok(load().w.some((x) => x.source === '/auth' && x.destination === '/auth.html'));
});
