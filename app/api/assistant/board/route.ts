import { generateText } from "ai";
import { boardRequestSchema, describeBoard } from "../../../../lib/ai/board";
import { loadAiConfig } from "../../../../lib/ai/config";
import { checkUserMessage, fenceUntrusted } from "../../../../lib/ai/guardrails";
import { clientIp, corsHeaders, currentUser, isForeignOrigin, json } from "../../../../lib/ai/http";
import { chatModel, fallbackProviderOptions } from "../../../../lib/ai/models";
import { boardPrompt } from "../../../../lib/ai/prompt";
import { anonKey, supabaseStore, userKey, withFallback } from "../../../../lib/ai/rate-limit";
import { serviceClient } from "../../../../lib/ai/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

/** POST /api/assistant/board — explain a whiteboard or turn it into a plan. */
export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  if (isForeignOrigin(req)) return json({ error: "Origin not allowed" }, 403, cors);
  const raw = await req.text();
  if (raw.length > 2_500_000) return json({ error: "Board too large" }, 413, cors);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }
  const parsed = boardRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid request", issues: parsed.error.issues.slice(0, 5) }, 400, cors);

  const cfg = loadAiConfig();
  const { userId } = await currentUser();
  const svc = serviceClient();
  const rl = await withFallback(svc ? supabaseStore(svc) : null)(
    userId ? userKey(userId) : anonKey(clientIp(req)),
    userId ? cfg.rateLimit.user : cfg.rateLimit.anon,
    cfg.rateLimit.windowSeconds,
  );
  if (!rl.allowed) return json({ error: "rate_limited", message: "Too many requests — try again in a few minutes." }, 429, cors);

  const boardText = describeBoard(parsed.data.elements);
  const question = parsed.data.question ?? "";
  const verdict = checkUserMessage(`${question}\n${boardText}`.slice(0, 3900) || "board");
  if (verdict.action === "block" && verdict.reason !== "empty" && verdict.reason !== "too_long") {
    return json({ text: verdict.message, blocked: verdict.reason }, 200, cors);
  }

  const userText = [
    question ? `User question: ${question.slice(0, 500)}` : "",
    "Whiteboard contents (structured from the drawing):",
    fenceUntrusted("whiteboard", boardText),
  ]
    .filter(Boolean)
    .join("\n\n");

  const useVision = Boolean(parsed.data.imageDataUrl);
  try {
    const result = await generateText({
      model: chatModel(useVision ? cfg.visionModel : cfg.chatModel),
      system: boardPrompt(parsed.data.mode),
      messages: [
        {
          role: "user",
          content: useVision
            ? [
                { type: "text", text: userText },
                { type: "image", image: parsed.data.imageDataUrl! },
              ]
            : userText,
        },
      ],
      maxOutputTokens: Math.min(cfg.maxOutputTokens, 1200),
      temperature: 0.4,
      providerOptions: useVision ? {} : fallbackProviderOptions(cfg),
      abortSignal: req.signal,
    });
    return json({ text: result.text, model: useVision ? cfg.visionModel : cfg.chatModel, boardSummary: boardText }, 200, cors);
  } catch (err) {
    console.error("[ai] board:", (err as Error).message);
    return json({ error: "The assistant could not analyse this board right now. Please try again." }, 502, cors);
  }
}
