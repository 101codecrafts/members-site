import 'server-only';

/**
 * CORS allow-list: the site origin, native app shells (Capacitor/Tauri/Expo
 * dev) and extra origins from ALLOWED_ORIGINS. Never `*` with credentials.
 */
const NATIVE_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'tauri://localhost', 'https://tauri.localhost'];
/** Expo dev server. r12 (R12-SEC-08): never trusted with credentials on the production deployment, where any local
 *  process listening on :8081 of a member's machine could otherwise make credentialed API calls as them. */
const DEV_ORIGINS = ['http://localhost:8081'];

export function allowedOrigins(): string[] {
  const app = process.env.APP_URL ?? 'http://localhost:3000';
  const extra = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const dev = process.env.VERCEL_ENV === 'production' ? [] : DEV_ORIGINS;
  return [app, ...NATIVE_ORIGINS, ...dev, ...extra];
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowedOrigins().includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Credentials'] = 'true';
    h['Access-Control-Allow-Methods'] = 'GET,POST,PATCH,PUT,DELETE,OPTIONS';
    h['Access-Control-Allow-Headers'] = 'authorization,content-type,x-request-id,idempotency-key,x-cc-viewer';   // r13: x-cc-viewer (CDN cache split)
    h['Access-Control-Expose-Headers'] = 'x-request-id,server-timing,retry-after';   // r13: lets the UI quote the request id in support messages
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}
