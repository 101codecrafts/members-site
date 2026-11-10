#!/usr/bin/env node
// Copies the static front end (owned by the front-end workstream, repo root)
// into backend/public so ONE Vercel project serves pages + /api on one origin.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const pub = join(here, '..', 'public');
mkdirSync(pub, { recursive: true });
// every page + its static folders (src/, tools/, tokens/ are build inputs, not served)
const SKIP = new Set(['backend', 'supabase', 'docs', 'src', 'tools', 'tokens', 'compare', 'node_modules', '.git', '.github', 'vercel.json', 'package.json', 'README.md', 'LICENSE']);
const entries = existsSync(join(root, 'index.html')) ? readdirSync(root).filter(e => !SKIP.has(e) && !e.startsWith('.')) : [];
for (const entry of entries) {
  const src = join(root, entry);
  if (existsSync(src)) cpSync(src, join(pub, entry), { recursive: true });
}
console.log('static front end copied to backend/public');

// r13 seo: the front end is built with a placeholder origin (src/data/site.json "placeholder", https://site-url.invalid)
// in canonical / og:url / JSON-LD / sitemap.xml / robots.txt / llms.txt. Swap in the real origin when this deployment
// knows it: SITE_URL (set once the domain is live), else the Vercel production URL on production builds.
// Previews keep the placeholder; they are noindex anyway (next.config.mjs X-Robots-Tag).
export function siteOrigin(env = process.env) {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) return 'https://' + env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/$/, '');
  return '';
}
export function rewriteOrigin(dir, placeholder, origin) {
  let n = 0;
  for (const f of readdirSync(dir)) {
    if (!/\.(html|xml|txt|webmanifest)$/.test(f)) continue;
    const p = join(dir, f), s = readFileSync(p, 'utf8');
    if (s.includes(placeholder)) { writeFileSync(p, s.split(placeholder).join(origin)); n++; }
  }
  return n;
}
const siteCfg = join(root, 'src', 'data', 'site.json');
const placeholder = existsSync(siteCfg) ? JSON.parse(readFileSync(siteCfg, 'utf8')).placeholder : 'https://site-url.invalid';
const origin = siteOrigin();
if (origin && entries.length) console.log(`site origin ${origin}: rewrote ${rewriteOrigin(pub, placeholder, origin)} files`);
