import { z } from "zod";

export const faqItemSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  question: z.string().min(5),
  answer: z.string().min(10),
  tags: z.array(z.string()),
  needsConfirmation: z.boolean(),
});
export type FaqItem = z.infer<typeof faqItemSchema>;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Parse content/faq.md (see the format rules at the top of that file).
 * Pure function: no fs access, so it runs in tests, on the server and at build time.
 */
export function parseFaqMarkdown(markdown: string): FaqItem[] {
  const text = markdown.replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n/g, "\n");
  const items: FaqItem[] = [];
  const seen = new Set<string>();
  let category = "General";
  let current: { question: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const lines = [...current.lines];
    let tags: string[] = [];
    // Trailing "Tags:" line.
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!.trim();
      if (!line) continue;
      const m = /^tags:\s*(.+)$/i.exec(line);
      if (m) {
        tags = m[1]!
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        lines.splice(i, 1);
      }
      break;
    }
    const answer = lines.join("\n").trim();
    let id = slugify(current.question);
    let n = 2;
    while (seen.has(id)) id = `${slugify(current.question)}-${n++}`;
    seen.add(id);
    items.push(
      faqItemSchema.parse({
        id,
        category,
        question: current.question,
        answer,
        tags,
        needsConfirmation: /TODO-CONFIRM/.test(answer),
      }),
    );
    current = null;
  };

  for (const raw of text.split("\n")) {
    const h3 = /^###\s+(.+?)\s*$/.exec(raw);
    const h2 = /^##\s+(.+?)\s*$/.exec(raw);
    if (h3) {
      flush();
      current = { question: h3[1]!, lines: [] };
    } else if (h2) {
      flush();
      category = h2[1]!;
    } else if (/^#\s/.test(raw)) {
      flush();
    } else if (current) {
      current.lines.push(raw);
    }
  }
  flush();
  return items;
}

/** Strip the internal marker for display; the UI shows a "being confirmed" badge instead. */
export function displayAnswer(answer: string): string {
  return answer
    .split("\n")
    .filter((line) => !/^\s*TODO-CONFIRM\b/.test(line))
    .join("\n")
    .replace(/\s*TODO-CONFIRM\b:?/g, "")
    .trim();
}
