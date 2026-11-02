import { publicModels } from "../../../../lib/ai/hub/catalog";
import { hubModels } from "../../../../lib/ai/hub/context";
import { json } from "../../../../lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai/models — the free models currently available (ids + labels only; no keys). */
export async function GET() {
  return json({ models: publicModels(hubModels()) });
}
