import { z } from "zod";

/**
 * "Ask AI about this board": input validation + turning Excalidraw elements into
 * compact text the model can reason about (works with text-only models such as
 * Ling 3.1 Flash). An optional PNG data URL is sent to the vision model.
 */

export const MAX_BOARD_IMAGE_BYTES = 1_500_000; // ~1.5 MB base64 payload

export const boardRequestSchema = z.object({
  mode: z.enum(["explain", "plan"]),
  question: z.string().trim().max(500).optional(),
  elements: z
    .array(
      z
        .object({
          id: z.string().max(64),
          type: z.string().max(32),
          text: z.string().max(2000).optional(),
          x: z.number().finite(),
          y: z.number().finite(),
          width: z.number().finite().optional(),
          height: z.number().finite().optional(),
          isDeleted: z.boolean().optional(),
          startBinding: z.object({ elementId: z.string() }).nullable().optional(),
          endBinding: z.object({ elementId: z.string() }).nullable().optional(),
          containerId: z.string().nullable().optional(),
        })
        .passthrough(),
    )
    .max(2000),
  imageDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "must be a base64 PNG/JPEG/WebP data URL")
    .max(MAX_BOARD_IMAGE_BYTES)
    .optional(),
});
export type BoardRequest = z.infer<typeof boardRequestSchema>;
type El = BoardRequest["elements"][number];

/** Describe shapes, their labels and arrows ("A → B") in reading order. */
export function describeBoard(elements: El[], maxChars = 6000): string {
  const live = elements.filter((e) => !e.isDeleted);
  if (!live.length) return "(empty board)";
  const byId = new Map(live.map((e) => [e.id, e]));
  // Text bound to a container labels that container.
  const labelOf = new Map<string, string>();
  for (const e of live) if (e.type === "text" && e.containerId && e.text) labelOf.set(e.containerId, e.text.trim());
  const name = (e: El | undefined) => (e ? labelOf.get(e.id) ?? (e.type === "text" ? e.text?.trim() : undefined) ?? `${e.type}#${e.id.slice(0, 4)}` : "?");

  const shapes: string[] = [];
  const arrows: string[] = [];
  const freeText: string[] = [];
  const sorted = [...live].sort((a, b) => Math.round(a.y / 40) - Math.round(b.y / 40) || a.x - b.x);
  for (const e of sorted) {
    if (e.type === "arrow" || e.type === "line") {
      const from = e.startBinding ? byId.get(e.startBinding.elementId) : undefined;
      const to = e.endBinding ? byId.get(e.endBinding.elementId) : undefined;
      const label = labelOf.get(e.id);
      if (from || to) arrows.push(`${name(from)} → ${name(to)}${label ? ` (${label})` : ""}`);
    } else if (e.type === "text") {
      if (!e.containerId && e.text?.trim()) freeText.push(e.text.trim());
    } else if (["rectangle", "ellipse", "diamond", "frame", "embeddable", "image"].includes(e.type)) {
      shapes.push(`${e.type}: ${labelOf.get(e.id) ?? "(no label)"}`);
    } else if (e.type === "freedraw") {
      // counted below
    }
  }
  const freedraw = live.filter((e) => e.type === "freedraw").length;
  const out = [
    shapes.length ? `Shapes:\n- ${shapes.join("\n- ")}` : "",
    arrows.length ? `Connections:\n- ${arrows.join("\n- ")}` : "",
    freeText.length ? `Text notes:\n- ${freeText.join("\n- ")}` : "",
    freedraw ? `Freehand strokes: ${freedraw}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return out.slice(0, maxChars);
}
