import "server-only";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { loadAiConfig } from "./config";
import { checkUserMessage, type GuardVerdict } from "./guardrails";
import { retrieve } from "./knowledge";
import { chatModel, fallbackProviderOptions } from "./models";
import { buildSystemPrompt } from "./prompt";
import { lastUserText } from "./request";
import { formatContext, toCitations } from "./retrieval";
import { createAssistantTools, defaultToolDeps, type ToolDeps } from "./tools";

export type AssistantRun =
  | { kind: "blocked"; verdict: Extract<GuardVerdict, { action: "block" }> }
  | {
      kind: "stream";
      result: { toUIMessageStreamResponse: ReturnType<typeof streamText>["toUIMessageStreamResponse"]; text: PromiseLike<string> };
      citations: ReturnType<typeof toCitations>;
      retrievalMode: "hybrid" | "lexical";
      model: string;
    };

/**
 * The whole assistant pipeline, transport-agnostic:
 * guard → retrieve (hybrid RAG) → system prompt with fenced context → streamText
 * with tools and gateway model fallbacks.
 */
export async function runAssistant(opts: {
  messages: UIMessage[];
  signedIn: boolean;
  toolDeps?: ToolDeps;
  abortSignal?: AbortSignal;
  onFinish?: (text: string) => Promise<void> | void;
}): Promise<AssistantRun> {
  const cfg = loadAiConfig();
  const question = lastUserText(opts.messages);
  const verdict = checkUserMessage(question);
  if (verdict.action === "block") return { kind: "blocked", verdict };

  const { docs, mode } = await retrieve(question, 5);
  const system = buildSystemPrompt({ context: formatContext(docs), signedIn: opts.signedIn, flags: verdict.flags });

  const result = streamText({
    model: chatModel(cfg.chatModel),
    system,
    messages: await convertToModelMessages(opts.messages),
    tools: createAssistantTools(opts.toolDeps ?? defaultToolDeps),
    stopWhen: stepCountIs(5),
    maxOutputTokens: cfg.maxOutputTokens,
    temperature: 0.3,
    providerOptions: fallbackProviderOptions(cfg),
    abortSignal: opts.abortSignal,
    onError: ({ error }) => {
      const e = error as { message?: string; statusCode?: number; responseBody?: string };
      console.error("[ai] model error:", e.statusCode ?? "", e.message ?? error, e.responseBody?.slice(0, 500) ?? "");
    },
    onFinish: async ({ text }) => {
      try {
        await opts.onFinish?.(text);
      } catch (err) {
        console.error("[ai] onFinish failed:", (err as Error).message);
      }
    },
  });

  return { kind: "stream", result, citations: toCitations(docs), retrievalMode: mode, model: cfg.chatModel };
}
