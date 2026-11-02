"use client";

import { useEffect, useState } from "react";
import type { FaqItem } from "../../lib/ai/faq";
import s from "./ai.module.css";
import { ChatPanel } from "./ChatPanel";
import { FaqAccordion } from "./FaqAccordion";

/** /assistant: chat on the left, searchable FAQ on the right; FAQ items can be sent to the chat. */
export function AssistantWorkspace({ faqs }: { faqs: FaqItem[] }) {
  const [ask, setAsk] = useState<{ text: string; nonce: number } | undefined>();
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setAsk({ text: q.slice(0, 500), nonce: Date.now() });
  }, []);
  return (
    <div className={s.root}>
      <main className={s.page}>
        <header className={s.hero}>
          <div>
            <span className={s.kicker}>AI · Grounded in our FAQ</span>
            <h1 className={s.title}>
              101 <em>Assistant</em>
            </h1>
            <p className={s.sub}>Answers about joining, paths, courses, events and payments — with sources. Paste code and it explains it line by line.</p>
          </div>
          <a className={`${s.btn} ${s.btnCyan}`} href="/whiteboard" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Open whiteboard →
          </a>
        </header>
        <div className={s.wrap}>
          <ChatPanel ask={ask} />
          <aside className={s.side}>
            <section className={s.panel} style={{ maxHeight: "78dvh" }} aria-label="Frequently asked questions">
              <div className={s.panelHead}>
                <h2>FAQ</h2>
                <a href="/assistant/faq" style={{ color: "#fff", fontSize: 12 }}>
                  Full page
                </a>
              </div>
              <FaqAccordion items={faqs} onAsk={(text) => setAsk({ text, nonce: Date.now() })} />
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
