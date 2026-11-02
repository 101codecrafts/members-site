import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { embed, embedMany } from "ai";
import { z } from "zod";
import { EMBEDDING_DIMENSIONS, loadAiConfig } from "./config";
import { parseFaqMarkdown, type FaqItem } from "./faq";
import { embeddingModel, embeddingProviderOptions } from "./models";
import { faqToDocs, lexicalSearch, reciprocalRankFusion, siteDocsToDocs, type KnowledgeDoc, type RetrievedDoc } from "./retrieval";
import { siteDocuments } from "./site-content";
import { publicClient, serviceClient } from "./supabase";

/**
 * Knowledge base = content/faq.md + static site content (+ anything ingested into
 * public.ai_documents). Retrieval is hybrid: pgvector similarity (when Supabase is
 * configured) fused with BM25 over the local corpus. If the vector path fails for
 * any reason, answers still work from BM25 alone.
 *
 * NOTE for deployment: content/faq.md is read from disk; next.config must include
 *   outputFileTracingIncludes: { "/api/**": ["./content/**"] }
 */

let faqCache: FaqItem[] | null = null;
export function loadFaqs(): FaqItem[] {
  if (faqCache && process.env.NODE_ENV === "production") return faqCache;
  const file = path.join(process.cwd(), "content", "faq.md");
  faqCache = parseFaqMarkdown(readFileSync(file, "utf8"));
  return faqCache;
}

export function localCorpus(): KnowledgeDoc[] {
  return [...faqToDocs(loadFaqs()), ...siteDocsToDocs(siteDocuments())];
}

const matchRow = z.object({
  doc_id: z.string(),
  source: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  content: z.string(),
  needs_confirmation: z.boolean().nullable().optional(),
  similarity: z.number(),
});

export async function embedQuery(text: string): Promise<number[]> {
  const cfg = loadAiConfig();
  const { embedding } = await embed({
    model: embeddingModel(cfg.embeddingModel),
    value: text,
    providerOptions: embeddingProviderOptions(),
  });
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding model ${cfg.embeddingModel} returned ${embedding.length} dims; expected ${EMBEDDING_DIMENSIONS}.`);
  }
  return embedding;
}

async function vectorSearch(query: string, k: number): Promise<RetrievedDoc[]> {
  const sb = publicClient();
  if (!sb) return [];
  const embedding = await embedQuery(query);
  const { data, error } = await sb.rpc("match_ai_documents", {
    query_embedding: embedding, // PostgREST sends the JSON array; pgvector parses '[...]'
    match_count: k,
    min_similarity: 0.25,
  });
  if (error) throw new Error(`match_ai_documents failed: ${error.message}`);
  return z
    .array(matchRow)
    .parse(data ?? [])
    .map((r) => ({
      id: r.doc_id,
      source: r.source,
      title: r.title,
      url: r.url ?? "",
      content: r.content,
      needsConfirmation: Boolean(r.needs_confirmation),
      score: r.similarity,
    }));
}

export type RetrieveResult = { docs: RetrievedDoc[]; mode: "hybrid" | "lexical" };

export async function retrieve(query: string, k = 5): Promise<RetrieveResult> {
  const lexical = lexicalSearch(query, localCorpus(), k * 2);
  try {
    const vector = await vectorSearch(query, k * 2);
    if (vector.length) return { docs: reciprocalRankFusion([vector, lexical], k), mode: "hybrid" };
  } catch (err) {
    console.warn("[ai] vector search unavailable, using lexical only:", (err as Error).message);
  }
  return { docs: lexical.slice(0, k), mode: "lexical" };
}

/**
 * (Re)build public.ai_documents from the local corpus. Idempotent: rows are
 * upserted by doc_id and rows no longer in the corpus are deleted.
 * Runs with the service-role key (POST /api/assistant/ingest).
 */
export async function ingestCorpus(): Promise<{ upserted: number; deleted: number; model: string }> {
  const sb = serviceClient();
  if (!sb) throw new Error("Supabase service role is not configured.");
  const cfg = loadAiConfig();
  const docs = localCorpus();
  const upsertRows: Record<string, unknown>[] = [];
  for (let i = 0; i < docs.length; i += 64) {
    const batch = docs.slice(i, i + 64);
    const { embeddings } = await embedMany({
      model: embeddingModel(cfg.embeddingModel),
      values: batch.map((d) => `${d.title}\n${d.content}`),
      providerOptions: embeddingProviderOptions(),
    });
    batch.forEach((d, j) => {
      const e = embeddings[j];
      if (!e || e.length !== EMBEDDING_DIMENSIONS) throw new Error(`Bad embedding for ${d.id}`);
      upsertRows.push({
        doc_id: d.id,
        source: d.source,
        title: d.title,
        url: d.url,
        content: d.content,
        needs_confirmation: d.needsConfirmation,
        embedding: e,
        embedding_model: cfg.embeddingModel,
      });
    });
  }
  const { error } = await sb.from("ai_documents").upsert(upsertRows, { onConflict: "doc_id" });
  if (error) throw new Error(`ai_documents upsert failed: ${error.message}`);
  const ids = docs.map((d) => d.id);
  const { data: stale, error: selErr } = await sb.from("ai_documents").select("doc_id");
  if (selErr) throw new Error(selErr.message);
  const toDelete = (stale ?? []).map((r: { doc_id: string }) => r.doc_id).filter((id) => !ids.includes(id));
  if (toDelete.length) {
    const { error: delErr } = await sb.from("ai_documents").delete().in("doc_id", toDelete);
    if (delErr) throw new Error(delErr.message);
  }
  return { upserted: upsertRows.length, deleted: toDelete.length, model: cfg.embeddingModel };
}
