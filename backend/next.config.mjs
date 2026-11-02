/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Meetings embed Jitsi (meet.jit.si): allow it camera, mic and screen share; everything else stays off.
  { key: 'Permissions-Policy', value: 'camera=(self "https://meet.jit.si"), microphone=(self "https://meet.jit.si"), display-capture=(self "https://meet.jit.si"), geolocation=()' },
];
// The whiteboard / code playground is embedded by our own pages (static-page widget,
// Ask-AI panel), so it may be framed same-origin. Listed after the global rule so it wins.
const whiteboardHeaders = [{ key: 'X-Frame-Options', value: 'SAMEORIGIN' }];
export default {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/whiteboard/:path*', headers: whiteboardHeaders },
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
