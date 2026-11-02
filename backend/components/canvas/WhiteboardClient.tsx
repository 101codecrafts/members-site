"use client";

import dynamic from "next/dynamic";
import s from "./canvas.module.css";

/** Excalidraw touches window/document, so it is loaded client-side only. */
const Whiteboard = dynamic(() => import("./Whiteboard"), {
  ssr: false,
  loading: () => <div className={s.center}>Loading whiteboard…</div>,
});

export function WhiteboardClient({ boardId, title }: { boardId: string | null; title?: string }) {
  return <Whiteboard boardId={boardId} title={title} />;
}
