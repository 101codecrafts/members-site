/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
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
