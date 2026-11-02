import "server-only";
import { createGateway } from "@ai-sdk/gateway";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModel, LanguageModel } from "ai";

type ProviderOptions = Record<string, Record<string, JSONValue>>;
type JSONValue = null | string | number | boolean | JSONValue[] | { [key: string]: JSONValue };
import { EMBEDDING_DIMENSIONS, loadAiConfig, type AiConfig } from "./config";

/**
 * Every model call goes through Vercel AI Gateway. Two transports:
 *  - "native" (default): the AI SDK's gateway provider. Fallbacks are passed as
 *    providerOptions.gateway.models and are tried by the gateway in order.
 *  - "openai-compatible": the gateway's OpenAI-compatible endpoint
 *    (https://ai-gateway.vercel.sh/v1). Same key, same models, same billing.
 *    Useful behind proxies that only allow /v1 traffic. Fallbacks are sent as
 *    the top-level `models` body field, which the gateway accepts.
 * Select with AI_GATEWAY_TRANSPORT.
 */
export type Transport = "native" | "openai-compatible";

const GATEWAY_V1 = "https://ai-gateway.vercel.sh/v1";

export function transport(): Transport {
  return process.env.AI_GATEWAY_TRANSPORT === "openai-compatible" ? "openai-compatible" : "native";
}

function apiKey(): string {
  const key = process.env.AI_GATEWAY_API_KEY;
  // On Vercel deployments OIDC auth is used automatically when no key is set.
  if (!key && !process.env.VERCEL_OIDC_TOKEN) {
    throw new Error("AI_GATEWAY_API_KEY is not set (and no Vercel OIDC token is available).");
  }
  return key ?? "";
}

let nativeGateway: ReturnType<typeof createGateway> | null = null;
let compatGateway: ReturnType<typeof createOpenAICompatible> | null = null;

function native() {
  nativeGateway ??= createGateway(process.env.AI_GATEWAY_API_KEY ? { apiKey: process.env.AI_GATEWAY_API_KEY } : {});
  return nativeGateway;
}
function compat() {
  compatGateway ??= createOpenAICompatible({ name: "gateway", baseURL: GATEWAY_V1, apiKey: apiKey() });
  return compatGateway;
}

export function chatModel(id: string): LanguageModel {
  return transport() === "native" ? native()(id) : compat().chatModel(id);
}

export function embeddingModel(id: string): EmbeddingModel {
  return transport() === "native" ? native().embeddingModel(id) : compat().embeddingModel(id);
}

/** providerOptions that make the gateway fall back through the configured model list. */
export function fallbackProviderOptions(cfg: AiConfig = loadAiConfig()): ProviderOptions {
  if (!cfg.fallbackModels.length) return {};
  // Native: read by the gateway provider. openai-compatible: createOpenAICompatible
  // spreads providerOptions[name] ("gateway") into the request body as `models`.
  return { gateway: { models: cfg.fallbackModels } };
}

/** providerOptions asking each embedding provider for EMBEDDING_DIMENSIONS-sized vectors. */
export function embeddingProviderOptions(): ProviderOptions {
  return transport() === "native"
    ? {
        google: { outputDimensionality: EMBEDDING_DIMENSIONS },
        vertex: { outputDimensionality: EMBEDDING_DIMENSIONS },
        openai: { dimensions: EMBEDDING_DIMENSIONS },
      }
    : { gateway: { dimensions: EMBEDDING_DIMENSIONS } };
}
