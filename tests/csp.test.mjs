// r12 security: the strict CSP for sign-in / money / admin / tutor pages must match the pages' inline scripts.
// node --test tests/csp.test.mjs   (fix a failure with: node tools/csp.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeRule, strictCsp, inlineScriptHashes, STRICT_PAGES } from '../tools/csp.mjs';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const rule = vercel.headers.find((h) => h.source.startsWith('/(admin|'));

test('vercel.json carries the strict rule and it is current (run node tools/csp.mjs if this fails)', () => {
  assert.ok(rule, 'strict header rule missing');
  assert.deepEqual(rule, computeRule(vercel));
});

test('strict CSP: no unsafe-inline / ad networks in script-src; hashes present; base-uri/object-src/frame-ancestors kept', () => {
  const csp = rule.headers.find((h) => h.key === 'Content-Security-Policy').value;
  const script = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src '));
  assert.ok(!script.includes("'unsafe-inline'"));
  assert.ok(!/googlesyndication|doubleclick|adservice|chatwoot/.test(csp));
  assert.match(script, /'sha256-[A-Za-z0-9+/=]{44}'/);
  for (const d of ["object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", "form-action 'self'"]) assert.ok(csp.includes(d), d);
});

test('every strict page inline script is covered; JSON-LD is ignored', () => {
  const csp = rule.headers.find((h) => h.key === 'Content-Security-Policy').value;
  for (const p of STRICT_PAGES) {
    const html = readFileSync(new URL(`../${p}.html`, import.meta.url), 'utf8');
    for (const h of inlineScriptHashes(html)) assert.ok(csp.includes(h), `${p}.html inline script ${h} not in CSP`);
  }
  assert.deepEqual(inlineScriptHashes('<script type="application/ld+json">{"a":1}</script>'), []);
});

test('strictCsp transform keeps other hosts and drops only ad/unused ones', () => {
  const out = strictCsp("script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://pagead2.googlesyndication.com; connect-src 'self' https://www.google.com https://api.github.com", ["'sha256-x'"]);
  assert.match(out, /script-src 'self' https:\/\/cdn\.jsdelivr\.net 'sha256-x' 'unsafe-hashes'/);
  assert.match(out, /connect-src 'self' https:\/\/api\.github\.com$/);
});
