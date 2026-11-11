/** @type {import('next').NextConfig} */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
// Static front end (copied into public/ by scripts/copy-static.mjs) gets its own CSP; it calls /api/v1 same-origin.
const pageHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: "camera=(self \"https://meet.jit.si\"), microphone=(self \"https://meet.jit.si\"), display-capture=(self \"https://meet.jit.si\"), geolocation=()" },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com https://cdn.jsdelivr.net https://checkout.flutterwave.com https://app.chatwoot.com https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://*.googlesyndication.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://adservice.google.com https://www.google.com https://*.adtrafficquality.google https://*.googletagservices.com https://*.googleadservices.com https://fundingchoicesmessages.google.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: blob: https: https://tile.openstreetmap.org; font-src 'self' data:; connect-src 'self' https://*.clerk.accounts.dev https://*.protect.clerk.com:* https://clerk-telemetry.com https://*.clerk-telemetry.com https://openrouter.ai https://api.groq.com https://router.huggingface.co https://api.github.com https://hacker-news.firebaseio.com https://dev.to https://www.youtube.com https://openlibrary.org https://*.flutterwave.com https://app.chatwoot.com wss://app.chatwoot.com https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://*.googlesyndication.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://adservice.google.com https://www.google.com https://*.adtrafficquality.google https://*.googletagservices.com https://*.googleadservices.com https://fundingchoicesmessages.google.com; frame-src 'self' https://*.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com https://meet.jit.si https://www.youtube-nocookie.com https://*.flutterwave.com https://app.chatwoot.com https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://*.googlesyndication.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://adservice.google.com https://www.google.com https://*.adtrafficquality.google https://*.googletagservices.com https://*.googleadservices.com https://fundingchoicesmessages.google.com; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" },
];
// r12 security (R12-SEC-01): strict CSP for the sign-in / money / admin / tutor pages. Same transform as the static
// site's tools/csp.mjs, computed here at build time from public/<page>.html so the hashes always match what ships:
// no 'unsafe-inline' scripts (inline <script> blocks by sha256, the three image-fallback onerror handlers by
// 'unsafe-hashes'), and no ad-network hosts.
const STRICT_PAGES = ['admin', 'auth', 'checkout', 'settings', 'settings-apps', 'tutor', 'builder', 'seller', 'upgrade', 'cart', 'orders', 'verify'];
const HANDLERS = ["this.remove()", "this.parentNode.classList.add('noimg');this.remove()", "this.style.display='none'"];
const DROP = /(googlesyndication|doubleclick\.net|adservice\.google|^https:\/\/www\.google\.com$|adtrafficquality|googletagservices|googleadservices|fundingchoicesmessages|app\.chatwoot\.com|wss:\/\/app\.chatwoot\.com)/;
const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
function strictHeaders() {
  const base = pageHeaders.find((h) => h.key === 'Content-Security-Policy').value;
  const hashes = new Set();
  for (const p of STRICT_PAGES) {
    const f = fileURLToPath(new URL(`./public/${p}.html`, import.meta.url));
    if (!existsSync(f)) continue;
    for (const m of readFileSync(f, 'utf8').matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (!/type=["']?application\/(ld\+)?json/i.test(m[1])) hashes.add(sha(m[2]));
    }
  }
  const csp = base.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...vals] = d.split(/\s+/);
    let v = vals.filter((x) => !DROP.test(x));
    if (name === 'script-src') v = [...v.filter((x) => x !== "'unsafe-inline'"), ...[...hashes].sort(), "'unsafe-hashes'", ...HANDLERS.map(sha)];
    return [name, ...v].join(' ');
  }).join('; ');
  return [...pageHeaders.filter((h) => h.key !== 'Content-Security-Policy'), { key: 'Content-Security-Policy', value: csp },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }];
}
const STRICT_SOURCE = `/:page(${STRICT_PAGES.join('|')}){.html}?`;
// r13 seo (QA Q24): search indexing is a deliberate switch. Pages may be indexed only on the PRODUCTION deployment with
// SITE_INDEXING=on (set it when the domain is live). Everything else (previews, a production build without the flag)
// sends X-Robots-Tag: noindex on every response. /api is never indexable. Per-page noindex for signed-in pages is in
// the HTML itself (front end tools/seo.py).
export const SITE_INDEXING = process.env.VERCEL_ENV === 'production' && process.env.SITE_INDEXING === 'on';
const NOINDEX = { key: 'X-Robots-Tag', value: 'noindex' };

// Old sign-in / sign-up URLs all land on the single auth page (same list as the static repo's vercel.json).
export const AUTH_ALIASES = ['/signin.html', '/signin', '/signup.html', '/signup', '/onboarding.html', '/onboarding', '/login', '/register'];

export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/api/:path*', headers: [...securityHeaders, NOINDEX] },
      { source: '/((?!api/).*)', headers: pageHeaders },
      { source: STRICT_SOURCE, headers: strictHeaders() },    // after the general rule: Next applies the last match per key
      ...(SITE_INDEXING ? [] : [{ source: '/:path*', headers: [NOINDEX] }]),   // r13 seo: previews and un-flagged builds stay out of search
    ];
  },
  async redirects() {
    // Mirrors the static front end's vercel.json redirects (repo/vercel.json); Next keeps the query string by default.
    return [
      { source: '/ai.html', destination: '/ai-tools.html', permanent: true },
      ...AUTH_ALIASES.map((source) => ({ source, destination: '/auth.html', permanent: true })),
    ];
  },
  async rewrites() {
    // Friendly public URLs → versioned API (deep-link friendly for native apps).
    return [
      { source: '/go/:id', destination: '/api/v1/go/:id' },
      { source: '/verify/:code', destination: '/api/v1/certificates/verify/:code' },
      { source: '/u/:username', destination: '/api/v1/portfolio/:username' },
      // session whiteboard iframe target -> branded coming-soon page (static front end)
      { source: '/whiteboard/:id', destination: '/whiteboard.html' },
      { source: '/auth', destination: '/auth.html' },   // static vercel.json rewrite: pretty URL for the auth page
      { source: '/', destination: '/index.html' },
    ];
  },
};
