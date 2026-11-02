"use client";

import { exportToBlob } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useState } from "react";
import { Markdown } from "../ai/Markdown";
import s from "./canvas.module.css";

const MAX_IMAGE_BYTES = 1_400_000;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** "Ask AI about this board": sends element text (+ optional PNG) to /api/assistant/board. */
export function AskAiPanel({ api, onClose }: { api: ExcalidrawImperativeAPI; onClose: () => void }) {
  const [mode, setMode] = useState<"explain" | "plan">("explain");
  const [question, setQuestion] = useState("");
  const [withImage, setWithImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setErr(null);
    setAnswer(null);
    try {
      const elements = api.getSceneElements();
      if (!elements.length) throw new Error("The board is empty — draw something first.");
      let imageDataUrl: string | undefined;
      if (withImage) {
        const blob = await exportToBlob({
          elements,
          appState: { ...api.getAppState(), exportBackground: true },
          files: api.getFiles(),
          mimeType: "image/png",
          maxWidthOrHeight: 1280,
        });
        const url = await blobToDataUrl(blob);
        if (url.length <= MAX_IMAGE_BYTES) imageDataUrl = url;
      }
      const payload = {
        mode,
        question: question.trim() || undefined,
        imageDataUrl,
        elements: elements.slice(0, 2000).map((e) => ({
          id: e.id,
          type: e.type,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
          isDeleted: e.isDeleted,
          text: "text" in e ? String(e.text).slice(0, 2000) : undefined,
          containerId: "containerId" in e ? (e.containerId as string | null) : undefined,
          startBinding: "startBinding" in e && e.startBinding ? { elementId: e.startBinding.elementId } : null,
          endBinding: "endBinding" in e && e.endBinding ? { elementId: e.endBinding.elementId } : null,
        })),
      };
      const res = await fetch("/api/assistant/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json()) as { text?: string; error?: string; message?: string };
      if (!res.ok) throw new Error(data.message || data.error || "Request failed");
      setAnswer(data.text ?? "");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={s.ask} aria-label="Ask AI about this board">
      <div className={s.askHead}>
        <strong>✦ Ask AI about this board</strong>
        <button type="button" className={s.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className={s.askBody}>
        <div className={s.seg} role="radiogroup" aria-label="What should the AI do?">
          <button type="button" role="radio" aria-checked={mode === "explain"} className={mode === "explain" ? s.segOn : ""} onClick={() => setMode("explain")}>
            Explain sketch
          </button>
          <button type="button" role="radio" aria-checked={mode === "plan"} className={mode === "plan" ? s.segOn : ""} onClick={() => setMode("plan")}>
            Turn into a plan
          </button>
        </div>
        <label className={s.lbl} htmlFor="ask-q">
          Optional question
        </label>
        <input id="ask-q" className={s.field} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. what am I missing for the MVP?" />
        <label className={s.check}>
          <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} /> Include an image of the board (better for freehand drawings)
        </label>
        <button type="button" className={`${s.btn} ${s.btnFull}`} onClick={() => void run()} disabled={busy}>
          {busy ? "Thinking…" : mode === "explain" ? "Explain my board" : "Make me a plan"}
        </button>
        {err && (
          <p className={s.err} role="alert">
            {err}
          </p>
        )}
        {answer && (
          <div className={s.answer}>
            <Markdown text={answer} />
            <a className={s.link} href={`/assistant?q=${encodeURIComponent(`Follow-up on my whiteboard plan:\n${answer.slice(0, 400)}`)}`}>
              Continue in the assistant →
            </a>
          </div>
        )}
      </div>
    </aside>
  );
}
