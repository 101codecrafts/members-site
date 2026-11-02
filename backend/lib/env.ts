import 'server-only';
import { z } from 'zod';

/**
 * Typed, validated environment. Server-only: importing this from client code
 * fails the build. Optional integrations degrade gracefully when unset.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  ALLOWED_ORIGINS: z.string().default(''), // comma-separated extra origins (native app shells, staging)

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  CLERK_SECRET_KEY: z.string().min(10),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(10),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(10),
  REQUIRE_MFA_FOR_STAFF: z.enum(['true', 'false']).default('true'),

  FLW_PUBLIC_KEY: z.string().optional(),
  FLW_SECRET_KEY: z.string().optional(),
  FLW_SECRET_HASH: z.string().optional(), // webhook verif-hash
  FLW_PAYOUT_CALLBACK_URL: z.string().url().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default('101 Codecrafts <hello@101codecrafts.com>'),
  RESEND_AUDIENCE_ID: z.string().optional(),

  CRON_SECRET: z.string().min(16),
  PAYOUT_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9+/=]{43,44}$/, '32-byte base64 key').optional(),
  PAYOUT_ENCRYPTION_KEY_ID: z.string().default('k1'),
  HASH_SALT: z.string().min(16).default('change-me-in-production-salt'),

  GITHUB_TOKEN: z.string().optional(),       // GitHub API (repo unfurl, trending)
  GOOGLE_BOOKS_API_KEY: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(), // Vercel AI Gateway (news summaries)
  AI_MODEL: z.string().default('openai/gpt-4o-mini'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),   // Sentry free tier or self-hosted GlitchTip
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
      throw new Error(`Invalid environment: ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}
