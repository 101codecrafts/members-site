import 'server-only';

/**
 * CORS allow-list: the site origin, native app shells (Capacitor/Tauri/Expo
 * dev) and extra origins from ALLOWED_ORIGINS. Never `*` with credentials.
 */
const NATIVE_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'tauri://localhost', 'https://tauri.localhost', 'http://localhost:8081'];

export function allowedOrigins(): string[] {
  const app = process.env.APP_URL ?? 'http://localhost:3000';
  const extra = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [app, ...NATIVE_ORIGINS, ...extra];
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowedOrigins().includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Credentials'] = 'true';
    h['Access-Control-Allow-Methods'] = 'GET,POST,PATCH,PUT,DELETE,OPTIONS';
    h['Access-Control-Allow-Headers'] = 'authorization,content-type,x-request-id,idempotency-key';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}
