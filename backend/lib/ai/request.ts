import type { UIMessage } from "ai";
import { z } from "zod";

/**
 * Incoming chat request. Accepts both shapes:
 *  - AI SDK UI messages from useChat ({ id, role, parts: [{ type: "text", text }] })
 *  - simple messages from the static widget ({ role, content })
 * Only user/assistant TEXT is kept: client-supplied tool results, system
 * messages, files, etc. are dropped so they cannot be used for injection.
 */
const textPart = z.object({ type: z.literal("text"), text: z.string().max(20_000) });
const anyPart = z.object({ type: z.string() }).passthrough();

const uiMessage = z.object({
  id: z.string().max(100).optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(anyPart).max(50),
});
const simpleMessage = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(20_000),
});

export const chatRequestSchema = z.object({
  id: z.string().max(100).optional(),
  conversationId: z.string().uuid().optional(),
  messages: z.array(z.union([uiMessage, simpleMessage])).min(1).max(60),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const MAX_HISTORY_MESSAGES = 16;

export function normalizeMessages(input: ChatRequest["messages"]): UIMessage[] {
  const out: UIMessage[] = [];
  input.forEach((m, i) => {
    if (m.role === "system") return;
    const text =
      "content" in m
        ? m.content
        : m.parts
            .map((p) => {
              const r = textPart.safeParse(p);
              return r.success ? r.data.text : "";
            })
            .join("");
    if (!text.trim()) return;
    out.push({ id: ("id" in m && m.id) || `m${i}`, role: m.role, parts: [{ type: "text", text }] });
  });
  return out.slice(-MAX_HISTORY_MESSAGES);
}

export function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "user") return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  }
  return "";
}
