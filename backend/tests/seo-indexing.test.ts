// r13 seo: indexing switch (Q24) and origin rewrite for the copied static front end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const cfg = new URL('../next.config.mjs', import.meta.url).pathname;
function headersFor(env: Record<string, string>) {
  const code = `const m = await import(${JSON.stringify(cfg)}); console.log(JSON.stringify({ on: m.SITE_INDEXING, h: await m.default.headers() }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout) as { on: boolean; h: { source: string; headers: { key: string; value: string }[] }[] };
}
const noindexAll = (h: ReturnType<typeof headersFor>['h']) => h.some((r) => r.source === '/:path*' && r.headers.some((x) => x.key === 'X-Robots-Tag' && x.value === 'noindex'));

test('previews and un-flagged production builds send X-Robots-Tag: noindex on every path', () => {
  for (const env of [{ VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'preview', SITE_INDEXING: 'on' }, { VERCEL_ENV: 'production' }, {}]) {
    const r = headersFor(env);
    assert.equal(r.on, false, JSON.stringify(env));
    assert.ok(noindexAll(r.h), 'noindex rule for ' + JSON.stringify(env));
  }
});

test('production with SITE_INDEXING=on drops the blanket noindex; /api stays noindex', () => {
  const r = headersFor({ VERCEL_ENV: 'production', SITE_INDEXING: 'on' });
  assert.equal(r.on, true);
  assert.ok(!noindexAll(r.h));
  const api = r.h.find((x) => x.source === '/api/:path*')!;
  assert.ok(api.headers.some((x) => x.key === 'X-Robots-Tag' && x.value === 'noindex'));
});

test('copy-static origin: SITE_URL wins, production falls back to the Vercel production URL, previews keep the placeholder', async () => {
  const src = readFileSync(new URL('../scripts/copy-static.mjs', import.meta.url), 'utf8');
  const fns = src.slice(src.indexOf('export function siteOrigin'), src.indexOf('const siteCfg'));
  const mod = await import('data:text/javascript,' + encodeURIComponent("import { readdirSync, readFileSync, writeFileSync } from 'node:fs'; import { join } from 'node:path';\n" + fns));
  assert.equal(mod.siteOrigin({ SITE_URL: 'https://101.example/' }), 'https://101.example');
  assert.equal(mod.siteOrigin({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'members-site.vercel.app' }), 'https://members-site.vercel.app');
  assert.equal(mod.siteOrigin({ VERCEL_ENV: 'preview', VERCEL_PROJECT_PRODUCTION_URL: 'x.vercel.app' }), '');
  const d = mkdtempSync(join(tmpdir(), 'r13seo-'));
  writeFileSync(join(d, 'index.html'), '<link rel="canonical" href="https://site-url.invalid/">');
  writeFileSync(join(d, 'sitemap.xml'), '<loc>https://site-url.invalid/about.html</loc>');
  writeFileSync(join(d, 'a.png'), 'https://site-url.invalid/');
  assert.equal(mod.rewriteOrigin(d, 'https://site-url.invalid', 'https://101.example'), 2);
  assert.match(readFileSync(join(d, 'index.html'), 'utf8'), /href="https:\/\/101\.example\/"/);
  assert.equal(readFileSync(join(d, 'a.png'), 'utf8'), 'https://site-url.invalid/');
});
