import { conversationIdSchema, deleteConversation, listConversations, loadMessages } from "../../../../lib/ai/history";
import { corsHeaders, currentUser, json } from "../../../../lib/ai/http";
import { userClient } from "../../../../lib/ai/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

/** GET /api/assistant/history            → your conversations
 *  GET /api/assistant/history?id=<uuid>   → messages of one conversation */
export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  const { userId, getToken } = await currentUser();
  if (!userId) return json({ error: "Sign in to see your chat history" }, 401, cors);
  const sb = userClient(getToken);
  if (!sb) return json({ conversations: [] }, 200, cors);
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (id) {
      const parsed = conversationIdSchema.safeParse(id);
      if (!parsed.success) return json({ error: "Invalid id" }, 400, cors);
      return json({ messages: await loadMessages(sb, parsed.data) }, 200, cors);
    }
    return json({ conversations: await listConversations(sb) }, 200, cors);
  } catch (err) {
    console.error("[ai] history:", (err as Error).message);
    return json({ error: "Could not load history" }, 500, cors);
  }
}

/** DELETE /api/assistant/history?id=<uuid> → delete one of your conversations (RLS enforces ownership). */
export async function DELETE(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  const { userId, getToken } = await currentUser();
  if (!userId) return json({ error: "Unauthorized" }, 401, cors);
  const parsed = conversationIdSchema.safeParse(new URL(req.url).searchParams.get("id"));
  if (!parsed.success) return json({ error: "Invalid id" }, 400, cors);
  const sb = userClient(getToken);
  if (!sb) return json({ ok: true }, 200, cors);
  try {
    await deleteConversation(sb, parsed.data);
    return json({ ok: true }, 200, cors);
  } catch (err) {
    console.error("[ai] delete history:", (err as Error).message);
    return json({ error: "Could not delete" }, 500, cors);
  }
}
