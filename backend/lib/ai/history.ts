import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UIMessage } from "ai";
import { z } from "zod";

/**
 * Conversation history, stored per member in public.ai_conversations /
 * public.ai_messages. Every call uses the member's own RLS-scoped client, so a
 * user can only ever read/write their own rows (user_id defaults to the JWT sub).
 */

export const conversationIdSchema = z.string().uuid();

export async function ensureConversation(sb: SupabaseClient, id: string | undefined, firstMessage: string): Promise<string> {
  if (id) {
    const { data, error } = await sb.from("ai_conversations").select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return id;
  }
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 80) || "New chat";
  const { data, error } = await sb.from("ai_conversations").insert({ title }).select("id").single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export function textOf(message: Pick<UIMessage, "parts">): string {
  return message.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();
}

export async function saveMessages(
  sb: SupabaseClient,
  conversationId: string,
  messages: { role: "user" | "assistant"; content: string; parts?: unknown; citations?: unknown; model?: string }[],
): Promise<void> {
  const rows = messages
    .filter((m) => m.content.trim())
    .map((m) => ({
      conversation_id: conversationId,
      role: m.role,
      content: m.content.slice(0, 20_000),
      parts: m.parts ?? null,
      citations: m.citations ?? null,
      model: m.model ?? null,
    }));
  if (!rows.length) return;
  const { error } = await sb.from("ai_messages").insert(rows);
  if (error) throw new Error(error.message);
  await sb.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

export async function listConversations(sb: SupabaseClient) {
  const { data, error } = await sb
    .from("ai_conversations")
    .select("id,title,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadMessages(sb: SupabaseClient, conversationId: string) {
  const { data, error } = await sb
    .from("ai_messages")
    .select("id,role,content,citations,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function deleteConversation(sb: SupabaseClient, conversationId: string) {
  const { error } = await sb.from("ai_conversations").delete().eq("id", conversationId);
  if (error) throw new Error(error.message);
}
