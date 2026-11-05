/* 101 Codecrafts — CCDash: shared helpers for the learner and tutor dashboards and the course builder (round 11).
   Rules (founder, 5 Nov 2026):
   - Real data only. A fresh account shows zeros and designed empty states with faint example rows and ONE first action.
   - An API that can't answer shows an error/notice, never demo numbers.
   - Demo data only with ?demo=1 for roles that may view demos (admin/root_admin), behind a "DEMO DATA" banner. */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ico = n => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const ugx = n => "UGX " + Math.round(+n || 0).toLocaleString("en-UG");
  const num = n => (+n || 0).toLocaleString("en-UG");
  const TZ = "Africa/Kampala";
  const fmtDate = (iso, opt) => { try { return new Date(iso).toLocaleString("en-GB", Object.assign({ timeZone: TZ }, opt || { day: "numeric", month: "short" })); } catch (e) { return ""; } };
  const ago = iso => { const s = (Date.now() - Date.parse(iso)) / 1000; if (!isFinite(s)) return ""; if (s < 3600) return Math.max(1, Math.round(s / 60)) + "m ago"; if (s < 86400) return Math.round(s / 3600) + "h ago"; return Math.round(s / 86400) + "d ago"; };
  const params = new URLSearchParams(location.search);

  /** Faint, non-interactive example rows + a message + one primary action. */
  function empty(o) {
    const rows = (o.examples || []).map(x => `<div class="ph-row"><i></i><span>${esc(x[0])}</span><em>${esc(x[1] || "")}</em></div>`).join("");
    const act = o.action ? `<a class="btn or" href="${esc(o.action.href)}"${o.action.id ? ` id="${esc(o.action.id)}"` : ""}${o.action.can ? ` data-can="${esc(o.action.can)}"` : ""}>${o.action.icon ? ico(o.action.icon) : ""}${esc(o.action.label)}</a>` : "";
    const act2 = o.secondary ? `<a class="btn sm" href="${esc(o.secondary.href)}">${esc(o.secondary.label)}</a>` : "";
    return `<div class="dash-empty" data-empty="${esc(o.key || "")}">${rows ? `<div class="ph" aria-hidden="true"><span class="ph-tag">Example</span>${rows}</div>` : ""}
      <div class="msg"><b>${esc(o.title)}</b>${o.body ? `<p>${esc(o.body)}</p>` : ""}<div class="row">${act}${act2}</div></div></div>`;
  }
  function errorBox(msg, retry) {
    return `<div class="dash-err" role="alert"><b>${esc(msg)}</b><button type="button" class="btn sm" data-retry>${ico("swap")}Try again</button></div>`;
  }
  function bar(kind, html) { return `<div class="dash-bar ${kind}" role="status">${html}</div>`; }
  function kpi(label, value, note, cls) { return `<div class="kpi ${cls || ""}"><small>${esc(label)}</small><b>${esc(value)}</b>${note ? `<span class="note">${esc(note)}</span>` : ""}</div>`; }

  /* ---------- auth + fetch ---------- */
  async function headers() {
    const h = { Accept: "application/json" };
    try { const c = window.CC_AUTH && window.CC_AUTH.clerk; const t = c && c.session && await c.session.getToken(); if (t) h.Authorization = "Bearer " + t; } catch (e) {}
    return h;
  }
  /** → {state:"ok", data} | {state:"auth"} | {state:"offline"} | {state:"error", message} */
  async function getJSON(path) {
    if (window.__CC_QA_SESSION__ && window.__CC_QA_SESSION__.offlineApi) return { state: "offline" };
    if (window.CC_NO_BACKEND && window.CC_NO_BACKEND()) return { state: "offline" };
    try {
      const r = await fetch("/api/v1" + path, { credentials: "include", headers: await headers() });
      const ct = r.headers.get("content-type") || "";
      if (!/json/.test(ct)) return { state: "offline" };
      const j = await r.json();
      if (r.status === 401 || r.status === 403) return { state: "auth", message: (j.error && j.error.message) || "Not allowed" };
      if (r.status === 404 && j.error && j.error.code === "no_backend") return { state: "offline" };
      if (!r.ok) return { state: "error", message: (j.error && j.error.message) || ("HTTP " + r.status) };
      return { state: "ok", data: j.data != null ? j.data : j };
    } catch (e) { return { state: "offline" }; }
  }

  /* ---------- access ---------- */
  function access() { return window.CCAccess && window.CCAccess.ready ? window.CCAccess.ready : Promise.resolve(window.CCAccess || { role: "visitor", can: () => false }); }
  const wantsDemo = () => params.get("demo") === "1";
  /** Demo data only for ?demo=1 + demo.view. Loads js/dash-demo.js on demand. */
  async function demo(kind) {
    const A = await access();
    if (!wantsDemo() || !A.can || !A.can("demo.view")) return null;
    if (!window.CC_DASH_DEMO) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "js/dash-demo.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    return window.CC_DASH_DEMO[kind];
  }
  /** Staff may open the learner/tutor dashboards ONLY to view the labelled demo; otherwise back to their own home. */
  async function staffGuard() {
    const A = await access();
    const staff = A.role === "admin" || A.role === "root_admin";
    if (staff && !wantsDemo()) { location.replace(A.home ? A.home() : "/admin.html"); return false; }
    return true;
  }
  function demoBar() { return bar("demo", `${ico("flag")}<span>Demo data — not real. Admin preview only.</span><span class="sp"></span><a class="btn sm" href="${location.pathname}">Exit demo</a>`); }

  /* wire "Try again" buttons */
  document.addEventListener("click", e => { if (e.target.closest("[data-retry]")) location.reload(); });

  window.CCDash = { $, esc, ico, ugx, num, fmtDate, ago, empty, errorBox, bar, kpi, getJSON, access, demo, staffGuard, demoBar, wantsDemo, params };
})();
