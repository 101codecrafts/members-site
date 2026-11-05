#!/usr/bin/env node
// r12 security (R12-SEC-01): strict Content-Security-Policy for the pages that handle sign-in, money, admin and
// tutor tools. Derived from the site-wide CSP in vercel.json:
//   - script-src: no 'unsafe-inline'; the page's own inline <script> blocks are allowed by sha256 hash, the three
//     image-fallback onerror handlers by 'unsafe-hashes'; ad-network and unused hosts are removed
//   - connect-src / frame-src: ad-network hosts removed
// Usage:  node tools/csp.mjs          rewrite the strict header rule in vercel.json (run after editing an inline script)
//         node tools/csp.mjs --check  exit 1 if vercel.json is stale (tests/csp.test.mjs runs this)
// The combined deployment (backend/next.config.mjs) computes the same policy at build time from public/*.html.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STRICT_PAGES = ['admin', 'auth', 'checkout', 'settings', 'settings-apps', 'tutor', 'builder', 'seller', 'upgrade', 'cart', 'orders', 'verify'];
export const HANDLERS = ["this.remove()", "this.parentNode.classList.add('noimg');this.remove()", "this.style.display='none'"];
const DROP = /(googlesyndication|doubleclick\.net|adservice\.google|^https:\/\/www\.google\.com$|adtrafficquality|googletagservices|googleadservices|fundingchoicesmessages|app\.chatwoot\.com|wss:\/\/app\.chatwoot\.com)/;
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;

export function inlineScriptHashes(html) {
  const out = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type=["']?application\/(ld\+)?json/i.test(m[1])) continue;   // data blocks are not executed
    out.push(sha(m[2]));
  }
  return out;
}

export function strictCsp(base, hashes) {
  const dirs = base.split(';').map((d) => d.trim()).filter(Boolean).map((d) => d.split(/\s+/));
  return dirs.map(([name, ...vals]) => {
    let v = vals.filter((x) => !DROP.test(x));
    if (name === 'script-src') v = [...v.filter((x) => x !== "'unsafe-inline'"), ...hashes, "'unsafe-hashes'", ...HANDLERS.map(sha)];
    return [name, ...v].join(' ');
  }).join('; ');
}

export function computeRule(vercel) {
  const general = vercel.headers.find((h) => h.source === '/(.*)');
  const base = general.headers.find((h) => h.key === 'Content-Security-Policy').value;
  const hashes = new Set();
  for (const p of STRICT_PAGES) {
    const f = join(root, `${p}.html`);
    if (existsSync(f)) inlineScriptHashes(readFileSync(f, 'utf8')).forEach((h) => hashes.add(h));
  }
  return {
    source: `/(${STRICT_PAGES.join('|')})(\\.html)?`,
    headers: [
      { key: 'Content-Security-Policy', value: strictCsp(base, [...hashes].sort()) },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
    ],
  };
}

function main() {
  const path = join(root, 'vercel.json');
  const vercel = JSON.parse(readFileSync(path, 'utf8'));
  const rule = computeRule(vercel);
  const i = vercel.headers.findIndex((h) => h.source === rule.source);
  const cur = i >= 0 ? JSON.stringify(vercel.headers[i]) : '';
  if (process.argv.includes('--check')) {
    if (cur !== JSON.stringify(rule)) { console.error('vercel.json strict CSP is stale: run node tools/csp.mjs'); process.exit(1); }
    console.log('strict CSP up to date'); return;
  }
  // the strict rule goes right after the site-wide rule so it wins for its pages (and if both are sent the browser
  // enforces both, which is the strict one anyway)
  if (i >= 0) vercel.headers[i] = rule; else vercel.headers.splice(vercel.headers.findIndex((h) => h.source === '/(.*)') + 1, 0, rule);
  writeFileSync(path, JSON.stringify(vercel, null, 2) + '\n');
  console.log('vercel.json strict CSP written for', STRICT_PAGES.length, 'pages');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
