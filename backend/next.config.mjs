/** @type {import('next').NextConfig} */
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
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://challenges.cloudflare.com https://cdn.jsdelivr.net https://checkout.flutterwave.com https://app.chatwoot.com https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://*.googlesyndication.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://adservice.google.com https://www.google.com https://*.adtrafficquality.google https://*.googletagservices.com https://*.googleadservices.com https://fundingchoicesmessages.google.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: blob: https: https://tile.openstreetmap.org; font-src 'self' data:; connect-src 'self' https://*.clerk.accounts.dev https://openrouter.ai https://api.groq.com https://router.huggingface.co https://api.github.com https://hacker-news.firebaseio.com https://dev.to https://www.youtube.com https://openlibrary.org https://*.flutterwave.com https://app.chatwoot.com wss://app.chatwoot.com https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://*.googlesyndication.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://adservice.google.com https://www.google.com https://*.adtrafficquality.google https://*.googletagservices.com https://*.googleadservices.com https://fundingchoicesmessages.google.com; frame-src 'self' https://*.clerk.accounts.dev https://challenges.cloudflare.com https://meet.jit.si https://www.youtube-nocookie.com https://*.flutterwave.com https://app.chatwoot.com https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://*.googlesyndication.com https://googleads.g.doubleclick.net https://*.doubleclick.net https://adservice.google.com https://www.google.com https://*.adtrafficquality.google https://*.googletagservices.com https://*.googleadservices.com https://fundingchoicesmessages.google.com; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests" },
];
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/api/:path*', headers: securityHeaders },
      { source: '/((?!api/).*)', headers: pageHeaders },
    ];
  },
  async rewrites() {
    // Friendly public URLs → versioned API (deep-link friendly for native apps).
    return [
      { source: '/go/:id', destination: '/api/v1/go/:id' },
      { source: '/verify/:code', destination: '/api/v1/certificates/verify/:code' },
      { source: '/u/:username', destination: '/api/v1/portfolio/:username' },
      { source: '/', destination: '/index.html' },
    ];
  },
};
