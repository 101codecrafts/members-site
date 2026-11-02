import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { runAssistant } from "../../../lib/ai/assistant";
import { loadAiConfig } from "../../../lib/ai/config";
import { ensureConversation, saveMessages } from "../../../lib/ai/history";
import { clientIp, corsHeaders, currentUser, isForeignOrigin, json } from "../../../lib/ai/http";
import { anonKey, supabaseStore, userKey, withFallback } from "../../../lib/ai/rate-limit";
import { chatRequestSchema, lastUserText, normalizeMessages } from "../../../lib/ai/request";
import { serviceClient, userClient } from "../../../lib/ai/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  if (isForeignOrigin(req)) return json({ error: "Origin not allowed" }, 403, cors);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid request", issues: parsed.error.issues.slice(0, 5) }, 400, cors);

  const messages = normalizeMessages(parsed.data.messages);
  if (!messages.length || messages[messages.length - 1]!.role !== "user") {
    return json({ error: "The last message must be from the user" }, 400, cors);
  }

  // ---- auth + rate limit -------------------------------------------------
  const cfg = loadAiConfig();
  const { userId, getToken } = await currentUser();
  const limit = userId ? cfg.rateLimit.user : cfg.rateLimit.anon;
  const key = userId ? userKey(userId) : anonKey(clientIp(req));
  const svc = serviceClient();
  const rl = await withFallback(svc ? supabaseStore(svc) : null)(key, limit, cfg.rateLimit.windowSeconds);
  const rlHeaders = {
    "X-RateLimit-Limit": String(rl.limit),
    "X-RateLimit-Remaining": String(rl.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rl.resetAt.getTime() / 1000)),
  };
  if (!rl.allowed) {
    const mins = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 60000));
    return json(
      {
        error: "rate_limited",
        message: userId
          ? `You've reached the chat limit. Try again in about ${mins} minute(s).`
          : `Visitors can send ${limit} messages every ${Math.round(cfg.rateLimit.windowSeconds / 60)} minutes. Sign in for more, or try again in about ${mins} minute(s).`,
      },
      429,
      { ...cors, ...rlHeaders, "Retry-After": String(mins * 60) },
    );
  }

  // ---- history (signed-in members only; RLS-scoped client) ---------------
  const sb = userId ? userClient(getToken) : null;
  let conversationId: string | undefined;
  if (sb) {
    try {
      conversationId = await ensureConversation(sb, parsed.data.conversationId, lastUserText(messages));
    } catch (err) {
      console.warn("[ai] history unavailable:", (err as Error).message);
    }
  }

  const run = await runAssistant({
    messages,
    signedIn: Boolean(userId),
    abortSignal: req.signal,
    onFinish: async (text) => {
      if (sb && conversationId) {
        await saveMessages(sb, conversationId, [
          { role: "user", content: lastUserText(messages) },
          { role: "assistant", content: text, citations: run.kind === "stream" ? run.citations : null, model: cfg.chatModel },
        ]);
      }
    },
  });

  if (run.kind === "blocked") {
    // Reply in the same stream protocol so every client renders it like a normal answer.
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start", messageMetadata: { blocked: run.verdict.reason, conversationId } });
        writer.write({ type: "text-start", id: "guard" });
        writer.write({ type: "text-delta", id: "guard", delta: run.verdict.message });
        writer.write({ type: "text-end", id: "guard" });
        writer.write({ type: "finish" });
      },
    });
    return createUIMessageStreamResponse({ stream, headers: { ...cors, ...rlHeaders } });
  }

  return run.result.toUIMessageStreamResponse({
    headers: { ...cors, ...rlHeaders },
    originalMessages: messages,
    // Never stream model reasoning to clients: it can echo the system prompt or retrieved context verbatim.
    sendReasoning: false,
    sendSources: false,
    messageMetadata: ({ part }) =>
      part.type === "start"
        ? { citations: run.citations, conversationId, retrieval: run.retrievalMode }
        : part.type === "finish"
          ? { finishReason: part.finishReason }
          : undefined,
    onError: (error) => {
      console.error("[ai] stream error:", error);
      return "Sorry — the assistant is having trouble right now. Please try again in a moment.";
    },
  });
}
