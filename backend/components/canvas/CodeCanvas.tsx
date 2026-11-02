"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import s from "./canvas.module.css";
import { PLAYGROUND_PRESETS, PLAYGROUND_SRCDOC } from "./playground-runtime";

type Line = { level: string; text: string };

/** Generative-art / code canvas playground for learners (plain Canvas 2D, sandboxed). */
export function CodeCanvas() {
  const [preset, setPreset] = useState("orbits");
  const [code, setCode] = useState(PLAYGROUND_PRESETS.orbits!.code);
  const [logs, setLogs] = useState<Line[]>([]);
  const [ready, setReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  // Mount the sandbox only on the client, after the message listener exists (an SSR'd iframe
  // can finish loading before hydration and its "ready" message would be lost).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const post = useCallback((msg: unknown) => frame.current?.contentWindow?.postMessage(msg, "*"), []);
  const run = useCallback(() => {
    setLogs([]);
    post({ type: "run", code });
  }, [code, post]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return; // only our sandbox
      const d = e.data as { __101play?: boolean; type?: string; data?: { level?: string; text?: string; url?: string } };
      if (!d?.__101play) return;
      // "ready" can fire before this listener attaches, so the iframe onLoad also marks it ready.
      if (d.type === "ready") setReady(true);
      if (d.type === "console" && d.data?.text) setLogs((l) => [...l.slice(-49), { level: d.data!.level ?? "log", text: d.data!.text!.slice(0, 500) }]);
      if (d.type === "export" && typeof d.data?.url === "string" && d.data.url.startsWith("data:image/png;base64,")) {
        const a = document.createElement("a");
        a.href = d.data.url;
        a.download = "101-code-canvas.png";
        a.click();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (ready) run();
    // run once when the sandbox is ready
  }, [ready]);

  const askAi = () => {
    const q = `Explain this canvas code for a beginner and suggest one creative change:\n\`\`\`javascript\n${code.slice(0, 3000)}\n\`\`\``;
    window.location.href = `/assistant?q=${encodeURIComponent(q)}`;
  };

  return (
    <main className={s.play}>
      <div className={s.bar}>
        <a href="/whiteboard" className={s.brand}>
          101<span>/</span>canvas
        </a>
        <strong className={s.boardTitle}>Code canvas playground</strong>
        <div className={s.actions}>
          <select
            className={s.select}
            value={preset}
            aria-label="Example"
            onChange={(e) => {
              setPreset(e.target.value);
              setCode(PLAYGROUND_PRESETS[e.target.value]!.code);
            }}
          >
            {Object.entries(PLAYGROUND_PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}
              </option>
            ))}
          </select>
          <button type="button" className={s.btn} onClick={run} disabled={!ready}>
            ▶ Run
          </button>
          <button type="button" className={s.btnSm} onClick={() => post({ type: "stop" })}>
            Stop
          </button>
          <button type="button" className={s.btnSm} onClick={() => post({ type: "export" })}>
            PNG
          </button>
          <button type="button" className={`${s.btn} ${s.btnCyan}`} onClick={askAi}>
            ✦ Explain with AI
          </button>
        </div>
      </div>
      <div className={s.playGrid}>
        <div>
          <label htmlFor="code" className={s.lbl}>
            JavaScript (Canvas 2D) — Ctrl/⌘+Enter to run
          </label>
          <textarea
            id="code"
            className={s.editor}
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                run();
              }
              if (e.key === "Tab") {
                e.preventDefault();
                const t = e.currentTarget;
                const { selectionStart: a, selectionEnd: b } = t;
                setCode(code.slice(0, a) + "  " + code.slice(b));
                requestAnimationFrame(() => t.setSelectionRange(a + 2, a + 2));
              }
            }}
          />
        </div>
        <div>
          {mounted ? (
            <iframe ref={frame} title="Canvas output" className={s.frame} sandbox="allow-scripts" srcDoc={PLAYGROUND_SRCDOC} onLoad={() => setReady(true)} />
          ) : (
            <div className={s.frame} aria-hidden />
          )}
          <div className={s.console} aria-live="polite" aria-label="Console output">
            {logs.length === 0 ? "Console output appears here." : logs.map((l, i) => <div key={i} style={{ color: l.level === "error" ? "#ffb3b3" : undefined }}>{l.text}</div>)}
          </div>
        </div>
      </div>
    </main>
  );
}
