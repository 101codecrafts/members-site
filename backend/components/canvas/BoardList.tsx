"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import s from "./canvas.module.css";
import { browserSupabase } from "./supabaseBrowser";

type Board = { id: string; title: string; owner_id: string; updated_at: string };

/** /whiteboard: your boards (owned + shared with you), create, share, delete. */
export function BoardList() {
  const { isSignedIn, userId, getToken } = useAuth();
  const sb = useMemo(() => browserSupabase(() => getToken()), [getToken]);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [shareUser, setShareUser] = useState("");
  const [shareRole, setShareRole] = useState<"editor" | "viewer">("editor");
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb || !isSignedIn) return;
    const { data, error } = await sb.from("whiteboards").select("id,title,owner_id,updated_at").order("updated_at", { ascending: false }).limit(100);
    if (error) setErr("Couldn't load your boards.");
    else setBoards(data as Board[]);
  }, [sb, isSignedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!sb) return;
    const title = (prompt("Board name", "Untitled board") || "Untitled board").slice(0, 120);
    const { data, error } = await sb.from("whiteboards").insert({ title }).select("id").single();
    if (error || !data) setErr("Couldn't create the board.");
    else window.location.href = `/whiteboard/${(data as { id: string }).id}`;
  };

  const remove = async (id: string) => {
    if (!sb || !confirm("Delete this board for everyone? This can't be undone.")) return;
    const { error } = await sb.from("whiteboards").delete().eq("id", id);
    if (error) setErr("Couldn't delete the board.");
    else void load();
  };

  const share = async (boardId: string) => {
    if (!sb) return;
    const uid = shareUser.trim();
    if (!/^user_[A-Za-z0-9]{10,}$/.test(uid)) {
      setMsg("Enter the member's user ID (it starts with user_ and is shown on their profile).");
      return;
    }
    const { error } = await sb.from("whiteboard_members").upsert({ board_id: boardId, user_id: uid, role: shareRole });
    setMsg(error ? "Couldn't share — only the board owner can add members." : `Shared as ${shareRole}.`);
    if (!error) setShareUser("");
  };

  return (
    <main className={s.list}>
      <div className={s.listInner}>
        <span className={s.kicker}>Canvases</span>
        <h1 className={s.h1}>
          101 <em>Whiteboard</em>
        </h1>
        <p className={s.sub}>Sketch system designs, flows and ideas with your team in real time — see each other's cursors, export PNG/SVG, and ask AI to explain your sketch or turn it into a plan.</p>
        <div className={s.row}>
          {isSignedIn && sb && (
            <button type="button" className={s.btn} onClick={() => void create()}>
              + New team board
            </button>
          )}
          <a className={`${s.btn} ${s.btnCyan}`} href="/whiteboard/scratch">
            Open scratch board
          </a>
          <a className={s.btn} href="/whiteboard/playground" style={{ background: "#fff" }}>
            Code canvas playground
          </a>
        </div>
        {!isSignedIn && <p className={s.sub}>Sign in to save boards and collaborate live. The scratch board saves on this device only.</p>}
        {err && <p className={s.err}>{err}</p>}
        {msg && <p className={s.sub}>{msg}</p>}
        {isSignedIn && boards && boards.length === 0 && <p className={s.sub}>No boards yet — create your first one.</p>}
        <div className={s.grid}>
          {boards?.map((b) => (
            <div key={b.id} className={s.card}>
              <a href={`/whiteboard/${b.id}`} style={{ textDecoration: "none" }}>
                <strong>{b.title}</strong>
              </a>
              <span className={s.meta}>
                {b.owner_id === userId ? "Owner" : "Shared with you"} · {new Date(b.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </span>
              {b.owner_id === userId && (
                <div className={s.share}>
                  <button type="button" className={s.btn} style={{ minHeight: 30, fontSize: 11 }} onClick={() => setShareFor(shareFor === b.id ? null : b.id)}>
                    Share
                  </button>
                  <button type="button" className={s.btn} style={{ minHeight: 30, fontSize: 11, background: "#fff" }} onClick={() => void remove(b.id)}>
                    Delete
                  </button>
                </div>
              )}
              {shareFor === b.id && (
                <div className={s.share}>
                  <input className={s.field} placeholder="user_…" value={shareUser} onChange={(e) => setShareUser(e.target.value)} aria-label="Member user ID" />
                  <select className={s.select} value={shareRole} onChange={(e) => setShareRole(e.target.value as "editor" | "viewer")} aria-label="Role">
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button type="button" className={`${s.btn} ${s.btnCyan}`} style={{ minHeight: 34 }} onClick={() => void share(b.id)}>
                    Add
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
