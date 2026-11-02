import { z } from "zod";
import { displayAnswer } from "../../../lib/ai/faq";
import { corsHeaders, json } from "../../../lib/ai/http";
import { loadFaqs } from "../../../lib/ai/knowledge";
import { searchFaqs } from "../../../lib/ai/retrieval";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin"), { public: true }) });
}

const query = z.object({ q: z.string().trim().max(200).optional(), category: z.string().trim().max(80).optional() });

/** GET /api/faq?q=payment&category=Payments — public, cacheable FAQ data. */
export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"), { public: true });
  const sp = new URL(req.url).searchParams;
  const parsed = query.safeParse({ q: sp.get("q") ?? undefined, category: sp.get("category") ?? undefined });
  if (!parsed.success) return json({ error: "Invalid query" }, 400, cors);
  let items = searchFaqs(parsed.data.q ?? "", loadFaqs(), 50);
  if (parsed.data.category) items = items.filter((f) => f.category.toLowerCase() === parsed.data.category!.toLowerCase());
  return json(
    {
      items: items.map((f) => ({
        id: f.id,
        category: f.category,
        question: f.question,
        answer: displayAnswer(f.answer),
        tags: f.tags,
        beingConfirmed: f.needsConfirmation,
      })),
    },
    200,
    { ...cors, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
  );
}
