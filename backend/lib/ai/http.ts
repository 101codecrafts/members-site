import { timingSafeEqual } from "node:crypto";
import { loadAiConfig } from "./config";

/** CORS for the static pages calling the API. Only allow-listed origins get credentials. */
export function corsHeaders(origin: string | null, opts: { public?: boolean } = {}): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
  if (opts.public) return { ...base, "Access-Control-Allow-Origin": "*" };
  if (!origin) return base;
  const allowed = loadAiConfig().allowedOrigins;
  if (allowed.includes(origin.replace(/\/$/, ""))) {
    return { ...base, "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
  }
  return base;
}

/** True when a browser request comes from an origin we don't allow (same-origin requests send no/our Origin). */
export function isForeignOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const self = new URL(req.url).origin;
  if (origin === self) return false;
  return !loadAiConfig().allowedOrigins.includes(origin.replace(/\/$/, ""));
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Clerk auth that degrades to anonymous if Clerk/middleware is not configured. */
export async function currentUser(): Promise<{ userId: string | null; getToken: () => Promise<string | null> }> {
  try {
    const { auth } = await import("@clerk/nextjs/server");
    const a = await auth();
    return { userId: a.userId ?? null, getToken: () => a.getToken() };
  } catch {
    return { userId: null, getToken: async () => null };
  }
}
