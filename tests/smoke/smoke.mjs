#!/usr/bin/env node
// Headless smoke test for the static front end.
// Serves the repo root, opens every top-level *.html at 360/768/1440px and records:
//   console errors, page errors, failed requests (>=400 or network failure),
//   broken local links/anchors, horizontal overflow and the elements causing it.
// Usage: node tests/smoke/smoke.mjs [--root .] [--out smoke-report.json] [--strict]
//   CHROMIUM_PATH=/usr/bin/chromium to use a system browser.
// Exit code 1 when --strict and any console/page error, local 4xx/5xx, broken local link or overflow is found.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', '.'));
const OUT = opt('--out', 'smoke-report.json');
const STRICT = args.includes('--strict');
const WIDTHS = (opt('--widths', '360,768,1440')).split(',').map(Number);
const BLOCK_EXTERNAL = args.includes('--offline');
const ALLOW_API_404 = args.includes('--allow-api-404'); // static deploy without backend: /api/* 404s are expected (js/api.js falls back)

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp', '.txt': 'text/plain', '.xml': 'application/xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const ONLY = opt('--pages', '');
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html') && (!ONLY || ONLY.split(',').includes(f))).sort();
const PX = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
let proxy;
if (PX) { const u = new URL(PX); proxy = { server: `${u.protocol}//${u.host}`, bypass: '127.0.0.1,localhost', ...(u.username ? { username: decodeURIComponent(u.username), password: decodeURIComponent(u.password) } : {}) }; }
const launch = () => chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, proxy, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
let browser = await launch();
const report = { base: BASE, pages: {}, summary: {} };
const linkCache = new Map();
// honour vercel.json rewrites (e.g. /go/:id -> /go.html?id=:id) so links that work in production are not flagged
let REWRITES = [];
try { REWRITES = (JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).rewrites || []).map(r => ({ re: new RegExp('^' + r.source.replace(/:[a-zA-Z]+\*?/g, '[^/]+') + '$'), dest: r.destination.split('?')[0] })); } catch {}
const rewrite = p => { for (const r of REWRITES) if (r.re.test(p)) return r.dest; return p; };

for (const pg of pages) {
  const entry = report.pages[pg] = { console: [], pageErrors: [], failedRequests: [], brokenLinks: [], overflow: {} };
  for (const w of WIDTHS) {
   try {
    if (!browser.isConnected()) browser = await launch();
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block', ignoreHTTPSErrors: !!process.env.SMOKE_IGNORE_HTTPS });
    const page = await ctx.newPage();
    // Serve local files in-process so an HTTP(S)_PROXY never intercepts 127.0.0.1.
    await page.route(u => u.href.startsWith(BASE), r => {
      let p = rewrite(decodeURIComponent(new URL(r.request().url()).pathname)); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '404' });
      return r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
    if (BLOCK_EXTERNAL) await page.route(u => !u.href.startsWith(BASE), r => r.abort());
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') { const l = m.location(); const rec = { w, type: m.type(), text: m.text().slice(0, 400), at: l.url ? `${l.url.replace(BASE + '/', '')}:${l.lineNumber + 1}` : '' }; if (!entry.console.some(c => c.text === rec.text)) entry.console.push(rec); } });
    page.on('pageerror', e => { const rec = { w, text: String(e.message).slice(0, 400), stack: String(e.stack || '').split('\n').slice(0, 3).join(' | ').replaceAll(BASE + '/', '') }; if (!entry.pageErrors.some(c => c.text === rec.text)) entry.pageErrors.push(rec); });
    page.on('requestfailed', r => { const rec = { url: r.url().replace(BASE + '/', ''), why: r.failure()?.errorText }; if (!entry.failedRequests.some(c => c.url === rec.url)) entry.failedRequests.push(rec); });
    page.on('response', r => { if (r.status() >= 400) { const rec = { url: r.url().replace(BASE + '/', ''), status: r.status() }; if (!entry.failedRequests.some(c => c.url === rec.url)) entry.failedRequests.push(rec); } });
    try {
      await page.goto(`${BASE}/${pg}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const loaded = await page.waitForLoadState('load', { timeout: 10000 }).then(() => true, () => false);
      if (!loaded) entry.console.push({ w, type: 'warning', text: 'window load event did not fire within 10s (slow/blocked third-party request)', at: pg });
      await page.waitForTimeout(800);
    } catch (e) { entry.pageErrors.push({ w, text: 'navigation: ' + e.message.slice(0, 200) }); }
    page.on('framenavigated', f => { if (f === page.mainFrame() && !f.url().endsWith('/' + pg) && !f.url().includes('/' + pg + '#') && !f.url().includes('/' + pg + '?')) { if (!entry.redirects) entry.redirects = []; const u = f.url().replace(BASE + '/', ''); if (!entry.redirects.includes(u)) entry.redirects.push(u); } });
    try {
    entry.overflow[w] = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const sw = document.documentElement.scrollWidth;
      const offenders = [];
      if (sw > vw + 1) {
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right > vw + 1 && r.left < vw) {
            const cs = getComputedStyle(el);
            if (cs.position === 'fixed' && cs.visibility === 'hidden') continue;
            let anc = el.parentElement, clipped = false;
            while (anc && anc !== document.body) { const ox = getComputedStyle(anc).overflowX; if (ox === 'hidden' || ox === 'auto' || ox === 'scroll' || ox === 'clip') { clipped = true; break; } anc = anc.parentElement; }
            if (clipped) continue;
            const sel = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
            offenders.push({ sel, right: Math.round(r.right), width: Math.round(r.width) });
          }
        }
      }
      // keep the outermost offenders only
      return { viewport: vw, scrollWidth: sw, overflowPx: Math.max(0, sw - vw), offenders: offenders.slice(0, 8) };
    });
    } catch (e) { entry.overflow[w] = { overflowPx: 0, error: e.message.slice(0, 160) }; entry.pageErrors.push({ w, text: 'evaluate failed (page navigated or crashed): ' + e.message.slice(0, 160) }); }
    if (w === WIDTHS[WIDTHS.length - 1]) {
      const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href'))).catch(() => []);
      for (const href of [...new Set(links)]) {
        if (!href || /^(https?:|mailto:|tel:|javascript:)/.test(href)) continue;
        if (href === '#') { entry.brokenLinks.push({ href, why: 'placeholder href="#"' }); continue; }
        const [file, hash] = href.split('#');
        const target = file ? rewrite(file.split('?')[0]).replace(/^\//, '') : pg;
        if (!linkCache.has(target)) linkCache.set(target, fs.existsSync(path.join(ROOT, target)));
        if (!linkCache.get(target)) { entry.brokenLinks.push({ href, why: 'missing file' }); continue; }
        if (hash && target.endsWith('.html')) {
          const html = fs.readFileSync(path.join(ROOT, target), 'utf8');
          if (!new RegExp(`id=["']${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(html)) entry.brokenLinks.push({ href, why: 'missing anchor' });
        }
      }
    }
    await ctx.close();
   } catch (e) {
    entry.pageErrors.push({ w, text: 'browser crashed/closed while testing: ' + String(e.message).split('\n')[0].slice(0, 160) });
    try { await browser.close(); } catch {}
    browser = await launch();
   }
  }
}
await browser.close(); server.close();

let fail = 0;
for (const [pg, e] of Object.entries(report.pages)) {
  const errs = e.console.filter(c => c.type === 'error' && !(ALLOW_API_404 && /\/api\/|^api\//.test(c.at || ''))).length + e.pageErrors.length;
  const local404 = e.failedRequests.filter(r => !/^https?:/.test(r.url) && (r.status >= 400 || r.why) && !(ALLOW_API_404 && /^api\//.test(r.url))).length;
  const broken = e.brokenLinks.filter(b => b.why !== 'placeholder href="#"').length;
  const ovf = Object.values(e.overflow).filter(o => o.overflowPx > 0).length;
  report.summary[pg] = { errors: errs, localFailedRequests: local404, externalFailed: e.failedRequests.length - local404, brokenLinks: broken, placeholderLinks: e.brokenLinks.length - broken, overflowWidths: Object.entries(e.overflow).filter(([, o]) => o.overflowPx > 0).map(([w, o]) => `${w}:+${o.overflowPx}px`) };
  fail += errs + local404 + broken + ovf;
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.table(report.summary);
console.log(`report -> ${OUT}`);
if (STRICT && fail) { console.error(`smoke: ${fail} problem(s)`); process.exit(1); }
