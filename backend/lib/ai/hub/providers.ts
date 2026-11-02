import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import { chatModel as gatewayChatModel, fallbackProviderOptions } from "../models";
import type { HubModel, ProviderId } from "./catalog";

/**
 * Server-side provider wiring for the 101 AI hub. Keys come ONLY from env:
 *   AI_GATEWAY_API_KEY · OPENROUTER_API_KEY · GROQ_API_KEY · GEMINI_API_KEY
 * They are never serialised to the client (the browser only sees catalog ids).
 */
const BASE_URL: Record<Exclude<ProviderId, "gateway">, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
};
const KEY_ENV: Record<Exclude<ProviderId, "gateway">, string> = {
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const cache = new Map<string, ReturnType<typeof createOpenAICompatible>>();
function compat(p: Exclude<ProviderId, "gateway">) {
  let c = cache.get(p);
  if (!c) {
    c = createOpenAICompatible({
      name: p,
      baseURL: BASE_URL[p],
      apiKey: process.env[KEY_ENV[p]] ?? "",
      headers:
        p === "openrouter"
          ? { "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://101codecrafts.com", "X-Title": "101 Codecrafts — 101 AI" }
          : undefined,
    });
    cache.set(p, c);
  }
  return c;
}

export function resolveModel(m: HubModel): LanguageModelV4 {
  const model = m.provider === "gateway" ? gatewayChatModel(m.model) : compat(m.provider).chatModel(m.model);
  return model as unknown as LanguageModelV4;
}

/** Errors worth falling through to the next provider (rate limits, outages, removed models). */
export function isRetryable(err: unknown): boolean {
  const e = err as { statusCode?: number; name?: string; message?: string };
  if (typeof e?.statusCode === "number") return e.statusCode === 408 || e.statusCode === 404 || e.statusCode === 429 || e.statusCode >= 500 || e.statusCode === 401 || e.statusCode === 403;
  return /fetch failed|ECONN|ETIMEDOUT|network|rate|quota|unavailable|not found|no providers/i.test(e?.message ?? "");
}

/**
 * A LanguageModel that tries each model in order until one starts responding.
 * Covers failures at request time (429/5xx/auth/removed model); a failure in the
 * middle of a stream is surfaced to the user rather than silently restarted.
 */
export function fallbackModel(chain: HubModel[], onPick?: (m: HubModel) => void): LanguageModel {
  if (!chain.length) throw new Error("No AI models are configured (set at least one provider key).");
  const models = chain.map((m) => ({ meta: m, model: resolveModel(m) }));
  const first = models[0]!.model;
  async function attempt<T>(fn: (m: LanguageModelV4, meta: HubModel) => PromiseLike<T>): Promise<T> {
    let lastErr: unknown;
    for (const { meta, model } of models) {
      try {
        const out = await fn(model, meta);
        onPick?.(meta);
        return out;
      } catch (err) {
        lastErr = err;
        console.warn(`[ai-hub] ${meta.id} failed:`, (err as Error).message?.slice(0, 200));
        if (!isRetryable(err)) throw err;
      }
    }
    throw lastErr;
  }
  const withGatewayFallbacks = (opts: LanguageModelV4CallOptions, meta: HubModel): LanguageModelV4CallOptions =>
    meta.provider === "gateway" ? { ...opts, providerOptions: { ...(opts.providerOptions ?? {}), ...fallbackProviderOptions() } } : opts;
  const wrapper: LanguageModelV4 = {
    specificationVersion: "v4",
    provider: "101-ai-fallback",
    modelId: chain.map((c) => c.id).join(" > "),
    supportedUrls: first.supportedUrls,
    doGenerate: (opts) => attempt((m, meta) => m.doGenerate(withGatewayFallbacks(opts, meta))),
    doStream: (opts) => attempt((m, meta) => m.doStream(withGatewayFallbacks(opts, meta))),
  };
  return wrapper as unknown as LanguageModel;
}
