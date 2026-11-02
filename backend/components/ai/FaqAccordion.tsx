"use client";

import { useEffect, useMemo, useState } from "react";
import { faqToDocs, lexicalSearch } from "../../lib/ai/retrieval";
import type { FaqItem } from "../../lib/ai/faq";
import { displayAnswer } from "../../lib/ai/faq";
import s from "./ai.module.css";

/** Searchable FAQ accordion. Items come from content/faq.md (parsed on the server). */
export function FaqAccordion({ items, onAsk }: { items: FaqItem[]; onAsk?: (question: string) => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const docs = useMemo(() => faqToDocs(items), [items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);

  useEffect(() => {
    const id = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (id && items.some((i) => i.id === id)) {
      setOpen(id);
      requestAnimationFrame(() => document.getElementById(`faq-${id}`)?.scrollIntoView({ block: "center" }));
    }
  }, [items]);

  const visible = useMemo(() => {
    let list = items;
    if (query.trim()) {
      const ids = lexicalSearch(query, docs, 50).map((d) => d.id.replace(/^faq:/, ""));
      list = ids.map((id) => items.find((i) => i.id === id)!).filter(Boolean);
    }
    return cat ? list.filter((i) => i.category === cat) : list;
  }, [items, docs, query, cat]);

  return (
    <div className={s.faq}>
      <label htmlFor="faq-search" className={s.srOnly}>
        Search FAQs
      </label>
      <input
        id="faq-search"
        className={s.search}
        type="search"
        placeholder="Search FAQs — e.g. mobile money, certificates"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className={s.cats} role="group" aria-label="Filter by category">
        <button type="button" className={`${s.cat} ${cat === null ? s.catOn : ""}`} onClick={() => setCat(null)} aria-pressed={cat === null}>
          All
        </button>
        {categories.map((c) => (
          <button key={c} type="button" className={`${s.cat} ${cat === c ? s.catOn : ""}`} onClick={() => setCat(c)} aria-pressed={cat === c}>
            {c}
          </button>
        ))}
      </div>
      {visible.length === 0 && (
        <p className={s.empty}>
          No FAQ matches “{query}”.{" "}
          {onAsk && (
            <button type="button" className={s.askLink} onClick={() => onAsk(query)}>
              Ask the assistant instead →
            </button>
          )}
        </p>
      )}
      {visible.map((f) => {
        const isOpen = open === f.id;
        return (
          <div key={f.id} id={`faq-${f.id}`} className={s.qItem}>
            <h3 style={{ margin: 0 }}>
              <button
                type="button"
                className={s.qBtn}
                aria-expanded={isOpen}
                aria-controls={`faq-a-${f.id}`}
                onClick={() => {
                  setOpen(isOpen ? null : f.id);
                  if (!isOpen) history.replaceState(null, "", `#${f.id}`);
                }}
              >
                <span>{f.question}</span>
                <span className={s.plus} aria-hidden>
                  {isOpen ? "–" : "+"}
                </span>
              </button>
            </h3>
            {isOpen && (
              <div id={`faq-a-${f.id}`} className={s.answer} role="region">
                {displayAnswer(f.answer)}
                <div>
                  {f.needsConfirmation && <span className={s.badge}>Details being confirmed</span>}
                  {onAsk && (
                    <button type="button" className={s.askLink} onClick={() => onAsk(f.question)}>
                      Ask a follow-up →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
