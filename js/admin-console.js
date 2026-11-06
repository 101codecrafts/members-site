/* 101 Codecrafts admin console (round 11).
   Real data only: every number and row comes from /api/v1/admin/* (RLS + SECURITY DEFINER RPCs with admin scopes).
   Empty database -> zeros and empty states with faint "e.g." hints. Sample rows only with ?demo=1 AND a verified admin
   session (the server must say is_admin first); demo writes are never sent.
   Role + scopes come from GET /api/v1/admin/me (root_admin = 101codecrafts@gmail.com, bound server-side). */
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s), $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = n => Number(n || 0).toLocaleString("en-UG");
  const ugx = n => "UGX " + num(Math.round(Number(n || 0)));
  const EAT = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kampala", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const when = d => d ? EAT.format(new Date(d)) : "—";
  const icon = n => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const params = new URLSearchParams(location.search);
  const STATIC = params.has("static");
  const BASE = ((window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api").replace(/\/$/, "") + "/v1";
  const SCOPE_LABEL = { approvals: "Approvals", users: "Users & roles", plans: "Plans & pricing", flags: "Feature flags", audit: "Audit log", stats: "Stats",
    support_view: "Support view", payments: "Payments", moderation: "Moderation", content: "Content", settings: "Settings" };
  const KINDS = ["course", "lesson", "book", "link", "video", "project", "campaign", "event", "listing", "price_change"];
  const KIND_LABEL = { course: "Courses", lesson: "Lessons", book: "Books", link: "Links", video: "Videos", project: "Projects", campaign: "Campaigns", event: "Events", listing: "Listings", price_change: "Price changes" };
  const RISK_LABEL = { low: "Low risk", medium: "Check", high: "High risk", blocked: "Blocked", unchecked: "Not checked" };
  let ME = null, DEMO = false;
  const loaded = {};

  /* ------------------------------------------------------------------ toast */
  function toast(msg, bad) { const t = $("#cc-toast"); if (!t) return; t.textContent = msg; t.className = "show" + (bad ? " bad" : ""); clearTimeout(t._h); t._h = setTimeout(() => t.className = "", 3200); }

  /* -------------------------------------------------------------------- API */
  /* Every failure becomes ONE precise, honest message (BUS F2). kind drives the full-page gate on boot; text is what a
     toast says after an action. A write that failed always says "nothing was saved". */
  function describe(e, write) {
    const st = e && e.status, code = e && e.code, ref = e && e.requestId ? ` (ref ${String(e.requestId).slice(0, 8)})` : "";
    const nothing = write ? " Nothing was saved." : "";
    const server = e && e.serverMessage && String(e.serverMessage).replace(/\s+$/, "").replace(/([^.!?])$/, "$1.");   // always a full sentence
    if (!st) return { kind: "network", text: "No connection to the server. Check your internet and try again." + nothing };
    if (e.notJson) return { kind: "nobackend", text: "The admin API is not available on this copy of the site (it answered with a web page, not data)." + nothing };
    if (st === 401) return { kind: "signin", text: "Your session has ended. Sign in again, then retry." + nothing };
    if (code === "mfa_required") return { kind: "mfa", text: "Turn on two-factor authentication in your account settings to use admin tools." + nothing };
    if (code === "reverification_required") return { kind: "reverify", text: "For safety, confirm it's you again (sign in again), then retry." + nothing };
    if (st === 403) return { kind: "denied", text: (server && !/^HTTP \d+\.$/.test(server) ? server : "Your admin permissions don't cover this.") + nothing };
    if (st === 404) return { kind: "notfound", text: (server && !/^HTTP \d+\.$/.test(server) ? server : "That item or endpoint was not found.") + nothing };
    if (st === 400 || st === 409 || st === 422) return { kind: "invalid", text: (server || "The server did not accept that.") + nothing };
    if (st === 429) return { kind: "ratelimited", text: "Too many requests. Wait a minute and try again." + nothing };
    if (code === "schema_outdated") return { kind: "schema", text: "Database not updated: this feature needs a database migration that isn't applied on this server yet." + nothing + ref };
    if (st === 502 || st === 503 || st === 504) return { kind: "upstream", text: "A service the server depends on did not answer. Try again in a minute." + nothing + ref };
    return { kind: "server", text: "The server hit an error" + (write ? " and the database was not updated." : ".") + " Try again; if it keeps happening, report it" + (ref ? " with" + ref.replace(/[()]/g, "") : "") + "." };
  }
  async function api(path, opts = {}) {
    if (DEMO) return demoApi(path, opts);
    let r;
    try {
      r = await fetch(BASE + path, { credentials: "include", ...opts,
        headers: { Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}), ...(opts.headers || {}) } });
    } catch (x) { const e = new Error("network"); e.status = 0; e.network = true; throw e; }
    let j = null, isJson = /json/i.test(r.headers.get("content-type") || "");
    try { j = await r.json(); } catch (x) { isJson = false; }
    if (!r.ok || !isJson) {
      const e = new Error((j && j.error && j.error.message) || ("HTTP " + r.status));
      e.status = r.status; e.code = j && j.error && j.error.code; e.serverMessage = j && j.error && j.error.message;
      e.requestId = (j && j.error && j.error.request_id) || r.headers.get("x-request-id"); e.notJson = !isJson;
      throw e;
    }
    return j && Object.prototype.hasOwnProperty.call(j, "data") ? j.data : j;
  }
  const post = (p, b, m = "POST") => api(p, { method: m, body: JSON.stringify(b || {}) });
  const qs = o => { const u = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.set(k, v); }); const s = u.toString(); return s ? "?" + s : ""; };
  let LAST_ERR = "";
  const failed = what => esc(what + (LAST_ERR ? " " + LAST_ERR : ""));   // inline panel error = what + why
  async function act(fn, okMsg) {   // okMsg marks a write: failures then say nothing was saved
    LAST_ERR = "";
    try { const r = await fn(); if (okMsg) toast(okMsg); return r ?? true; }
    catch (e) {
      if (e && e.message && !("status" in e)) { toast(e.message, true); return null; }   // local validation / demo
      const d = describe(e, !!okMsg); LAST_ERR = d.text; toast(d.text, true);
      if (d.kind === "signin") setTimeout(() => { location.href = authUrl(); }, 1800);
      return null;
    }
  }

  /* ---------------------------------------------------------------- drawer */
  let lastFocus = null;
  function openDrawer(title, html) {
    lastFocus = document.activeElement;
    $("#ac-drawer-h").textContent = title; $("#ac-drawer-body").innerHTML = html;
    $("#ac-drawer").hidden = false; $("#ac-scrim").hidden = false; document.documentElement.classList.add("ac-lock");
    $("#ac-drawer").focus();
  }
  function closeDrawer() { $("#ac-drawer").hidden = true; $("#ac-scrim").hidden = true; document.documentElement.classList.remove("ac-lock"); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  document.addEventListener("click", e => { if (e.target.closest("[data-close]") || e.target.id === "ac-scrim") closeDrawer(); });
  document.addEventListener("keydown", e => {
    if ($("#ac-drawer").hidden) return;
    if (e.key === "Escape") closeDrawer();
    if (e.key === "Tab") {   // keep focus inside the dialog
      const f = $$("button, a[href], input, select, textarea, iframe, [tabindex]:not([tabindex='-1'])", $("#ac-drawer")).filter(x => !x.disabled && x.offsetParent !== null);
      if (!f.length) return; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
  });

  /* ------------------------------------------------------------------ gate */
  function authUrl() {
    const next = "/admin.html" + location.hash;
    if (window.CCAccess && window.CCAccess.authUrl) return window.CCAccess.authUrl(next);
    return "auth.html?next=" + encodeURIComponent(next);
  }
  function gate(kind, extra) {
    $$(".ac-panel").forEach(p => p.hidden = true); $("#ac-tabs").hidden = true;
    const g = $("#ac-gate"); g.hidden = false;
    const home = window.CCAccess && window.CCAccess.home ? window.CCAccess.home() : "dashboard.html";
    const M = {
      signin: ["SIGN IN TO CONTINUE", "The admin console is for 101 Codecrafts admins. Sign in with your admin account.", `<a class="btn or" href="${esc(authUrl())}">${icon("user")}Sign in</a>`],
      denied: ["ADMINS ONLY", "Your account is not an admin. If you were invited, open the link from the invite email while signed in with that address.", `<a class="btn ink" href="${esc(home)}">${icon("home")}Go to my home</a>`],
      nobackend: ["CONSOLE OFFLINE", "This copy of the site has no 101 backend, so there is nothing real to show. Open the console on the live app.", `<a class="btn ink" href="index.html">${icon("home")}Home</a>`],
      error: ["COULD NOT LOAD", "The console could not load. Reload to try again.", `<button class="btn ink" type="button" onclick="location.reload()">Reload</button>`],
      network: ["NO CONNECTION", "The console could not reach the server. Check your internet connection and reload.", `<button class="btn ink" type="button" onclick="location.reload()">Reload</button>`],
      mfa: ["TWO-FACTOR NEEDED", "Admin tools need two-factor authentication. Turn it on in your account settings, then reload.", `<a class="btn or" href="settings.html#security">${icon("lock")}Open security settings</a>`],
      reverify: ["CONFIRM IT'S YOU", "For safety, sign in again before using admin tools.", `<a class="btn or" href="${esc(authUrl())}">${icon("user")}Sign in again</a>`],
      schema: ["DATABASE NOT UPDATED", "The server is up, but its database is missing the admin console migration, so nothing can be shown or saved yet.", `<button class="btn ink" type="button" onclick="location.reload()">Reload</button>`],
      server: ["SERVER ERROR", "The server hit an error loading the console. Nothing was changed. Reload to try again.", `<button class="btn ink" type="button" onclick="location.reload()">Reload</button>`],
      upstream: ["SERVICE UNAVAILABLE", "A service the console depends on did not answer. Try again in a minute.", `<button class="btn ink" type="button" onclick="location.reload()">Reload</button>`],
      ratelimited: ["SLOW DOWN", "Too many requests in a short time. Wait a minute, then reload.", `<button class="btn ink" type="button" onclick="location.reload()">Reload</button>`],
      accepted: ["WELCOME TO THE TEAM", "Your admin invite is accepted. Reload to open the console with your permissions.", `<a class="btn or" href="admin.html">Open the console</a>`],
    }[kind];
    g.innerHTML = `<div class="ac-gate-in"><span class="ac-gate-ic" aria-hidden="true">${icon(kind === "accepted" ? "check" : "lock")}</span><h2>${M[0]}</h2><p>${esc(extra || M[1])}</p><div class="ac-row">${M[2]}</div></div>`;
    $("#main").setAttribute("aria-busy", "false");
  }

  /* ---------------------------------------------------------------- router */
  const can = scope => ME && (ME.is_root || (ME.scopes || []).includes(scope));
  function show(tab) {
    const a = $(`#ac-tabs [data-tab="${tab}"]`);
    if (!a || a.hidden) tab = "overview";
    $$("#ac-tabs a").forEach(x => { if (x.dataset.tab === tab) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); });
    $$(".ac-panel").forEach(p => p.hidden = p.dataset.panel !== tab);
    $$(".sbar .sb-nav a").forEach(x => { const h = (x.getAttribute("href") || "").split("#")[1] || "overview"; if (/admin\.html/.test(x.getAttribute("href") || "")) { if (h === tab) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); } });
    if (!loaded[tab]) { loaded[tab] = true; (PANELS[tab] || (() => {}))(); }
  }
  const route = () => { const h = location.hash.replace(/^#/, ""); if (h.startsWith("accept=")) return; show(h || "overview"); };

  /* ============================================================ OVERVIEW */
  function tile(label, value, hint, cls) {
    const zero = !Number(value);
    return `<div class="ac-tile ${cls || ""}${zero ? " is-zero" : ""}"><small>${esc(label)}</small><b>${typeof value === "string" ? esc(value) : num(value)}</b>${zero && hint ? `<i class="ac-eg">${esc(hint)}</i>` : ""}</div>`;
  }
  async function overview() {
    const box = $("#ov-tiles");
    const s = await act(() => api("/admin/stats"));
    if (!s) { box.innerHTML = `<p class="ac-empty">${failed("Numbers are unavailable.")}</p>`; return; }
    box.innerHTML = [
      tile("Active members", s.members_total, "e.g. 120 once people join", "ink"),
      tile("Waiting for approval", s.members_pending, "e.g. 4 new sign-ups"),
      tile("Learners", s.learners, "e.g. 95"), tile("Tutors", s.tutors, "e.g. 12"), tile("Guests", s.guests, "e.g. 30"),
      tile("Under 18", s.minors, "e.g. 8 (guardian consent)"),
      tile("To review", s.submissions_pending, "e.g. 6 courses and links", "or"),
      tile("High-risk links", s.submissions_high_risk, "e.g. 1 blocked link"),
      tile("Admins", s.admins, "root counts as 1"),
      tile("Paid in 30 days", ugx(s.gross_ugx_30d), "e.g. UGX 450,000", "cy"),
      tile("Active subscriptions", s.active_subscriptions, "e.g. 10"),
      tile("Support views (7d)", s.support_views_7d, "logged in the audit"),
    ].join("");
    const byKind = s.submissions_by_kind || {};
    $("#ov-queue").innerHTML = KINDS.filter(k => k !== "price_change").map(k => `<li><span>${KIND_LABEL[k]}</span><b class="${byKind[k] ? "" : "zero"}">${num(byKind[k])}</b></li>`).join("")
      + `<li><span>Decided in 7 days</span><b class="${s.decided_7d ? "" : "zero"}">${num(s.decided_7d)}</b></li>`;
    const plans = s.plans || {};
    const rows = [["Guardian consents pending", s.guardian_pending], ["Admins suspended", s.admins_suspended], ["Published courses", s.courses_published], ["Paid courses", s.courses_paid], ["Enrolments", s.enrollments_total], ["Open reports", s.flags_open]]
      .concat(Object.keys(plans).sort().map(k => [k.replace(":", " · ") + " plan", plans[k]]));
    $("#ov-people").innerHTML = rows.map(([k, v]) => `<li><span>${esc(k)}</span><b class="${v ? "" : "zero"}">${num(v)}</b></li>`).join("");
    $("#ov-generated").textContent = s.generated_at ? "Counted from the database at " + when(s.generated_at) + " EAT." : "";
    const n = $("#n-approvals"); if (s.submissions_pending) { n.hidden = false; n.textContent = s.submissions_pending; }
  }

  /* =========================================================== APPROVALS */
  const AP = { status: "pending", kind: "", offset: 0, limit: 20, items: [] };
  const riskBadge = l => `<span class="ac-risk r-${esc(l || "unchecked")}">${esc(RISK_LABEL[l] || l)}</span>`;
  async function approvals() {
    const list = $("#ap-list");
    const d = await act(() => api("/admin/approvals" + qs({ status: AP.status, kind: AP.kind, limit: AP.limit, offset: AP.offset })));
    if (!d) { list.innerHTML = `<p class="ac-empty">${failed("The queue could not load.")}</p>`; return; }
    AP.items = d.items || [];
    const counts = d.counts || {};
    $("#ap-kinds").innerHTML = `<button class="chip" data-ap-kind="" aria-pressed="${!AP.kind}">All <b>${num(Object.values(counts).reduce((a, b) => a + b, 0))}</b></button>`
      + KINDS.map(k => `<button class="chip" data-ap-kind="${k}" aria-pressed="${AP.kind === k}">${KIND_LABEL[k]} <b>${num(counts[k])}</b></button>`).join("");
    if (!AP.items.length) {
      list.innerHTML = `<div class="ac-empty-card"><b>Nothing ${AP.status === "pending" ? "waiting" : "here"} right now.</b><span class="ac-eg">e.g. "Intro to Python" · course · by a tutor · 2 links checked</span></div>`;
    } else {
      list.innerHTML = AP.items.map(it => `<article class="ac-item" data-id="${esc(it.id)}">
        <div class="ac-item-main"><span class="ac-kind">${esc((KIND_LABEL[it.kind] || it.kind).replace(/s$/, ""))}</span>
          <h3>${esc(it.title)}</h3>
          <p class="muted">by <b>${esc(it.submitter && (it.submitter.display_name || it.submitter.username) || "member")}</b>${it.submitter && it.submitter.is_minor ? ' <span class="ac-pill minor">Under 18</span>' : ""} · ${when(it.created_at)}${it.version > 1 ? ` · v${it.version}` : ""} · ${num((it.urls || []).length)} link${(it.urls || []).length === 1 ? "" : "s"}</p></div>
        <div class="ac-item-side">${riskBadge(it.risk_level)}<button class="btn sm ink" type="button" data-ap-open="${esc(it.id)}">${icon("search")}Preview</button></div></article>`).join("");
    }
    pager($("#ap-pager"), d.total, AP, approvals);
  }
  function pager(el, total, st, reload) {
    if (!el) return; const pages = Math.ceil((total || 0) / st.limit); if (pages <= 1) { el.innerHTML = ""; return; }
    const p = Math.floor(st.offset / st.limit) + 1;
    el.innerHTML = `<button class="btn sm" type="button" ${p <= 1 ? "disabled" : ""} data-pg="-1">← Prev</button><span>Page ${p} of ${pages}</span><button class="btn sm" type="button" ${p >= pages ? "disabled" : ""} data-pg="1">Next →</button>`;
    el.onclick = e => { const b = e.target.closest("[data-pg]"); if (!b) return; st.offset = Math.max(0, st.offset + Number(b.dataset.pg) * st.limit); reload(); };
  }
  function renderPayload(p) {
    if (!p || typeof p !== "object" || !Object.keys(p).length) return `<p class="muted">No extra fields.</p>`;
    const val = v => v && typeof v === "object" ? `<pre>${esc(JSON.stringify(v, null, 2).slice(0, 4000))}</pre>` : esc(String(v));
    return `<dl class="ac-dl">${Object.entries(p).slice(0, 40).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${val(v)}</dd>`).join("")}</dl>`;
  }
  function ytId(u) { try { const x = new URL(u), h = x.hostname.replace(/^www\.|^m\./, ""); const id = h === "youtu.be" ? x.pathname.slice(1) : x.pathname === "/watch" ? x.searchParams.get("v") : (x.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/) || [])[1]; return /^[A-Za-z0-9_-]{11}$/.test(id || "") ? id : null; } catch (e) { return null; } }
  function openSubmission(id) {
    const it = AP.items.find(x => x.id === id); if (!it) return;
    const flags = it.risk_flags || [];
    const byUrl = {}; flags.forEach(f => { (byUrl[f.url || "—"] = byUrl[f.url || "—"] || []).push(f); });
    const urls = (it.urls || []).map(u => {
      const fl = byUrl[u] || [], vid = ytId(u), okVid = vid && fl.some(f => f.code === "youtube_ok") && !fl.some(f => ["high", "blocked"].includes(f.level));
      return `<li class="ac-url"><a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(u)}</a>
        <div class="ac-flags">${fl.length ? fl.map(f => `<span class="ac-flag l-${esc(f.level)}" title="${esc(f.detail || "")}">${esc(f.code.replace(/_/g, " "))}</span>`).join("") : '<span class="ac-flag l-unchecked">not checked yet</span>'}</div>
        ${okVid ? `<div class="ac-embed"><iframe src="https://www.youtube-nocookie.com/embed/${vid}" title="Video preview" loading="lazy" allow="encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe></div>` : ""}</li>`;
    }).join("");
    const price = it.kind === "price_change" && it.payload ? `<div class="ac-price"><span>${it.payload.from ? (it.payload.from.is_free ? "Free" : ugx(it.payload.from.price_ugx)) : "—"}</span><b>→</b><span>${it.payload.to.is_free ? "Free" : ugx(it.payload.to.price_ugx)}</span></div>` : "";
    const pending = it.status === "pending" && can("approvals");
    const needsNote = it.risk_level === "high" || (it.risk_level === "unchecked" && (it.urls || []).length);
    openDrawer((KIND_LABEL[it.kind] || it.kind).replace(/s$/, "").toUpperCase() + " REVIEW", `
      <div class="ac-prev"><div class="ac-row">${riskBadge(it.risk_level)}<span class="ac-pill">${esc(it.status.replace("_", " "))}</span>${it.version > 1 ? `<span class="ac-pill">version ${it.version}</span>` : ""}</div>
        <h3 class="ac-prev-t">${esc(it.title)}</h3>
        <p class="muted">by <b>${esc(it.submitter && it.submitter.display_name || "")}</b> · sent ${when(it.created_at)} EAT</p>
        ${it.summary ? `<p class="ac-prev-s">${esc(it.summary)}</p>` : ""}${price}
        ${(it.urls || []).length ? `<h4>LINKS</h4><ul class="ac-urls">${urls}</ul>${it.kind !== "price_change" ? `<button class="btn sm" type="button" data-recheck="${esc(it.id)}">${icon("swap")}Check links again</button>` : ""}` : ""}
        <h4>WHAT WILL BE PUBLISHED</h4>${renderPayload(it.kind === "price_change" ? null : it.payload)}
        ${it.decision_reason ? `<h4>LAST DECISION</h4><p>${esc(it.decision_reason)}</p>` : ""}
      </div>
      ${pending ? `<form class="ac-decide" data-decide="${esc(it.id)}">
        <label class="field"><span>Note to the submitter ${needsNote ? "(required: the links are not verified as safe)" : "(required to reject or ask for changes)"}</span><textarea name="reason" rows="3" maxlength="2000" placeholder="e.g. Please replace the short link with the full https address."></textarea></label>
        ${it.kind !== "price_change" ? `<label class="field"><span>Fixes to make (one per line, for "Ask for changes")</span><textarea name="fixes" rows="2" placeholder="Use an https link&#10;Add a course summary"></textarea></label>` : ""}
        <div class="ac-row ac-decide-btns">
          <button class="btn ok" type="submit" value="approve" ${it.risk_level === "blocked" ? "disabled title=\"Remove the blocked link first\"" : ""}>${icon("check")}Approve</button>
          ${it.kind !== "price_change" ? `<button class="btn or" type="submit" value="request_changes">Ask for changes</button>` : ""}
          <button class="btn no" type="submit" value="reject">${icon("xmark")}Reject</button></div>
        <p class="ac-msg" role="status"></p></form>` : `<p class="muted">${can("approvals") ? "Already decided." : "You can view the queue but not decide (needs the Approvals permission)."}</p>`}`);
  }
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-decide]"); if (!f) return; e.preventDefault();
    const decision = e.submitter && e.submitter.value || "approve";
    const reason = f.reason.value.trim(), fixes = f.fixes ? f.fixes.value.split("\n").map(s => s.trim()).filter(Boolean) : [];
    if (decision !== "approve" && reason.length < 5) { f.querySelector(".ac-msg").textContent = "Write a short note (5+ characters) so the submitter knows what to do."; f.reason.focus(); return; }
    if (DEMO) { toast("Demo: nothing was saved"); return; }
    $$("button", f).forEach(b => b.disabled = true);
    const ok = await act(() => post("/admin/approvals/" + encodeURIComponent(f.dataset.decide), { decision, reason: reason || null, fixes }), { approve: "Approved: it is live and the submitter was told.", reject: "Rejected: the submitter was told why.", request_changes: "Changes requested: the submitter was told what to fix." }[decision]);
    if (ok) { closeDrawer(); approvals(); loaded.overview = false; } else $$("button", f).forEach(b => b.disabled = false);
  });
  document.addEventListener("click", async e => {
    const o = e.target.closest("[data-ap-open]"); if (o) return openSubmission(o.dataset.apOpen);
    const s = e.target.closest("[data-ap-status]"); if (s) { AP.status = s.dataset.apStatus; AP.offset = 0; $$("[data-ap-status]").forEach(x => x.setAttribute("aria-pressed", x === s)); return approvals(); }
    const k = e.target.closest("[data-ap-kind]"); if (k) { AP.kind = k.dataset.apKind; AP.offset = 0; return approvals(); }
    const r = e.target.closest("[data-recheck]"); if (r) { if (DEMO) return toast("Demo: nothing was saved"); r.disabled = true; const v = await act(() => post(`/admin/approvals/${r.dataset.recheck}/recheck`), "Links checked again."); if (v) { closeDrawer(); approvals(); } r.disabled = false; }
  });

  /* ==================================================== EVENTS TO REVIEW */
  /* Member-submitted events (POST /v1/events/external) wait as pending_review. GET /admin/events/pending (scope approvals);
     POST /admin/events/:id/approve {reason?} and /reject {reason: 3..300}. The server audits and notifies the submitter. */
  const EV = { offset: 0, limit: 20, items: [], total: 0 };
  const EV_REASON_MAX = 300;
  const ORG_LABEL = { google_gdg: "Google / GDG", microsoft: "Microsoft", openai: "OpenAI", anthropic: "Anthropic", hugging_face: "Hugging Face", alibaba_cloud: "Alibaba Cloud", aws: "AWS", mlh: "MLH", "101": "101 Codecrafts", other: "Other" };
  const safeLink = u => { try { const x = new URL(u); return x.protocol === "https:" ? x.href : null; } catch (e) { return null; } };
  function evDates(it) {
    if (!it.starts_at) return "—";
    const a = when(it.starts_at), b = it.ends_at ? when(it.ends_at) : "";
    return b && b !== a ? `${a} → ${b} EAT` : `${a} EAT`;
  }
  function evCard(it) {
    const link = safeLink(it.link), who = it.submitter && (it.submitter.display_name || (it.submitter.username ? "@" + it.submitter.username : "")) || (it.submitter ? "member" : "imported feed");
    const where = [it.mode && it.mode !== "physical" ? it.mode : "", it.venue, it.city].filter(Boolean).join(" · ");
    const extra = [it.event_type ? `<span class="ac-pill">${esc(it.event_type)}</span>` : "", it.price_text ? `<span class="ac-pill">${esc(it.price_text)}</span>` : ""].join("");
    return `<article class="ac-item ac-ev" data-ev="${esc(it.id)}">
      <div class="ac-item-main"><span class="ac-kind">${esc(ORG_LABEL[it.organiser] || it.organiser_name || it.organiser || "Event")}</span>
        <h3>${esc(it.title)}${extra}</h3>
        <p><b>When</b> ${esc(evDates(it))}${where ? ` · ${esc(where)}` : ""}</p>
        <p class="ac-ev-link">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer nofollow">${esc(link)}</a>` : `<span class="ac-flag l-high">link is not https</span>`}</p>
        ${it.description ? `<p class="ac-ev-desc">${esc(it.description)}</p>` : ""}
        <p class="muted">by <b>${esc(who)}</b>${it.contact_email ? ` · <a href="mailto:${esc(it.contact_email)}">${esc(it.contact_email)}</a>` : ""} · sent ${esc(when(it.submitted_at))} EAT</p></div>
      <div class="ac-item-side ac-ev-btns">
        <button class="btn sm ok" type="button" data-ev-approve="${esc(it.id)}">${icon("check")}Approve</button>
        <button class="btn sm no" type="button" data-ev-reject="${esc(it.id)}" aria-expanded="false" aria-controls="evr-${esc(it.id)}">${icon("xmark")}Reject</button></div>
      <form class="ac-ev-reject" id="evr-${esc(it.id)}" data-ev-reject-form="${esc(it.id)}" hidden novalidate>
        <label class="field"><span>Reason (sent to the submitter, ${EV_REASON_MAX} characters max)</span>
          <textarea name="reason" rows="2" maxlength="${EV_REASON_MAX}" required minlength="3" placeholder="e.g. The link is not an event page."></textarea></label>
        <div class="ac-row"><button class="btn sm no" type="submit">Reject event</button><button class="btn sm" type="button" data-ev-cancel>Cancel</button><small class="ac-ev-count" aria-live="polite">0 / ${EV_REASON_MAX}</small></div>
        <p class="ac-msg" role="status"></p></form>
    </article>`;
  }
  async function eventsReview() {
    const list = $("#ev-list"); if (!list) return;
    const d = await act(() => api("/admin/events/pending" + qs({ limit: EV.limit, offset: EV.offset })));
    if (!d) { list.innerHTML = `<p class="ac-empty" role="alert">${failed("Events to review could not load.")}</p>`; return; }
    EV.items = d.items || []; EV.total = Number(d.total || 0);
    const n = $("#n-events"); if (n) { n.hidden = !EV.total; n.textContent = EV.total ? num(EV.total) : ""; }
    if (!EV.items.length && EV.offset > 0) { EV.offset = Math.max(0, EV.offset - EV.limit); return eventsReview(); }
    list.innerHTML = EV.items.length ? EV.items.map(evCard).join("")
      : `<div class="ac-empty-card"><b>No events waiting for review.</b><span class="ac-eg">e.g. "Kampala AI meetup" · Google / GDG · 12 Dec 2026 · sent by a member</span></div>`;
    if (d.details_available === false && EV.items.length) list.insertAdjacentHTML("afterbegin", `<p class="muted ac-note">Type, description and contact email are not stored yet on this server (database update pending). Check the link for the details.</p>`);
    pager($("#ev-pager"), EV.total, EV, eventsReview);
  }
  async function decideEvent(id, decision, reason, btns) {
    if (DEMO) { toast("Demo: nothing was saved"); return; }
    btns.forEach(b => b.disabled = true);
    const ok = await act(() => post(`/admin/events/${encodeURIComponent(id)}/${decision}`, decision === "reject" ? { reason } : {}),
      decision === "approve" ? "Approved: the event is live on Events and the submitter was told." : "Rejected: the submitter was told why.");
    if (ok) { eventsReview(); return true; }
    btns.forEach(b => b.disabled = false);
    if (/already reviewed|not found/i.test(LAST_ERR)) eventsReview();   // someone else decided first: refresh the list
    return false;
  }
  document.addEventListener("click", async e => {
    if (e.target.closest("[data-ev-reload]")) return eventsReview();
    const a = e.target.closest("[data-ev-approve]");
    if (a) { const card = a.closest("[data-ev]"); return decideEvent(a.dataset.evApprove, "approve", null, $$("button", card)); }
    const r = e.target.closest("[data-ev-reject]");
    if (r) { const f = $(`[data-ev-reject-form="${CSS.escape(r.dataset.evReject)}"]`); if (!f) return; f.hidden = !f.hidden; r.setAttribute("aria-expanded", String(!f.hidden)); if (!f.hidden) f.reason.focus(); return; }
    const c = e.target.closest("[data-ev-cancel]");
    if (c) { const f = c.closest("[data-ev-reject-form]"); f.hidden = true; f.reset(); f.querySelector(".ac-msg").textContent = ""; const b = $(`[data-ev-reject="${CSS.escape(f.dataset.evRejectForm)}"]`); if (b) { b.setAttribute("aria-expanded", "false"); b.focus(); } }
  });
  document.addEventListener("input", e => {
    const t = e.target; if (!t.closest || !t.closest("[data-ev-reject-form]") || t.name !== "reason") return;
    t.form.querySelector(".ac-ev-count").textContent = `${t.value.length} / ${EV_REASON_MAX}`;
  });
  document.addEventListener("submit", async e => {
    const f = e.target.closest && e.target.closest("[data-ev-reject-form]"); if (!f) return; e.preventDefault();
    const reason = f.reason.value.trim(), msg = f.querySelector(".ac-msg");
    if (reason.length < 3) { msg.textContent = "Write a reason (3+ characters) so the submitter knows why."; f.reason.setAttribute("aria-invalid", "true"); f.reason.focus(); return; }
    if (reason.length > EV_REASON_MAX) { msg.textContent = `Keep the reason to ${EV_REASON_MAX} characters.`; f.reason.focus(); return; }
    f.reason.removeAttribute("aria-invalid"); msg.textContent = "";
    const card = f.closest("[data-ev]");
    const ok = await decideEvent(f.dataset.evRejectForm, "reject", reason, $$("button", card));
    if (!ok && LAST_ERR) msg.textContent = LAST_ERR;
  });

  /* =============================================================== USERS */
  const US = { q: "", role: "", status: "", minor: "", offset: 0, limit: 25, items: [] };
  const roleName = r => ({ root_admin: "Root admin", admin: "Admin", tutor: "Tutor", learner: "Learner", guest: "Guest" }[r] || r);
  async function users() {
    const tb = $("#us-table tbody");
    const d = await act(() => api("/admin/people" + qs({ q: US.q, role: US.role, status: US.status, minor: US.minor, limit: US.limit, offset: US.offset })));
    if (!d) { tb.innerHTML = `<tr><td colspan="7" class="ac-empty">${failed("Users could not load.")}</td></tr>`; return; }
    US.items = d.items || [];
    tb.innerHTML = US.items.length ? US.items.map(u => `<tr>
      <td><b>${esc(u.display_name || u.username || "—")}</b><br><small class="muted">${esc(u.email || u.id)}</small></td>
      <td><span class="ac-pill role-${esc(u.role)}">${esc(roleName(u.role))}</span></td>
      <td>${esc(u.learner_plan)}${(u.roles || []).includes("tutor") ? ` · tutor ${esc(u.tutor_plan)}` : ""}</td>
      <td><span class="ac-pill st-${esc(u.account_status)}">${esc(u.account_status)}</span></td>
      <td>${u.is_minor ? `<span class="ac-pill minor">Yes</span> <small>${esc(u.guardian ? "guardian " + u.guardian.state : "no guardian")}</small>` : "No"}</td>
      <td><small>${when(u.joined_at || u.created_at)}</small></td>
      <td><button class="btn sm" type="button" data-user="${esc(u.id)}">Open</button></td></tr>`).join("")
      : `<tr><td colspan="7"><div class="ac-empty-card"><b>No people match.</b><span class="ac-eg">e.g. Nakato Aisha · learner · free · active</span></div></td></tr>`;
    pager($("#us-pager"), d.total, US, users);
  }
  $("#us-form") && $("#us-form").addEventListener("submit", e => { e.preventDefault(); const f = e.target; Object.assign(US, { q: f.q.value.trim(), role: f.role.value, status: f.status.value, minor: f.minor.value, offset: 0 }); users(); });
  function openUser(id) {
    const u = US.items.find(x => x.id === id); if (!u) return;
    const locked = u.is_root || ((u.roles || []).includes("admin") && !ME.is_root);
    const g = u.guardian;
    openDrawer("PERSON", `
      <div class="ac-person"><span class="ac-av" aria-hidden="true">${esc((u.display_name || u.username || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase())}</span>
        <div><h3>${esc(u.display_name || u.username || "—")}</h3><p class="muted">${esc(u.email || "")} · <code>${esc(u.id)}</code></p>
        <div class="ac-row"><span class="ac-pill role-${esc(u.role)}">${esc(roleName(u.role))}</span><span class="ac-pill st-${esc(u.account_status)}">${esc(u.account_status)}</span>${u.is_minor ? '<span class="ac-pill minor">Under 18</span>' : ""}</div></div></div>
      ${u.status_reason ? `<p class="ac-note">Status note: ${esc(u.status_reason)}</p>` : ""}
      <dl class="ac-dl"><dt>Learner plan</dt><dd>${esc(u.learner_plan)}</dd><dt>Tutor plan</dt><dd>${esc(u.tutor_plan)}</dd><dt>Education</dt><dd>${esc(u.education_level || "—")}</dd>
        <dt>Joined</dt><dd>${when(u.joined_at || u.created_at)}</dd><dt>Last seen</dt><dd>${when(u.last_seen_at)}</dd>
        <dt>Guardian</dt><dd>${g ? esc(g.state + " · " + g.relationship) : u.is_minor ? "None on file" : "Not needed"}</dd></dl>
      ${locked ? `<p class="ac-lockmsg">${icon("lock")}${u.is_root ? "Root is permanent: no one can change, suspend or remove it." : "Only root can change another admin."}</p>` : `
      <form class="ac-form" data-manage="${esc(u.id)}" data-action="role"><h4>ROLE</h4><div class="ac-row">
        ${(u.roles || []).includes("learner") ? `<button class="btn sm" name="b" value="learner:0">Remove learner</button>` : `<button class="btn sm ink" name="b" value="learner:1">Make learner</button>`}
        ${(u.roles || []).includes("tutor") ? `<button class="btn sm" name="b" value="tutor:0">Remove tutor</button>` : `<button class="btn sm ink" name="b" value="tutor:1" ${u.is_minor ? "disabled title=\"Tutors must be 18+\"" : ""}>Make tutor</button>`}</div>
        <p class="muted">Admins are added by invite (Admins tab, root only).</p></form>
      <form class="ac-form" data-manage="${esc(u.id)}" data-action="status"><h4>ACCOUNT STATUS</h4><div class="ac-row">
        <label class="field"><span>Status</span><select name="status"><option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option></select></label>
        <label class="field grow"><span>Reason (shown to the person)</span><input name="reason" maxlength="500" placeholder="e.g. Posting spam links"></label></div>
        <button class="btn sm no" type="submit">Save status</button></form>
      <form class="ac-form" data-manage="${esc(u.id)}" data-action="plan"><h4>PLAN OVERRIDE</h4><div class="ac-row">
        <label class="field"><span>For</span><select name="audience"><option value="learner">Learner plan</option><option value="tutor">Tutor plan</option></select></label>
        <label class="field"><span>Plan</span><select name="plan"><option>free</option><option>standard</option><option>plus</option><option>pro</option></select></label>
        <label class="field grow"><span>Reason</span><input name="reason" maxlength="500" placeholder="e.g. Scholarship"></label></div>
        <button class="btn sm ink" type="submit">Set plan</button></form>
      ${g && g.id ? `<form class="ac-form" data-manage="${esc(u.id)}" data-action="guardian"><h4>GUARDIAN CONSENT</h4><div class="ac-row">
        ${g.state === "pending" ? `<button class="btn sm ok" name="b" value="verify:${esc(g.id)}">Mark verified</button>` : ""}
        ${g.state !== "revoked" ? `<label class="field grow"><span>Reason to revoke</span><input name="reason" maxlength="500"></label><button class="btn sm no" name="b" value="revoke:${esc(g.id)}">Revoke</button>` : "<span>Revoked</span>"}</div></form>` : ""}`}
      ${can("support_view") && !u.is_root && (!(u.roles || []).includes("admin") || ME.is_root) ? `<form class="ac-form" data-support="${esc(u.id)}" data-name="${esc(u.display_name || u.username || "")}"><h4>SUPPORT VIEW (READ-ONLY, 30 MIN)</h4>
        <div class="ac-row"><label class="field grow"><span>Why (the person is told)</span><input name="reason" minlength="5" maxlength="500" required placeholder="e.g. Ticket 42: course progress missing"></label>
        <label class="field"><span>Ticket</span><input name="ticket" maxlength="80" placeholder="T-42"></label></div>
        <button class="btn sm cy" type="submit">${icon("search")}Open their dashboard</button></form>` : ""}`);
  }
  document.addEventListener("click", e => { const b = e.target.closest("[data-user]"); if (b) openUser(b.dataset.user); });
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-manage]"); if (!f) return; e.preventDefault();
    if (DEMO) return toast("Demo: nothing was saved");
    const id = f.dataset.manage, a = f.dataset.action, b = e.submitter && e.submitter.value;
    let body;
    if (a === "role") { const [role, g] = (b || "").split(":"); body = { action: "role", role, grant: g === "1" }; }
    if (a === "status") { body = { action: "status", status: f.status.value, ...(f.reason.value.trim() ? { reason: f.reason.value.trim() } : {}) }; if (body.status !== "active" && !body.reason) return toast("Give a reason to suspend or ban.", true); }
    if (a === "plan") { if (f.reason.value.trim().length < 3) return toast("Give a reason for the plan change.", true); body = { action: "plan", audience: f.audience.value, plan: f.plan.value, reason: f.reason.value.trim() }; }
    if (a === "guardian") { const [k, cid] = (b || "").split(":"); body = k === "verify" ? { action: "guardian_verify", consent_id: cid } : { action: "guardian_revoke", consent_id: cid, reason: (f.reason && f.reason.value.trim()) || "" }; if (k === "revoke" && body.reason.length < 3) return toast("Give a reason to revoke.", true); }
    const ok = await act(() => post("/admin/people/" + encodeURIComponent(id), body), "Saved and written to the audit log.");
    if (ok) { closeDrawer(); users(); }
  });

  /* =============================================================== ADMINS */
  let ADM = null;
  const scopeChips = sc => (sc || []).map(s => `<span class="ac-scope">${esc(SCOPE_LABEL[s] || s)}</span>`).join("");
  async function admins() {
    const d = ADM = await act(() => api("/admin/admins"));
    const list = $("#ad-list");
    if (!d) { list.innerHTML = `<p class="ac-empty">${failed("Admins could not load.")}</p>`; return; }
    const all = (ME && ME.all_scopes) || Object.keys(SCOPE_LABEL);
    list.innerHTML = (d.admins || []).map(a => `<article class="ac-item ${a.is_root ? "is-root" : ""}">
      <div class="ac-item-main"><h3>${esc(a.display_name || a.username || a.email || a.user_id)} ${a.is_root ? `<span class="ac-pill root">${icon("lock")}Root · permanent</span>` : ""}${a.status === "suspended" ? '<span class="ac-pill st-suspended">Suspended</span>' : ""}</h3>
        <p class="muted">${esc(a.email || "")}${a.status_reason ? " · " + esc(a.status_reason) : ""}</p>
        <div class="ac-scopelist">${a.is_root ? '<span class="ac-scope all">Every permission</span>' : scopeChips(a.scopes)}</div></div>
      ${ME.is_root && !a.is_root ? `<form class="ac-item-side ac-admin-edit" data-admin="${esc(a.user_id)}">
        <details><summary class="btn sm">Permissions</summary><div class="ac-checks">${all.map(s => `<label><input type="checkbox" name="scope" value="${s}" ${(a.scopes || []).includes(s) ? "checked" : ""}> ${esc(SCOPE_LABEL[s] || s)}</label>`).join("")}</div>
          <button class="btn sm ink" name="op" value="scopes">Save permissions</button></details>
        <input name="reason" maxlength="500" placeholder="Reason (to suspend or remove)" aria-label="Reason">
        <div class="ac-row">${a.status === "suspended" ? `<button class="btn sm ok" name="op" value="reinstate">Reinstate</button>` : `<button class="btn sm or" name="op" value="suspend">Suspend</button>`}<button class="btn sm no" name="op" value="remove">Remove admin</button></div></form>` : ""}</article>`).join("")
      || `<div class="ac-empty-card"><b>No admins yet.</b></div>`;
    $("#ad-invite").hidden = !ME.is_root;
    $("#ad-inv-h").hidden = !ME.is_root || !(d.invites || []).length;
    $("#ad-invites").innerHTML = ME.is_root ? (d.invites || []).map(i => `<div class="ac-item sm"><div class="ac-item-main"><b>${esc(i.email)}</b> <span class="ac-pill">${esc(i.status)}</span><div class="ac-scopelist">${scopeChips(i.scopes)}</div><small class="muted">expires ${when(i.expires_at)} EAT</small></div>
      ${i.status === "pending" ? `<button class="btn sm no" type="button" data-revoke="${esc(i.id)}">Revoke</button>` : ""}</div>`).join("") : "";
    $("#ad-scope-checks").innerHTML = all.map(s => `<label><input type="checkbox" name="scope" value="${s}" ${["approvals", "stats"].includes(s) ? "checked" : ""}> ${esc(SCOPE_LABEL[s] || s)}</label>`).join("");
  }
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-admin]"); if (!f) return; e.preventDefault();
    if (DEMO) return toast("Demo: nothing was saved");
    const id = f.dataset.admin, op = e.submitter && e.submitter.value, reason = f.reason.value.trim();
    let ok;
    if (op === "scopes") { const sc = $$("input[name=scope]:checked", f).map(x => x.value); if (!sc.length) return toast("Keep at least one permission, or remove the admin.", true); ok = await act(() => post("/admin/admins/" + id, { scopes: sc }, "PATCH"), "Permissions saved."); }
    if (op === "suspend") { if (reason.length < 3) return toast("Give a reason to suspend.", true); ok = await act(() => post("/admin/admins/" + id, { status: "suspended", reason }, "PATCH"), "Admin suspended."); }
    if (op === "reinstate") ok = await act(() => post("/admin/admins/" + id, { status: "active" }, "PATCH"), "Admin reinstated.");
    if (op === "remove") { if (!confirm("Remove this admin's access? They keep their normal account.")) return; ok = await act(() => post("/admin/admins/" + id, reason.length >= 3 ? { reason } : {}, "DELETE"), "Admin removed."); }
    if (ok) admins();
  });
  $("#ad-invite") && $("#ad-invite").addEventListener("submit", async e => {
    e.preventDefault(); if (DEMO) return toast("Demo: nothing was saved");
    const f = e.target, sc = $$("input[name=scope]:checked", f).map(x => x.value), msg = $("#ad-invite-msg");
    if (!sc.length) { msg.textContent = "Pick at least one permission."; return; }
    const r = await act(() => post("/admin/admins", { email: f.email.value.trim(), scopes: sc }));
    if (!r) return;
    f.reset();
    msg.innerHTML = r.emailed ? `Invite emailed to <b>${esc(r.email)}</b>. It expires ${when(r.expires_at)} EAT.`
      : `Email is not set up, so send this private link to <b>${esc(r.email)}</b> yourself (expires ${when(r.expires_at)} EAT):<br><input class="ac-copy" readonly value="${esc(r.accept_url)}" aria-label="Accept link"> <button class="btn sm" type="button" data-copy>Copy</button>`;
    admins();
  });
  document.addEventListener("click", async e => {
    const c = e.target.closest("[data-copy]"); if (c) { const i = c.previousElementSibling; i.select(); try { await navigator.clipboard.writeText(i.value); toast("Link copied."); } catch (x) { document.execCommand("copy"); } }
    const r = e.target.closest("[data-revoke]"); if (r) { if (DEMO) return toast("Demo: nothing was saved"); if (await act(() => api("/admin/invites/" + r.dataset.revoke, { method: "DELETE" }), "Invite revoked.")) admins(); }
  });

  /* ================================================================ PLANS */
  async function plans() {
    const g = $("#pl-grid");
    const d = await act(() => api("/admin/plans"));
    if (!d) { g.innerHTML = `<p class="ac-empty">${failed("Plans could not load.")}</p>`; return; }
    if (d.available === false) { g.innerHTML = `<div class="ac-empty-card"><b>Plans are not in the database yet.</b><span>They arrive with the round-11 plans migration (plan tiers, prices and limits). Nothing is hard-coded, so this editor fills in as soon as it is applied.</span></div>`; return; }
    const col = aud => `<div class="ac-plancol"><h3>${aud === "learner" ? "LEARNER PLANS" : "TUTOR PLANS"}</h3>${(d[aud] || []).map(t => `
      <form class="card ac-plan" data-plan="${aud}/${esc(t.tier)}">
        <div class="ac-row"><b class="ac-tier">${esc(t.tier)}</b>${t.price_is_suggestion && t.tier !== "free" ? '<span class="ac-pill sugg">suggested price</span>' : ""}</div>
        <label class="field"><span>Name</span><input name="name" value="${esc(t.name)}" maxlength="40"></label>
        <label class="field"><span>Tagline</span><input name="tagline" value="${esc(t.tagline || "")}" maxlength="160"></label>
        ${t.tier === "free" ? `<p class="muted">Free plan: no price.</p>` : `<div class="ac-row"><label class="field"><span>Monthly (UGX)</span><input name="monthly" type="number" min="1000" step="500" value="${esc(t.monthly_ugx ?? "")}"></label>
          <label class="field"><span>Yearly (UGX)</span><input name="yearly" type="number" min="1000" step="500" value="${esc(t.yearly_ugx ?? "")}"></label></div>
          ${t.price_is_suggestion ? `<label class="ac-check"><input type="checkbox" name="confirm"> Confirm these prices</label>` : ""}`}
        <fieldset class="ac-limits"><legend>Limits (empty = unlimited)</legend>${Object.entries(t.limits || {}).map(([k, v]) => typeof v === "boolean"
          ? `<label class="ac-check"><input type="checkbox" data-limit="${esc(k)}" data-type="bool" ${v ? "checked" : ""}> ${esc(k)}</label>`
          : `<label class="field ac-lim"><span>${esc(k)}</span><input type="number" min="0" data-limit="${esc(k)}" data-type="num" value="${v === null ? "" : esc(v)}" placeholder="unlimited"></label>`).join("") || '<p class="muted">No limits set.</p>'}</fieldset>
        <label class="field"><span>Features (one per line)</span><textarea name="features" rows="3">${esc((t.features || []).join("\n"))}</textarea></label>
        <button class="btn sm ink" type="submit" ${can("plans") ? "" : "disabled"}>Save ${esc(t.tier)}</button></form>`).join("") || '<p class="muted">No tiers.</p>'}</div>`;
    g.innerHTML = col("learner") + col("tutor");
  }
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-plan]"); if (!f) return; e.preventDefault();
    if (DEMO) return toast("Demo: nothing was saved");
    const limits = {}; $$("[data-limit]", f).forEach(i => { limits[i.dataset.limit] = i.dataset.type === "bool" ? i.checked : (i.value === "" ? null : Number(i.value)); });
    const b = { name: f.name.value.trim(), tagline: f.tagline.value.trim(), limits, features: f.features.value.split("\n").map(s => s.trim()).filter(Boolean) };
    if (f.monthly && f.monthly.value) b.monthly_ugx = Number(f.monthly.value);
    if (f.yearly && f.yearly.value) b.yearly_ugx = Number(f.yearly.value);
    if (f.confirm && f.confirm.checked) b.confirm_prices = true;
    if (await act(() => post("/admin/plans/" + f.dataset.plan, b, "PUT"), "Plan saved. Every gate now reads the new values.")) plans();
  });
  async function coursePricing(q) {
    const box = $("#pc-list");
    const rows = await act(() => api("/admin/courses/pricing" + qs({ q })));
    if (!rows) { box.innerHTML = ""; return; }
    box.innerHTML = rows.length ? rows.map(c => `<form class="ac-item sm" data-course="${esc(c.id)}"><div class="ac-item-main"><b>${esc(c.title)}</b> <span class="ac-pill">${esc(c.status)}</span><small class="muted"> · ${num(c.enrollments_count)} learners · now ${c.is_free ? "Free" : ugx(c.price_ugx)}</small></div>
      <div class="ac-item-side ac-row"><label class="ac-check"><input type="radio" name="free-${esc(c.id)}" value="1" ${c.is_free ? "checked" : ""}> Free</label><label class="ac-check"><input type="radio" name="free-${esc(c.id)}" value="0" ${c.is_free ? "" : "checked"}> Paid</label>
      <input name="price" type="number" min="1000" step="500" value="${c.is_free ? "" : esc(c.price_ugx)}" placeholder="UGX" aria-label="Price in UGX"><button class="btn sm ink" type="submit">Save</button></div></form>`).join("")
      : `<div class="ac-empty-card"><b>No courses found.</b><span class="ac-eg">e.g. Web Foundations · published · Free</span></div>`;
  }
  $("#pc-form") && $("#pc-form").addEventListener("submit", e => { e.preventDefault(); coursePricing(e.target.q.value.trim()); });
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-course]"); if (!f) return; e.preventDefault();
    if (DEMO) return toast("Demo: nothing was saved");
    const free = f.querySelector("input[type=radio]:checked").value === "1", price = Number(f.price.value || 0);
    if (!free && price < 1000) return toast("Paid courses cost at least UGX 1,000.", true);
    if (await act(() => post(`/admin/courses/${f.dataset.course}/pricing`, { is_free: free, price_ugx: free ? 0 : price }), free ? "Course is now free." : "Course is now paid.")) coursePricing($("#pc-form").q.value.trim());
  });

  /* ================================================================ FLAGS */
  async function flags() {
    const box = $("#fl-list");
    const rows = await act(() => api("/admin/flags"));
    if (!rows) { box.innerHTML = `<p class="ac-empty">Flags could not load.</p>`; return; }
    box.innerHTML = rows.length ? rows.map(f => `<form class="ac-item sm" data-flag="${esc(f.key)}"><div class="ac-item-main"><b><code>${esc(f.key)}</code></b>${f.description ? `<small class="muted"> · ${esc(f.description)}</small>` : ""}<br><small class="muted">updated ${when(f.updated_at)} EAT</small></div>
      <div class="ac-item-side ac-row"><label class="ac-switch"><input type="checkbox" name="on" ${f.enabled ? "checked" : ""}><span>${f.enabled ? "On" : "Off"}</span></label>
      <label class="field ac-num"><span>Rollout %</span><input name="rollout" type="number" min="0" max="100" value="${esc(f.rollout_pct)}"></label><button class="btn sm ink" type="submit">Save</button></div></form>`).join("")
      : `<div class="ac-empty-card"><b>No feature flags yet.</b><span class="ac-eg">e.g. market.rfq · on · 100%</span></div>`;
  }
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-flag]"); if (!f) return; e.preventDefault();
    if (DEMO) return toast("Demo: nothing was saved");
    if (await act(() => post("/admin/flags", { key: f.dataset.flag, enabled: f.on.checked, rollout_pct: Number(f.rollout.value || 0) }), "Flag saved (before → after is in the audit log).")) flags();
  });
  $("#fl-form") && $("#fl-form").addEventListener("submit", async e => {
    e.preventDefault(); if (DEMO) return toast("Demo: nothing was saved");
    const f = e.target; if (await act(() => post("/admin/flags", { key: f.key.value.trim(), enabled: false, rollout_pct: Number(f.rollout.value || 100) }), "Flag added (off).")) { f.reset(); flags(); }
  });

  /* ================================================================ AUDIT */
  const AU = { action: "", table: "", actor: "", offset: 0, limit: 50 };
  const short = v => { const s = typeof v === "object" ? JSON.stringify(v) : String(v); return s.length > 60 ? s.slice(0, 57) + "…" : s; };
  function diff(o, n) {
    o = o || {}; n = n || {};
    const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter(k => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && !/^(updated_at|created_at)$/.test(k));
    if (!keys.length) return '<span class="muted">—</span>';
    return keys.slice(0, 8).map(k => `<div class="ac-diff"><b>${esc(k)}</b> <s>${esc(o[k] === undefined ? "∅" : short(o[k]))}</s> → <ins>${esc(n[k] === undefined ? "∅" : short(n[k]))}</ins></div>`).join("") + (keys.length > 8 ? `<small class="muted">+${keys.length - 8} more</small>` : "");
  }
  async function audit() {
    const tb = $("#au-table tbody");
    const d = await act(() => api("/admin/audit-log" + qs(AU)));
    if (!d) { tb.innerHTML = `<tr><td colspan="4" class="ac-empty">${failed("The audit log could not load.")}</td></tr>`; return; }
    tb.innerHTML = (d.items || []).length ? d.items.map(r => `<tr><td><small>${when(r.created_at)}</small></td>
      <td><b>${esc(r.actor_name || r.actor_id || "system")}</b><br><small class="muted">${esc(r.actor_role || "")}</small></td>
      <td><code>${esc(r.action)}</code><br><small class="muted">${esc(r.table_name)}${r.record_id ? " · " + esc(String(r.record_id).slice(0, 40)) : ""}</small></td>
      <td>${diff(r.old_data, r.new_data)}${r.context && Object.keys(r.context).length ? `<small class="muted ac-ctx">${esc(short(r.context))}</small>` : ""}</td></tr>`).join("")
      : `<tr><td colspan="4"><div class="ac-empty-card"><b>No entries match.</b><span class="ac-eg">e.g. admin.review_approve · submissions · status pending → approved</span></div></td></tr>`;
    pager($("#au-pager"), d.total, AU, audit);
  }
  $("#au-form") && $("#au-form").addEventListener("submit", e => { e.preventDefault(); const f = e.target; Object.assign(AU, { action: f.action.value.trim(), table: f.table.value.trim(), actor: f.actor.value.trim(), offset: 0 }); audit(); });

  /* ======================================================== SUPPORT VIEW */
  const SV_KEY = "cc_admin_support_view";
  const svGet = () => { try { const s = JSON.parse(sessionStorage.getItem(SV_KEY) || "null"); return s && new Date(s.expires_at) > new Date() ? s : null; } catch (e) { return null; } };
  let svTimer = null;
  function svBar() {
    const s = svGet(), bar = $("#ac-support-bar");
    clearInterval(svTimer);
    if (!s) { bar.hidden = true; return; }
    const paint = () => {
      const left = Math.max(0, new Date(s.expires_at) - Date.now()); if (!left) { sessionStorage.removeItem(SV_KEY); svBar(); support(); return; }
      bar.innerHTML = `${icon("lock")}<b>READ-ONLY SUPPORT VIEW</b> of ${esc(s.name || s.target)} · ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, "0")} left · <a href="#support">Open</a> <button class="btn sm" type="button" data-sv-end>End view</button>`;
    };
    bar.hidden = false; paint(); svTimer = setInterval(paint, 1000);
  }
  async function support() {
    const box = $("#sv-body"), s = svGet();
    if (!s) { box.innerHTML = `<div class="ac-empty-card"><b>No support view open.</b><span>Open a person in Users &amp; roles and choose “Open their dashboard”.</span></div>`; return; }
    box.innerHTML = `<p class="muted">Loading…</p>`;
    const d = await act(() => api("/admin/support-view/" + s.id));
    if (!d) { box.innerHTML = `<p class="ac-empty">This view has ended. Start a new one from Users &amp; roles.</p>`; sessionStorage.removeItem(SV_KEY); svBar(); return; }
    const p = d.profile || {}, list = (rows, f, empty) => rows && rows.length ? `<ul class="ac-kv">${rows.map(f).join("")}</ul>` : `<p class="muted">${empty}</p>`;
    box.innerHTML = `<div class="ac-sv card ac-card" aria-label="Read-only copy of ${esc(p.display_name || "")}'s dashboard">
      <div class="ac-sv-ribbon">${icon("lock")}Read-only · reason: ${esc(d.session && d.session.reason)}</div>
      <div class="ac-person"><span class="ac-av" aria-hidden="true">${esc((p.display_name || "?").slice(0, 1).toUpperCase())}</span><div><h3>${esc(p.display_name || p.username || "")}</h3>
        <p class="muted">${esc(p.email_masked || "")} · ${esc(roleName(d.role))} · ${esc(p.account_status || "")}${p.is_minor ? " · under 18" : ""}</p></div></div>
      <div class="ac-tiles sm">${tile("Learner plan", (d.plans && d.plans.learner) || "free")}${tile("Tutor plan", (d.plans && d.plans.tutor) || "free")}${tile("Unread notices", d.notifications_unread, "0 means all read")}${tile("Guardian", d.guardian ? d.guardian.state : "—")}</div>
      <div class="ac-grid2"><div><h4>COURSES THEY TAKE</h4>${list(d.enrollments, e => `<li><span>${esc(e.course)}</span><b>${num(e.progress_pct)}%</b></li>`, "No courses yet (a new account shows zeros).")}</div>
        <div><h4>COURSES THEY TEACH</h4>${list(d.courses_taught, c => `<li><span>${esc(c.title)} <small class="muted">${esc(c.status)}</small></span><b>${num(c.learners)}</b></li>`, "None.")}</div></div>
      <h4>THEIR SUBMISSIONS</h4>${list(d.submissions, x => `<li><span>${esc(x.title)} <small class="muted">${esc(x.kind)}</small></span><b>${esc(x.status)}</b></li>`, "None.")}</div>`;
  }
  document.addEventListener("submit", async e => {
    const f = e.target.closest("[data-support]"); if (!f) return; e.preventDefault();
    if (DEMO) return toast("Demo: nothing was saved");
    const r = await act(() => post("/admin/support-view", { target: f.dataset.support, reason: f.reason.value.trim(), ...(f.ticket.value.trim() ? { ticket: f.ticket.value.trim() } : {}) }));
    if (!r) return;
    sessionStorage.setItem(SV_KEY, JSON.stringify({ id: r.id, target: r.target_id, name: f.dataset.name, expires_at: r.expires_at }));
    closeDrawer(); svBar(); loaded.support = true; location.hash = "#support"; support();
  });
  document.addEventListener("click", async e => {
    if (!e.target.closest("[data-sv-end]")) return;
    const s = svGet(); sessionStorage.removeItem(SV_KEY); svBar();
    if (s && !DEMO) await act(() => api("/admin/support-view/" + s.id, { method: "DELETE" }), "Support view ended.");
    support();
  });

  const PANELS = { overview, approvals, events: eventsReview, users, admins, plans: () => { plans(); coursePricing(""); }, flags, audit, support, tools: () => {} };

  /* ================================================================= DEMO */
  const DEMO_DATA = {
    "/admin/stats": { members_total: 3, members_pending: 1, learners: 2, tutors: 1, guests: 1, minors: 1, submissions_pending: 2, submissions_high_risk: 1, admins: 1, gross_ugx_30d: 0, active_subscriptions: 0, support_views_7d: 0,
      submissions_by_kind: { course: 1, link: 1 }, decided_7d: 0, plans: { "learner:free": 3 }, guardian_pending: 1, admins_suspended: 0, courses_published: 0, courses_paid: 0, enrollments_total: 0, flags_open: 0, generated_at: new Date().toISOString() },
    "/admin/approvals": { total: 2, counts: { course: 1, link: 1 }, items: [
      { id: "00000000-0000-4000-8000-000000000001", kind: "link", title: "DEMO · Free JavaScript book", summary: "Sample row", status: "pending", risk_level: "high", urls: ["https://bit.ly/demo"], risk_flags: [{ url: "https://bit.ly/demo", code: "shortener", level: "high", detail: "hides the real destination" }], version: 1, payload: { note: "demo" }, created_at: new Date().toISOString(), submitter: { display_name: "Demo Learner" } },
      { id: "00000000-0000-4000-8000-000000000002", kind: "course", title: "DEMO · Intro to Python", summary: "Sample row", status: "pending", risk_level: "low", urls: ["https://www.youtube.com/watch?v=rfscVS0vtbw"], risk_flags: [{ url: "https://www.youtube.com/watch?v=rfscVS0vtbw", code: "youtube_ok", level: "low" }], version: 1, payload: { modules: 3, lessons: 12 }, created_at: new Date().toISOString(), submitter: { display_name: "Demo Tutor" } }] },
    "/admin/events/pending": { total: 1, limit: 20, offset: 0, details_available: true, items: [
      { id: "00000000-0000-4000-8000-0000000000e1", title: "DEMO · Kampala AI meetup", organiser: "other", mode: "physical", venue: "Sample venue", city: "Kampala", starts_at: new Date(Date.now() + 7 * 864e5).toISOString(), ends_at: null,
        link: "https://example.org/demo-event", price_text: "Free", event_type: "meetup", description: "Sample row", contact_email: null, submitted_at: new Date().toISOString(), status: "pending_review", submitter: { id: "user_demo", display_name: "Demo Learner" } }] },
    "/admin/people": { total: 1, items: [{ id: "user_demo", display_name: "Demo Learner", email: "demo@example.com", role: "learner", roles: ["learner"], account_status: "active", is_minor: false, learner_plan: "free", tutor_plan: "free", created_at: new Date().toISOString() }] },
    "/admin/admins": { admins: [{ user_id: "user_root", display_name: "101 Codecrafts", email: "101codecrafts@gmail.com", is_root: true, scopes: [], status: "active" }], invites: [] },
    "/admin/plans": { available: false }, "/admin/courses/pricing": [], "/admin/flags": [], "/admin/audit-log": { total: 0, items: [] },
  };
  function demoApi(path, opts) {
    if (opts && opts.method && opts.method !== "GET") return Promise.reject(new Error("Demo: nothing was saved"));
    const k = Object.keys(DEMO_DATA).find(p => path === p || path.startsWith(p + "?"));
    return Promise.resolve(k ? JSON.parse(JSON.stringify(DEMO_DATA[k])) : null);
  }

  /* ================================================================= BOOT */
  async function acceptInvite(token) {
    try { await post("/admin/invites/accept", { token }); history.replaceState(null, "", "admin.html"); gate("accepted"); }
    catch (e) {
      if (e.status === 401) { location.href = authUrl(); return; }
      const d = describe(e, true);
      if (["network", "schema", "server", "upstream", "ratelimited", "mfa", "reverify"].includes(d.kind)) return gate(d.kind, d.text);
      gate("denied", e.serverMessage || "This invite could not be accepted.");
    }
  }
  async function boot() {
    if (STATIC) { gate("nobackend", "Static mockup mode: the console shows real data only."); return; }
    const m = location.hash.match(/^#accept=([0-9a-f]{64})$/);
    if (m) return acceptInvite(m[1]);
    try { ME = await api("/admin/me"); }
    catch (e) {
      if (e.code === "no_backend" || (window.CC_NO_BACKEND && window.CC_NO_BACKEND())) return gate("nobackend");
      const d = describe(e, false);
      if (d.kind === "signin") return gate("signin");
      if (d.kind === "nobackend" || d.kind === "notfound") return gate("nobackend", "The admin API is not deployed on this copy yet. Nothing here is invented.");
      if (d.kind === "denied") return gate("denied");
      if (d.kind === "invalid") return gate("server");
      return gate(d.kind, d.kind === "schema" || d.kind === "server" ? null : undefined);
    }
    if (!ME || !ME.is_admin) return gate("denied");
    DEMO = params.get("demo") === "1";
    $("#ac-demo-bar").hidden = !DEMO;
    $("#ac-me").hidden = false;
    $("#ac-role").innerHTML = ME.is_root ? `${icon("shield")}ROOT ADMIN` : `${icon("shieldc")}ADMIN`;
    $("#ac-scopes").innerHTML = ME.is_root ? '<span class="ac-scope all">Every permission</span>' : scopeChips(ME.scopes);
    $("#ac-kicker").textContent = ME.is_root ? "Root admin console" : "Admin console";
    $$("#ac-tabs [data-scope]").forEach(a => { a.hidden = !can(a.dataset.scope); });
    $$('.sbar .sb-nav a[href^="admin.html#"]').forEach(a => { const t = $(`#ac-tabs [data-tab="${a.getAttribute("href").split("#")[1]}"]`); if (t && t.hidden) a.hidden = true; });
    $("#main").setAttribute("aria-busy", "false");
    svBar(); route();
    addEventListener("hashchange", route);
  }
  window.CCAdminErrors = { describe };   // unit tests (tests/admin-errors.test.mjs)
  window.CCAdminEvents = { card: evCard, dates: evDates, REASON_MAX: EV_REASON_MAX };   // unit tests (tests/r12-events-review.test.mjs)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true }); else boot();
})();
