"use client";

import "@excalidraw/excalidraw/index.css";
import { CaptureUpdateAction, Excalidraw, MainMenu, exportToBlob, exportToSvg, reconcileElements } from "@excalidraw/excalidraw";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles, Collaborator, ExcalidrawImperativeAPI, SocketId } from "@excalidraw/excalidraw/types";
import { useAuth, useUser } from "@clerk/nextjs";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AskAiPanel } from "./AskAiPanel";
import s from "./canvas.module.css";
import { chunkBySize, colorFor, diffElements, markSent, persistableAppState, throttle } from "./collab";
import { browserSupabase } from "./supabaseBrowser";

type Props = { boardId: string | null; title?: string };
type SaveState = "local" | "saved" | "saving" | "unsaved" | "error" | "readonly";

const LOCAL_KEY = "101-whiteboard-scratch";

/**
 * Collaborative whiteboard (Excalidraw, MIT).
 *  - boardId = null → local scratch board (localStorage), no account needed.
 *  - boardId = uuid → saved in public.whiteboards (RLS) and synced live over a
 *    private Supabase Realtime channel "whiteboard:<id>": broadcast for scene
 *    deltas and pointers, presence for who is online.
 */
export default function Whiteboard({ boardId, title }: Props) {
  const { getToken, userId, isSignedIn } = useAuth();
  const { user } = useUser();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initial, setInitial] = useState<{ elements: OrderedExcalidrawElement[]; appState: Partial<AppState> } | null>(null);
  const [save, setSave] = useState<SaveState>(boardId ? "saved" : "local");
  const [peers, setPeers] = useState<{ id: string; name: string; color: string }[]>([]);
  const [askOpen, setAskOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(new Map<string, number>());
  const collaborators = useRef(new Map<SocketId, Collaborator>());
  const applyingRemote = useRef(false);
  const canEdit = useRef(true);
  const sb = useMemo(() => (boardId ? browserSupabase(() => getToken()) : null), [boardId, getToken]);
  const me = useMemo(() => ({ id: userId ?? "anon", name: user?.firstName || user?.username || "Member" }), [userId, user]);

  // ------------------------------------------------------------ load ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!boardId) {
        try {
          const raw = localStorage.getItem(LOCAL_KEY);
          const parsed = raw ? (JSON.parse(raw) as { elements?: OrderedExcalidrawElement[]; appState?: Partial<AppState> }) : {};
          if (!cancelled) setInitial({ elements: parsed.elements ?? [], appState: parsed.appState ?? {} });
        } catch {
          if (!cancelled) setInitial({ elements: [], appState: {} });
        }
        return;
      }
      if (!sb) {
        setLoadError("Saved boards need Supabase to be configured. Use the scratch board instead.");
        return;
      }
      const { data, error } = await sb.from("whiteboards").select("id,title,scene,owner_id").eq("id", boardId).maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setLoadError("This board doesn't exist or you don't have access to it.");
        return;
      }
      // Permissions are enforced by RLS: a viewer's update affects 0 rows and the UI switches to "View only".
      const scene = (data.scene ?? {}) as { elements?: OrderedExcalidrawElement[]; appState?: Partial<AppState> };
      setInitial({ elements: scene.elements ?? [], appState: scene.appState ?? {} });
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, sb, userId]);

  // --------------------------------------------------------- persist ----
  const persist = useMemo(
    () =>
      throttle(async (elements: readonly OrderedExcalidrawElement[], appState: AppState) => {
        const scene = { elements: elements.filter((e) => !e.isDeleted), appState: persistableAppState(appState as unknown as Record<string, unknown>) };
        if (!boardId) {
          try {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(scene));
          } catch {
            /* quota — ignore */
          }
          return;
        }
        if (!sb || !canEdit.current) return;
        setSave("saving");
        const { data, error } = await sb.from("whiteboards").update({ scene }).eq("id", boardId).select("id");
        if (error) setSave("error");
        else if (!data?.length) {
          canEdit.current = false;
          setSave("readonly");
        } else setSave("saved");
      }, 2000),
    [boardId, sb],
  );

  // -------------------------------------------------------- realtime ----
  useEffect(() => {
    if (!boardId || !sb || !api || !isSignedIn) return;
    const channel = sb.channel(`whiteboard:${boardId}`, {
      config: { private: true, broadcast: { self: false }, presence: { key: me.id } },
    });
    channelRef.current = channel;

    channel
      .on("broadcast", { event: "scene" }, ({ payload }) => {
        const remote = (payload as { elements: OrderedExcalidrawElement[] }).elements;
        if (!Array.isArray(remote)) return;
        applyingRemote.current = true;
        const merged = reconcileElements(api.getSceneElementsIncludingDeleted(), remote as never, api.getAppState());
        markSent(remote, lastSent.current); // don't echo peers' changes back
        api.updateScene({ elements: merged, captureUpdate: CaptureUpdateAction.NEVER });
        applyingRemote.current = false;
      })
      .on("broadcast", { event: "pointer" }, ({ payload }) => {
        const p = payload as { id: string; name: string; x: number; y: number; button: "up" | "down" };
        if (!p?.id || p.id === me.id) return;
        collaborators.current.set(p.id as SocketId, {
          id: p.id,
          username: p.name,
          pointer: { x: p.x, y: p.y, tool: "pointer" },
          button: p.button,
          color: colorFor(p.id),
        });
        api.updateScene({ collaborators: new Map(collaborators.current) });
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ id: string; name: string }>();
        const list = Object.values(state)
          .flat()
          .filter((p) => p.id !== me.id)
          .map((p) => ({ id: p.id, name: p.name, color: colorFor(p.id).background }));
        setPeers(list);
        // drop cursors of people who left
        const ids = new Set(list.map((p) => p.id));
        for (const k of collaborators.current.keys()) if (!ids.has(k)) collaborators.current.delete(k);
        api.updateScene({ collaborators: new Map(collaborators.current) });
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ id: me.id, name: me.name });
          // send our full scene once so late joiners converge
          const all = api.getSceneElementsIncludingDeleted();
          for (const batch of chunkBySize([...all])) await channel.send({ type: "broadcast", event: "scene", payload: { elements: batch } });
          markSent(all, lastSent.current);
        }
      });

    return () => {
      channelRef.current = null;
      void sb.removeChannel(channel);
    };
  }, [boardId, sb, api, isSignedIn, me]);

  const broadcastScene = useMemo(
    () =>
      throttle((elements: readonly OrderedExcalidrawElement[]) => {
        const ch = channelRef.current;
        if (!ch || !canEdit.current) return;
        const changed = diffElements(elements, lastSent.current);
        if (!changed.length) return;
        markSent(changed, lastSent.current);
        for (const batch of chunkBySize(changed)) void ch.send({ type: "broadcast", event: "scene", payload: { elements: batch } });
      }, 80),
    [],
  );

  const sendPointer = useMemo(
    () =>
      throttle((x: number, y: number, button: "up" | "down") => {
        void channelRef.current?.send({ type: "broadcast", event: "pointer", payload: { id: me.id, name: me.name, x, y, button } });
      }, 50),
    [me],
  );

  useEffect(() => () => persist.flush(), [persist]);

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, _files: BinaryFiles) => {
      if (applyingRemote.current) return;
      broadcastScene(elements);
      if (boardId && canEdit.current) setSave("unsaved");
      persist(elements, appState);
    },
    [broadcastScene, persist, boardId],
  );

  // ---------------------------------------------------------- export ----
  const download = async (kind: "png" | "svg") => {
    if (!api) return;
    const elements = api.getSceneElements();
    if (!elements.length) return;
    const appState = { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false };
    const files = api.getFiles();
    const blob =
      kind === "png"
        ? await exportToBlob({ elements, appState, files, mimeType: "image/png", exportPadding: 24 })
        : new Blob([new XMLSerializer().serializeToString(await exportToSvg({ elements, appState, files, exportPadding: 24 }))], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(title || "101-whiteboard").replace(/[^\w-]+/g, "-")}.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  if (loadError) {
    return (
      <div className={s.center}>
        <p>{loadError}</p>
        <a className={s.btn} href="/whiteboard">
          Back to boards
        </a>
      </div>
    );
  }

  return (
    <div className={s.board}>
      <div className={s.bar}>
        <a href="/whiteboard" className={s.brand} aria-label="All boards">
          101<span>/</span>board
        </a>
        <strong className={s.boardTitle}>{title || (boardId ? "Board" : "Scratch board")}</strong>
        <span className={`${s.save} ${s[`save_${save}`] ?? ""}`} aria-live="polite">
          {
            {
              local: "Saved on this device",
              saved: "All changes saved",
              saving: "Saving…",
              unsaved: "Unsaved changes",
              error: "Couldn't save — retrying",
              readonly: "View only",
            }[save]
          }
        </span>
        <div className={s.peers} aria-label={`${peers.length} other people here`}>
          {peers.slice(0, 5).map((p) => (
            <span key={p.id} className={s.peer} style={{ background: p.color }} title={p.name}>
              {p.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        <div className={s.actions}>
          <button type="button" className={`${s.btn} ${s.btnCyan}`} onClick={() => setAskOpen((v) => !v)} aria-expanded={askOpen}>
            ✦ Ask AI about this board
          </button>
          <button type="button" className={s.btnSm} onClick={() => void download("png")}>
            PNG
          </button>
          <button type="button" className={s.btnSm} onClick={() => void download("svg")}>
            SVG
          </button>
        </div>
      </div>
      <div className={s.stage}>
        {initial ? (
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={{ elements: initial.elements, appState: { ...initial.appState, collaborators: new Map() }, scrollToContent: true }}
            onChange={onChange}
            onPointerUpdate={({ pointer, button }) => boardId && sendPointer(pointer.x, pointer.y, button)}
            isCollaborating={Boolean(boardId && isSignedIn)}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
          >
            <MainMenu>
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.DefaultItems.ToggleTheme />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
              <MainMenu.DefaultItems.Help />
            </MainMenu>
          </Excalidraw>
        ) : (
          <div className={s.center}>Loading board…</div>
        )}
        {askOpen && api && <AskAiPanel api={api} onClose={() => setAskOpen(false)} />}
      </div>
    </div>
  );
}
