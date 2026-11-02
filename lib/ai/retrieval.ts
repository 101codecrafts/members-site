import type { FaqItem } from "./faq";
import { displayAnswer } from "./faq";

/** A unit of grounding text. Mirrors a row of public.ai_documents. */
export type KnowledgeDoc = {
  /** Stable id, e.g. "faq:how-much-does-it-cost-to-join" or "course:se-101#0". */
  id: string;
  source: string;
  title: string;
  url: string;
  content: string;
  /** True when the text contains facts the founders still must confirm. */
  needsConfirmation: boolean;
};

export type RetrievedDoc = KnowledgeDoc & { score: number };

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from how i if in into is it its me my of on or our so that the their them there this to us was we what when where which who why will with you your about have has get".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(" ")
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/** Tiny suffix stemmer — enough for "payments"→"payment", "learning"→"learn". */
function stem(t: string): string {
  if (t.length > 5 && t.endsWith("ing")) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) return t.slice(0, -1);
  return t;
}

/** Split long text into overlapping chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, maxChars = 900, overlapChars = 120): string[] {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];
  const sentences = clean.split(/(?<=[.!?])\s+|\n{2,}/);
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length > maxChars && buf) {
      chunks.push(buf.trim());
      buf = buf.slice(Math.max(0, buf.length - overlapChars));
    }
    if (s.length > maxChars) {
      for (let i = 0; i < s.length; i += maxChars - overlapChars) chunks.push(s.slice(i, i + maxChars).trim());
      buf = "";
    } else {
      buf = `${buf} ${s}`;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.filter(Boolean);
}

export function faqToDocs(faqs: FaqItem[]): KnowledgeDoc[] {
  return faqs.map((f) => ({
    id: `faq:${f.id}`,
    source: "faq",
    title: f.question,
    url: `/assistant/faq#${f.id}`,
    // Keep the TODO-CONFIRM marker in the grounding text so the model can flag it.
    content: `Q: ${f.question}\nA: ${f.answer}${f.tags.length ? `\nTags: ${f.tags.join(", ")}` : ""}`,
    needsConfirmation: f.needsConfirmation,
  }));
}

export function siteDocsToDocs(docs: { source: string; title: string; url: string; content: string }[]): KnowledgeDoc[] {
  return docs.flatMap((d) =>
    chunkText(d.content).map((content, i) => ({
      id: `${d.source}#${i}`,
      source: d.source,
      title: d.title,
      url: d.url,
      content,
      needsConfirmation: /TODO-CONFIRM|draft outline/.test(content),
    })),
  );
}

/**
 * BM25 lexical ranking over an in-memory corpus. Used (1) when Supabase/pgvector
 * is not configured, and (2) fused with vector results (hybrid search) because
 * exact keywords such as "Flutterwave" or "CCNA" matter.
 */
export function lexicalSearch(query: string, corpus: KnowledgeDoc[], k = 5, k1 = 1.4, b = 0.75): RetrievedDoc[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !corpus.length) return [];
  const docsTokens = corpus.map((d) => tokenize(`${d.title} ${d.title} ${d.content}`));
  const avgLen = docsTokens.reduce((a, t) => a + t.length, 0) / docsTokens.length;
  const df = new Map<string, number>();
  for (const toks of docsTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  const N = corpus.length;
  const scored = corpus.map((doc, i) => {
    const toks = docsTokens[i]!;
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const term of q) {
      const f = tf.get(term) ?? 0;
      if (!f) continue;
      const n = df.get(term) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks.length) / avgLen));
    }
    return { ...doc, score };
  });
  return scored
    .filter((d) => d.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, k);
}

/** Reciprocal-rank fusion of several ranked lists (vector + lexical). */
export function reciprocalRankFusion(lists: RetrievedDoc[][], k = 5, c = 60): RetrievedDoc[] {
  const acc = new Map<string, RetrievedDoc>();
  for (const list of lists) {
    list.forEach((doc, rank) => {
      const prev = acc.get(doc.id);
      const add = 1 / (c + rank + 1);
      acc.set(doc.id, prev ? { ...prev, score: prev.score + add } : { ...doc, score: add });
    });
  }
  return [...acc.values()].sort((a, b) => b.score - a.score).slice(0, k);
}

/**
 * Render retrieved docs for the system prompt. Retrieved text is DATA, never
 * instructions: it is fenced, numbered for citations, and stripped of anything
 * that looks like a role/instruction marker.
 */
export function formatContext(docs: RetrievedDoc[]): string {
  if (!docs.length) return "<knowledge>\n(no matching documents)\n</knowledge>";
  const body = docs
    .map((d, i) => {
      const text = neutralize(d.content);
      return `[${i + 1}] title="${neutralize(d.title)}" url="${d.url}"${d.needsConfirmation ? " status=\"contains TODO-CONFIRM details\"" : ""}\n${text}`;
    })
    .join("\n\n");
  return `<knowledge>\n${body}\n</knowledge>`;
}

function neutralize(s: string): string {
  return s
    .replace(/<\/?(knowledge|system|assistant|user|instructions?)[^>]*>/gi, "")
    .replace(/^(system|assistant|developer)\s*:/gim, "$1 -")
    .slice(0, 2000);
}

/** Citation list the UI can render under an answer. */
export function toCitations(docs: RetrievedDoc[]): { n: number; title: string; url: string }[] {
  return docs.map((d, i) => ({ n: i + 1, title: d.title, url: d.url }));
}

/** Public FAQ search used by /api/faq and the accordion. */
export function searchFaqs(query: string, faqs: FaqItem[], limit = 10): FaqItem[] {
  const q = query.trim();
  if (!q) return faqs;
  const hits = lexicalSearch(q, faqToDocs(faqs), limit);
  const byId = new Map(faqs.map((f) => [`faq:${f.id}`, f]));
  return hits.map((h) => byId.get(h.id)!).filter(Boolean);
}

export { displayAnswer };
