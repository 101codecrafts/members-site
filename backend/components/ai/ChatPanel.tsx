"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import s from "./ai.module.css";
import { Markdown, usedCitations, type Citation } from "./Markdown";

type Meta = { citations?: Citation[]; conversationId?: string; blocked?: string };
export type AssistantMessage = UIMessage<Meta>;

const TOOL_LABELS: Record<string, string> = {
  "tool-searchKnowledge": "Searching the knowledge base…",
  "tool-searchCourses": "Searching courses…",
  "tool-listUpcomingEvents": "Checking upcoming events…",
  "tool-recommendLearningPath": "Matching you to a learning path…",
  "tool-explainCode": "Reading your code…",
  "tool-showHowToJoin": "Getting the joining steps…",
};

const SUGGESTIONS = [
  "How do I join 101 Codecrafts?",
  "Which learning path suits me?",
  "What events are coming up?",
  "How do I pay with mobile money?",
];

export function ChatPanel({ api = "/api/assistant", ask }: { api?: string; ask?: { text: string; nonce: number } }) {
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const convRef = useRef<string | undefined>(undefined);
  convRef.current = conversationId;
  const transport = useMemo(
    () => new DefaultChatTransport<AssistantMessage>({ api, body: () => ({ conversationId: convRef.current }) }),
    [api],
  );
  const { messages, sendMessage, status, stop, error, setMessages } = useChat<AssistantMessage>({ transport });
  const logRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (last?.metadata?.conversationId && last.metadata.conversationId !== conversationId) setConversationId(last.metadata.conversationId);
  }, [messages, conversationId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, status]);

  // External "ask" requests (FAQ "Ask a follow-up", ?q= deep links). Each nonce is sent once.
  const lastNonce = useRef<number | null>(null);
  useEffect(() => {
    if (ask && ask.text.trim() && ask.nonce !== lastNonce.current) {
      lastNonce.current = ask.nonce;
      void sendMessage({ text: ask.text.trim() });
    }
  }, [ask, sendMessage]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setInput("");
    void sendMessage({ text: t });
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <section className={`${s.panel} ${s.chat}`} aria-label="101 Assistant chat">
      <div className={s.panelHead}>
        <h2>
          <span className={s.dot} aria-hidden />
          101 Assistant
        </h2>
        <button
          type="button"
          className={`${s.btn} ${s.btnGhost}`}
          style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }}
          onClick={() => {
            setMessages([]);
            setConversationId(undefined);
          }}
        >
          New chat
        </button>
      </div>

      <div className={s.log} ref={logRef} role="log" aria-live="polite" aria-busy={busy}>
        {messages.length === 0 && (
          <div className={`${s.msg} ${s.bot}`}>
            <p>
              <strong>Hi! I'm the 101 Assistant.</strong> Ask me about joining, learning paths, courses, events, payments — or paste code and I'll explain it.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <MessageView key={m.id} m={m} />
        ))}
        {status === "submitted" && (
          <div className={`${s.msg} ${s.bot}`} aria-label="Assistant is typing">
            <span className={s.typing}>
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className={s.suggest}>
          {SUGGESTIONS.map((q) => (
            <button key={q} type="button" className={s.chip} onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className={s.error} role="alert">
          {/429|rate/i.test(error.message) ? "You've hit the chat limit for now — please try again in a few minutes." : "Something went wrong. Please try again."}
        </div>
      )}

      <form className={s.composer} onSubmit={onSubmit}>
        <label htmlFor="ai-input" className={s.srOnly}>
          Message the 101 Assistant
        </label>
        <textarea
          id="ai-input"
          className={s.input}
          rows={1}
          maxLength={4000}
          placeholder="Ask anything about 101 Codecrafts…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
        />
        {busy ? (
          <button type="button" className={`${s.btn} ${s.btnCyan}`} onClick={() => void stop()}>
            Stop
          </button>
        ) : (
          <button type="submit" className={s.btn} disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
      <p className={s.note}>AI can make mistakes — confirm prices and dates with the team. Don't share passwords or PINs.</p>
    </section>
  );
}

function MessageView({ m }: { m: AssistantMessage }) {
  if (m.role === "user") {
    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return <div className={`${s.msg} ${s.user}`}>{text}</div>;
  }
  const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const tools = m.parts.filter((p) => p.type.startsWith("tool-") && "state" in p && (p as { state: string }).state !== "output-available");
  const citations = usedCitations(text, m.metadata?.citations ?? []);
  return (
    <>
      {tools.map((p, i) => (
        <div key={i} className={s.tool}>
          {TOOL_LABELS[p.type] ?? "Working…"}
        </div>
      ))}
      {text && (
        <div className={`${s.msg} ${s.bot}`}>
          <Markdown text={text} citations={m.metadata?.citations ?? []} />
          {citations.length > 0 && (
            <div className={s.sources}>
              <b>Sources</b>
              {citations.map((c) => (
                <a key={c.n} href={c.url}>
                  [{c.n}] {c.title}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
