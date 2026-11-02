import { z } from "zod";

/**
 * Central, validated configuration for every AI feature.
 * All values come from environment variables so models can be swapped
 * (e.g. after the free Ling 3.1 Flash window ends on 3 Nov 2026) without code changes.
 *
 * Nothing here is a secret by itself; the secrets (AI_GATEWAY_API_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, AI_INGEST_SECRET) are only read on the server.
 */

/** Default chat model: free on Vercel AI Gateway until 3 Nov 2026. */
export const DEFAULT_CHAT_MODEL = "inclusionai/ling-3.1-flash-1019";
/**
 * Fallbacks tried in order by the gateway if the primary fails or is removed.
 * Both are among the cheapest models on the gateway (see docs/AI_FEATURES.md).
 */
export const DEFAULT_FALLBACK_MODELS = ["openai/gpt-oss-20b", "google/gemini-2.5-flash-lite"];
/** Vision-capable model for "Ask AI about this board" when an image is attached. */
export const DEFAULT_VISION_MODEL = "google/gemini-2.5-flash-lite";
/** Requested at 1536 dimensions (outputDimensionality); must match vector(1536) in the ai_features migration.
 * Chosen because it is available on the gateway free tier (OpenAI embeddings are not). */
export const DEFAULT_EMBEDDING_MODEL = "google/gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 1536;

const modelId = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/, "model ids look like 'provider/model'");

const csvModels = z
  .string()
  .optional()
  .transform((v) =>
    v === undefined
      ? undefined
      : v
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
  )
  .pipe(z.array(modelId).max(5).optional());

const intFromEnv = (def: number, min: number, max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number(v)))
    .pipe(z.number().int().min(min).max(max));

export const aiEnvSchema = z.object({
  AI_CHAT_MODEL: modelId.optional(),
  AI_FALLBACK_MODELS: csvModels,
  AI_VISION_MODEL: modelId.optional(),
  AI_EMBEDDING_MODEL: modelId.optional(),
  /** Messages per window for signed-in members. */
  AI_RATE_LIMIT_USER: intFromEnv(30, 1, 10_000),
  /** Messages per window for anonymous visitors (keyed by hashed IP). */
  AI_RATE_LIMIT_ANON: intFromEnv(8, 0, 10_000),
  /** Window length in seconds. */
  AI_RATE_LIMIT_WINDOW_SECONDS: intFromEnv(600, 10, 86_400),
  AI_MAX_OUTPUT_TOKENS: intFromEnv(1200, 64, 8192),
  /** Comma-separated origins allowed to call the API from the static pages. */
  AI_ALLOWED_ORIGINS: z.string().optional(),
});

export type AiConfig = {
  chatModel: string;
  fallbackModels: string[];
  visionModel: string;
  embeddingModel: string;
  rateLimit: { user: number; anon: number; windowSeconds: number };
  maxOutputTokens: number;
  allowedOrigins: string[];
};

export function loadAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  const parsed = aiEnvSchema.parse(env);
  const chatModel = parsed.AI_CHAT_MODEL ?? DEFAULT_CHAT_MODEL;
  const fallbackModels = (parsed.AI_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS).filter((m) => m !== chatModel);
  return {
    chatModel,
    fallbackModels,
    visionModel: parsed.AI_VISION_MODEL ?? DEFAULT_VISION_MODEL,
    embeddingModel: parsed.AI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
    rateLimit: {
      user: parsed.AI_RATE_LIMIT_USER,
      anon: parsed.AI_RATE_LIMIT_ANON,
      windowSeconds: parsed.AI_RATE_LIMIT_WINDOW_SECONDS,
    },
    maxOutputTokens: parsed.AI_MAX_OUTPUT_TOKENS,
    allowedOrigins: (parsed.AI_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
  };
}
