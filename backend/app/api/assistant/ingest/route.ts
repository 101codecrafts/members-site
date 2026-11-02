import { json, safeEqual } from "../../../../lib/ai/http";
import { ingestCorpus } from "../../../../lib/ai/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/assistant/ingest  (header: x-ingest-secret: $AI_INGEST_SECRET)
 * Re-embeds content/faq.md + site content into public.ai_documents.
 * Run after every FAQ/content change (e.g. from a deploy hook or GitHub Action).
 */
export async function POST(req: Request) {
  const secret = process.env.AI_INGEST_SECRET;
  const given = req.headers.get("x-ingest-secret") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(given, secret)) return json({ error: "Unauthorized" }, 401);
  try {
    return json({ ok: true, ...(await ingestCorpus()) });
  } catch (err) {
    console.error("[ai] ingest:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
}
