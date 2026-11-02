import type { Metadata } from "next";
import { FaqAccordion } from "../../../components/ai/FaqAccordion";
import s from "../../../components/ai/ai.module.css";
import { displayAnswer } from "../../../lib/ai/faq";
import { loadFaqs } from "../../../lib/ai/knowledge";

export const metadata: Metadata = {
  title: "FAQ · 101 Codecrafts",
  description: "Answers to common questions about 101 Codecrafts: joining, cost, learning paths, events, certificates, payments and privacy.",
};

export default function FaqPage() {
  const faqs = loadFaqs();
  // FAQPage structured data for search engines (confirmed answers only).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs
      .filter((f) => !f.needsConfirmation)
      .map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: displayAnswer(f.answer) } })),
  };
  return (
    <div className={s.root}>
      <main className={s.page}>
        <header className={s.hero}>
          <div>
            <span className={s.kicker}>Help centre</span>
            <h1 className={s.title}>
              Frequently asked <em>questions</em>
            </h1>
            <p className={s.sub}>Can't find it? Ask the 101 Assistant — it answers from these FAQs and cites them.</p>
          </div>
          <a className={s.btn} href="/assistant" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Ask the assistant →
          </a>
        </header>
        <section className={s.panel} style={{ maxWidth: 900, margin: "0 auto" }}>
          <FaqAccordion items={faqs} />
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      </main>
    </div>
  );
}
