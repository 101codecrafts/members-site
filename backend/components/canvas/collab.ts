/**
 * Pure helpers for whiteboard collaboration (unit-tested; no React, no network).
 */

export type VersionedElement = { id: string; version: number; versionNonce?: number; isDeleted?: boolean };

/** Elements whose version changed since the last broadcast (what we send to peers). */
export function diffElements<T extends VersionedElement>(elements: readonly T[], lastSent: Map<string, number>): T[] {
  const changed: T[] = [];
  for (const el of elements) {
    if (lastSent.get(el.id) !== el.version) changed.push(el);
  }
  return changed;
}

export function markSent(elements: readonly VersionedElement[], lastSent: Map<string, number>): void {
  for (const el of elements) lastSent.set(el.id, el.version);
}

/** Stable, readable cursor colour per user id (brand palette first). */
const PALETTE = [
  { background: "#fc8c0c", stroke: "#10181f" },
  { background: "#05e6f2", stroke: "#011d3c" },
  { background: "#011d3c", stroke: "#05e6f2" },
  { background: "#13a35c", stroke: "#10181f" },
  { background: "#d93636", stroke: "#10181f" },
  { background: "#7b5cff", stroke: "#10181f" },
];
export function colorFor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

/** Minimal throttle (leading + trailing). */
export function throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;
  const run = () => {
    last = Date.now();
    timer = null;
    if (pending) {
      const a = pending;
      pending = null;
      fn(...a);
    }
  };
  const t = (...args: A) => {
    pending = args;
    const wait = ms - (Date.now() - last);
    if (wait <= 0) run();
    else if (!timer) timer = setTimeout(run, wait);
  };
  t.flush = () => {
    if (timer) clearTimeout(timer);
    run();
  };
  t.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return t;
}

/** Keep only what is worth persisting from Excalidraw appState. */
export function persistableAppState(appState: Record<string, unknown>) {
  const keep = ["viewBackgroundColor", "gridSize", "gridModeEnabled", "theme"] as const;
  const out: Record<string, unknown> = {};
  for (const k of keep) if (appState[k] !== undefined) out[k] = appState[k];
  return out;
}

/** Realtime payloads are capped (Supabase broadcast ≈ 256 KB on free tier); chunk element batches. */
export function chunkBySize<T>(items: T[], maxBytes = 200_000): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  let size = 0;
  for (const it of items) {
    const n = JSON.stringify(it).length;
    if (cur.length && size + n > maxBytes) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(it);
    size += n;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
