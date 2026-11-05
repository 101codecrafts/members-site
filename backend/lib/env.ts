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
  // Round 11 payment providers (lib/payments). This build refuses PAYMENTS_MODE=live in code.
  PAYMENTS_MODE: z.enum(['sandbox', 'live']).default('sandbox'),
  PESAPAL_CONSUMER_KEY: z.string().optional(), PESAPAL_CONSUMER_SECRET: z.string().optional(), PESAPAL_IPN_ID: z.string().optional(),
  DPO_COMPANY_TOKEN: z.string().optional(), DPO_SERVICE_TYPE: z.string().optional(), DPO_SANDBOX: z.enum(['true', 'false']).default('false'),
  MTN_MOMO_SUBSCRIPTION_KEY: z.string().optional(), MTN_MOMO_API_USER: z.string().optional(), MTN_MOMO_API_KEY: z.string().optional(),
  AIRTEL_CLIENT_ID: z.string().optional(), AIRTEL_CLIENT_SECRET: z.string().optional(),

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
  // On-site AI fallbacks (server-only keys; tried in order after the Vercel AI Gateway)
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_FREE_MODEL: z.string().default('meta-llama/llama-3.3-70b-instruct:free'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  // Video meetings (Jitsi needs nothing). TODO: create OAuth apps, then set these.
  JITSI_DOMAIN: z.string().default('meet.jit.si'),
  GOOGLE_CLIENT_ID: z.string().optional(), GOOGLE_CLIENT_SECRET: z.string().optional(),
  ZOOM_CLIENT_ID: z.string().optional(), ZOOM_CLIENT_SECRET: z.string().optional(), ZOOM_WEBHOOK_SECRET: z.string().optional(),
  MS_CLIENT_ID: z.string().optional(), MS_CLIENT_SECRET: z.string().optional(),
  MEETING_TOKEN_KEY: z.string().regex(/^[A-Za-z0-9+/=]{43,44}$/, '32-byte base64 key').optional(),
  TICKET_HMAC_SECRET: z.string().min(32).optional(),
  // Judge (self-hosted Judge0 CE). Unset → submissions stay 'pending' and are retried by cron.
  JUDGE0_URL: z.string().url().optional(),
  JUDGE0_AUTH_TOKEN: z.string().optional(),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
  // Round 11 admin link checks: Google Web Risk (commercial) first, Safe Browsing v4 (non-commercial) second; unset = 'not_scanned' flag.
  WEB_RISK_API_KEY: z.string().optional(),
  SAFE_BROWSING_API_KEY: z.string().optional(),   // Sentry free tier or self-hosted GlitchTip
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
