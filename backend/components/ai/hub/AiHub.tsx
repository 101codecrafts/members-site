"use client";

import { useChat } from "@ai-sdk/react";
import { useAuth } from "@clerk/nextjs";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import s from "../ai.module.css";
import h from "./hub.module.css";
import { Markdown } from "../Markdown";

type Quota = { used: number; limit: number; remaining: number; plan: "free" | "pro"; promoActive: boolean; resetsAt: string; safeMode?: boolean };
type Model = { id: string; label: string; provider: string; note: string; code: boolean };
type Meta = { quota?: Quota; safeMode?: boolean; model?: string; blocked?: string };
type Mode = "chat" | "code" | "lesson" | "image";

const MODES: { id: Mode; label: string; hint: string; soon?: boolean }[] = [
  { id: "chat", label: "Chat", hint: "Ask anything about tech, coding or your studies." },
  { id: "code", label: "Code helper", hint: "Paste code: get explanations, bug fixes and hints." },
  { id: "lesson", label: "Explain this lesson", hint: "Paste lesson notes and get a simple explanation + quiz." },
  { id: "image", label: "Image → text", hint: "Read text and code from screenshots.", soon: true },
];

/** Endpoint is configurable so the hub can point at the backend's /api/v1/ai/chat when it lands. */
const CHAT_API = process.env.NEXT_PUBLIC_AI_HUB_CHAT_ENDPOINT || "/api/ai/chat";

export function quotaText(q: Quota) {
  return `${q.used} of ${q.limit} ${q.plan === "pro" ? "Pro" : "free"} messages today`;
}

export function AiHub() {
  const { isSignedIn, isLoaded } = useAuth();
  const [mode, setMode] = useState<Mode>("chat");
  const [models, setModels] = useState<Model[]>([]);
  const [modelId, setModelId] = useState<string>("");
  const [quota, setQuota] = useState<Quota | null>(null);
  const [lesson, setLesson] = useState("");
  const [input, setInput] = useState("");
  const [limitMsg, setLimitMsg] = useState<string | null>(null);

  const bodyRef = useRef({ mode: "chat" as Mode, modelId: "", lesson: "" });
  bodyRef.current = { mode, modelId, lesson };
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage<Meta>>({
        api: CHAT_API,
        body: () => ({
          mode: bodyRef.current.mode === "image" ? "chat" : bodyRef.current.mode,
          modelId: bodyRef.current.modelId || undefined,
          lesson: bodyRef.current.mode === "lesson" ? bodyRef.current.lesson : undefined,
        }),
        fetch: async (url, init) => {
          const res = await fetch(url, init);
          if (res.status === 429) {
            const j = (await res.clone().json().catch(() => ({}))) as { message?: string; quota?: Quota };
            if (j.quota) setQuota(j.quota);
            setLimitMsg(j.message ?? "Daily limit reached.");
          }
          return res;
        },
      }),
    [],
  );
  const { messages, sendMessage, status, stop, error, setMessages } = useChat<UIMessage<Meta>>({ transport });
  const busy = status === "submitted" || status === "streaming";
  const logRef = useRef<HTMLDivElement>(null);

  const refreshQuota = useCallback(async () => {
    const r = await fetch("/api/ai/quota");
    if (r.ok) setQuota((await r.json()) as Quota);
  }, []);

  useEffect(() => {
    void fetch("/api/ai/models")
      .then((r) => r.json())
      .then((j: { models: Model[] }) => setModels(j.models ?? []));
  }, []);
  useEffect(() => {
    if (isSignedIn) void refreshQuota();
  }, [isSignedIn, refreshQuota]);
  useEffect(() => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (last?.metadata?.quota) setQuota((q) => ({ ...last.metadata!.quota!, safeMode: last.metadata!.safeMode ?? q?.safeMode }));
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = input.trim() || (mode === "lesson" && lesson.trim() ? "Explain this lesson." : "");
    if (!t || busy || mode === "image") return;
    setLimitMsg(null);
    setInput("");
    void sendMessage({ text: t });
  };

  const current = MODES.find((m) => m.id === mode)!;
  const pct = quota ? Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100)) : 0;

  if (isLoaded && !isSignedIn) {
    return (
      <div className={s.root}>
        <main className={s.page}>
          <div className={h.gate}>
            <span className={s.kicker}>Members only</span>
            <h1 className={s.title}>
              101 <em>AI</em>
            </h1>
            <p className={s.sub}>Free AI for 101 Codecrafts members: chat, code helper and lesson explainer. Sign in to start.</p>
            <a className={s.btn} href="/sign-in?redirect_url=/ai" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              Sign in to use 101 AI
            </a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <main className={s.page}>
        <header className={s.hero}>
          <div>
            <span className={s.kicker}>Free for members</span>
            <h1 className={s.title}>
              101 <em>AI</em>
            </h1>
            <p className={s.sub}>Free AI models, one place. Your keys never leave our server — just pick a model and learn.</p>
          </div>
          {quota && (
            <div className={h.quota} aria-live="polite">
              <div className={h.quotaTop}>
                <b>{quotaText(quota)}</b>
                {quota.plan === "pro" && <span className={h.pro}>{quota.promoActive ? "Launch month · Pro for all" : "101 Pro"}</span>}
              </div>
              <div className={h.bar} role="progressbar" aria-valuemin={0} aria-valuemax={quota.limit} aria-valuenow={quota.used} aria-label="Messages used today">
                <i style={{ width: `${pct}%` }} />
              </div>
              <small>
                Resets at midnight (Kampala){quota.plan === "free" ? " · Upgrade to 101 Pro for more" : ""}
                {quota.safeMode ? " · Safe mode on" : ""}
              </small>
            </div>
          )}
        </header>

        <div className={h.layout}>
          <nav className={h.modes} aria-label="AI tools">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`${h.mode} ${mode === m.id ? h.modeOn : ""}`}
                aria-pressed={mode === m.id}
                disabled={m.soon}
                onClick={() => setMode(m.id)}
              >
                <b>{m.label}</b>
                <span>{m.soon ? "Coming soon" : m.hint}</span>
              </button>
            ))}
            <label className={h.lbl} htmlFor="model">
              Model
            </label>
            <select id="model" className={h.select} value={modelId} onChange={(e) => setModelId(e.target.value)}>
              <option value="">Auto (best available, with fallback)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.provider}
                </option>
              ))}
            </select>
            {modelId && <p className={h.note}>{models.find((m) => m.id === modelId)?.note}</p>}
            {models.length === 0 && <p className={h.note}>No AI providers configured yet.</p>}
          </nav>

          <section className={`${s.panel} ${s.chat}`} aria-label={current.label}>
            <div className={s.panelHead}>
              <h2>
                <span className={s.dot} aria-hidden />
                {current.label}
              </h2>
              <button type="button" className={`${s.btn} ${s.btnGhost}`} style={{ minHeight: 30, padding: "0 10px", fontSize: 12 }} onClick={() => setMessages([])}>
                New chat
              </button>
            </div>
            {mode === "lesson" && (
              <div className={h.lesson}>
                <label htmlFor="lesson" className={h.lbl}>
                  Lesson notes (paste up to ~12,000 characters)
                </label>
                <textarea id="lesson" className={h.lessonBox} maxLength={12000} value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="Paste the lesson text here…" />
              </div>
            )}
            {mode === "image" ? (
              <div className={h.soon}>Image → text is coming soon: upload a screenshot of code or notes and 101 AI will transcribe and explain it.</div>
            ) : (
              <div className={s.log} ref={logRef} role="log" aria-live="polite">
                {messages.length === 0 && <div className={`${s.msg} ${s.bot}`}>{current.hint}</div>}
                {messages.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className={`${s.msg} ${s.user}`}>
                      {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                    </div>
                  ) : (
                    <div key={m.id} className={`${s.msg} ${s.bot}`}>
                      <Markdown text={m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")} />
                      {m.metadata?.model && <div className={h.modelTag}>{models.find((x) => x.id === m.metadata!.model)?.label ?? m.metadata.model}</div>}
                    </div>
                  ),
                )}
                {status === "submitted" && (
                  <div className={`${s.msg} ${s.bot}`}>
                    <span className={s.typing}>
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                )}
              </div>
            )}
            {(limitMsg || error) && (
              <div className={s.error} role="alert">
                {limitMsg ?? "Something went wrong. Please try again."}
              </div>
            )}
            <form className={s.composer} onSubmit={submit}>
              <label htmlFor="hub-input" className={s.srOnly}>
                Message 101 AI
              </label>
              <textarea
                id="hub-input"
                className={s.input}
                rows={mode === "code" ? 4 : 1}
                maxLength={4000}
                disabled={mode === "image"}
                placeholder={mode === "code" ? "Paste code and say what you need…" : mode === "lesson" ? "Ask about the lesson (or just press Send)" : "Ask 101 AI…"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && mode !== "code") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              {busy ? (
                <button type="button" className={`${s.btn} ${s.btnCyan}`} onClick={() => void stop()}>
                  Stop
                </button>
              ) : (
                <button type="submit" className={s.btn} disabled={mode === "image" || (quota !== null && quota.remaining <= 0)}>
                  Send
                </button>
              )}
            </form>
            <p className={s.note}>AI can make mistakes. Don't paste passwords, keys or personal details.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
