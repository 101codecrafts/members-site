import { z } from "zod";

/**
 * 101 AI hub — catalogue of FREE (or free-tier) models, grouped by provider.
 * Pure module (no secrets, no network): safe to import in tests and to derive the
 * public model list. Provider keys are read only on the server (providers.ts).
 *
 * Order = fallback priority: Vercel AI Gateway first, then OpenRouter ":free"
 * models, then Groq, then Google Gemini free tier.
 *
 * Free model line-ups change often. Override the whole list without a deploy of
 * new code via AI_HUB_MODELS (JSON array of HubModel) — see docs/AI_FEATURES.md.
 */

export const PROVIDERS = ["gateway", "openrouter", "groq", "gemini"] as const;
export type ProviderId = (typeof PROVIDERS)[number];

export const PROVIDER_ENV: Record<ProviderId, string> = {
  gateway: "AI_GATEWAY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  gateway: "Vercel AI Gateway",
  openrouter: "OpenRouter (free)",
  groq: "Groq (free tier)",
  gemini: "Google Gemini (free tier)",
};

export const hubModelSchema = z.object({
  /** Stable public id used by the picker, e.g. "gateway:inclusionai/ling-3.1-flash-1019". */
  id: z.string().min(3).max(120),
  provider: z.enum(PROVIDERS),
  /** Provider-native model id. */
  model: z.string().min(2).max(120),
  label: z.string().min(2).max(60),
  note: z.string().max(120).default(""),
  /** Good at code (used to pick the default for the code helper). */
  code: z.boolean().default(false),
  /** Optional ISO date after which the model is hidden (e.g. a free window ending). */
  freeUntil: z.string().optional(),
});
export type HubModel = z.infer<typeof hubModelSchema>;

export const DEFAULT_HUB_MODELS: HubModel[] = [
  {
    id: "gateway:inclusionai/ling-3.1-flash-1019",
    provider: "gateway",
    model: "inclusionai/ling-3.1-flash-1019",
    label: "Ling 3.1 Flash",
    note: "Free on Vercel AI Gateway until 3 Nov 2026",
    code: false,
    freeUntil: "2026-11-03T23:59:59Z",
  },
  {
    id: "gateway:openai/gpt-oss-20b",
    provider: "gateway",
    model: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    note: "Open-weights model; runs on gateway free credits",
    code: true,
  },
  {
    id: "openrouter:google/gemma-4-31b-it:free",
    provider: "openrouter",
    model: "google/gemma-4-31b-it:free",
    label: "Gemma 4 31B",
    note: "OpenRouter free model",
    code: false,
  },
  {
    id: "openrouter:nvidia/nemotron-3.5-lightning:free",
    provider: "openrouter",
    model: "nvidia/nemotron-3.5-lightning:free",
    label: "Nemotron 3.5 Lightning",
    note: "OpenRouter free model",
    code: true,
  },
  {
    id: "groq:llama-3.3-70b-versatile",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B (Groq)",
    note: "Very fast; Groq free tier",
    code: false,
  },
  {
    id: "groq:openai/gpt-oss-20b",
    provider: "groq",
    model: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B (Groq)",
    note: "Groq free tier",
    code: true,
  },
  {
    id: "gemini:gemini-2.5-flash",
    provider: "gemini",
    model: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    note: "Google AI Studio free tier",
    code: true,
  },
];

export function loadHubModels(env: Record<string, string | undefined> = process.env, now = new Date()): HubModel[] {
  let list = DEFAULT_HUB_MODELS;
  if (env.AI_HUB_MODELS) {
    let json: unknown = null;
    try {
      json = JSON.parse(env.AI_HUB_MODELS);
    } catch {
      /* invalid JSON → defaults */
    }
    const parsed = z.array(hubModelSchema).min(1).max(30).safeParse(json);
    if (parsed.success) list = parsed.data;
    else console.warn("[ai-hub] AI_HUB_MODELS is invalid; using defaults:", parsed.error.issues[0]?.message);
  }
  return list.filter((m) => Boolean(env[PROVIDER_ENV[m.provider]]) || (m.provider === "gateway" && Boolean(env.VERCEL_OIDC_TOKEN)))
    .filter((m) => !m.freeUntil || new Date(m.freeUntil).getTime() > now.getTime());
}

/** Chosen model first, then the rest in catalogue order (cross-provider fallback chain). */
export function fallbackChain(models: HubModel[], chosenId: string | undefined, mode: "chat" | "code" | "lesson"): HubModel[] {
  if (!models.length) return [];
  const chosen = models.find((m) => m.id === chosenId);
  const preferred = chosen ?? (mode === "code" ? models.find((m) => m.code) : undefined) ?? models[0]!;
  return [preferred, ...models.filter((m) => m.id !== preferred.id)].slice(0, 4);
}

/** What the browser may see: no provider-native secrets, just ids and labels. */
export function publicModels(models: HubModel[]) {
  return models.map((m) => ({ id: m.id, label: m.label, provider: PROVIDER_LABEL[m.provider], note: m.note, code: m.code }));
}
