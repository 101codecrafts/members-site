/* 101 AI floating assistant (loaded by js/ai.js after load). Draggable launcher (pointer events) that snaps to the nearest side,
   stays in the viewport and clear of the top bar, cookie banner, view-settings button and fixed sidebar; position in
   localStorage.cc_ai_pos (transform only: no layout shift). Dialog with focus trap + Esc; bottom sheet under 600px.
   Streams from POST /api/v1/assistant (server-side key, free models). Safe markdown via DOM nodes; history in sessionStorage. */
(function () {
  if (window.CC_AI) return; window.CC_AI = 1;
  var d = document, html = d.documentElement, b = d.body, LS = localStorage, SS = sessionStorage;
  var API = ((window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api").replace(/\/$/, "") + "/v1/assistant";
  var WA = "https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh", S = 56, M = 12, MAXQ = 600;
  var STARTERS = ["What is 101 Codecrafts?", "Is it free?", "How do I join?", "What courses are there?"];
  var BUSY = "101 AI is busy right now. Please try again in a few minutes, or ask in the [WhatsApp community](" + WA + ").";
  var NOAPI = "101 AI isn't switched on for this version of the site yet. Meanwhile, ask in the [WhatsApp community](" + WA + ").";
  var rm = matchMedia("(prefers-reduced-motion: reduce)");

  var css = "#ai101{--a-bg:#f7f8f9;--a-card:#fff;--a-ink:#0B1236;--a-mut:#3e5d74;--a-line:#0B1236;--a-sh:#0B1236;--a-fsh:#fc8c0c;--a-fb:#0B1236;--a-link:#146c9f;--a-cy:#05e6f2;font:400 15px/1.5 var(--font-sans,\"CC Sans\",system-ui,sans-serif);color:var(--a-ink)}" +
    "html[data-theme=dark] #ai101{--a-bg:#111A45;--a-card:#0B1236;--a-ink:#F3F5FA;--a-mut:#C3CBE0;--a-line:#E8ECF5;--a-sh:#05e6f2;--a-fsh:#05e6f2;--a-fb:#E8ECF5;--a-link:#05e6f2}" +
    "#ai101 *{box-sizing:border-box}#ai101 [hidden]{display:none!important}" +
    ".ai-fab{position:fixed;left:0;top:0;z-index:1050;width:56px;height:56px;padding:0;margin:0;border:0;background:none;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;will-change:transform;transition:transform .28s cubic-bezier(.2,.8,.2,1)}" +
    ".ai-fab.ai-drag{transition:none;cursor:grabbing}.ai-fab.ai-drag .ai-face{box-shadow:6px 6px 0 var(--a-fsh);transform:translate(-2px,-2px)}" +
    ".ai-face{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:#0B1236;border:2px solid var(--a-fb);box-shadow:4px 4px 0 var(--a-fsh);transition:transform .15s,box-shadow .15s;line-height:1}" +
    ".ai-fab:hover .ai-face{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--a-fsh)}.ai-fab:active .ai-face{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--a-fsh)}" +
    ".ai-n{font:400 18px/1 var(--font-brand-display,\"CC Display\",\"Archivo Black\",Impact,sans-serif);color:#05e6f2;letter-spacing:.5px}.ai-t{font:700 11px/1 var(--font-mono,\"CC Mono\",monospace);color:#fff;letter-spacing:2px;margin-top:4px}" +
    "#ai101 :focus-visible{outline:3px solid #00b9e6;outline-offset:2px}" +
    ".ai-panel{position:fixed;z-index:1051;display:flex;flex-direction:column;width:380px;background:var(--a-bg);border:2px solid var(--a-line);box-shadow:6px 6px 0 var(--a-sh);overflow:hidden}" +
    ".ai-head{display:flex;align-items:center;gap:4px;background:#0B1236;color:#fff;padding:6px 6px 6px 14px;border-bottom:2px solid var(--a-line)}" +
    ".ai-h{flex:1;min-width:0}.ai-h h2{margin:0;font:400 18px/1.1 var(--font-brand-display,\"CC Display\",\"Archivo Black\",sans-serif);color:#fff;letter-spacing:.3px}.ai-h h2 span{color:#05e6f2}" +
    ".ai-h p{margin:2px 0 0;font:500 11px/1.3 var(--font-mono,\"CC Mono\",monospace);color:#C3CBE0;letter-spacing:.4px;text-transform:uppercase}" +
    ".ai-ib{width:44px;height:44px;display:grid;place-items:center;background:none;border:2px solid transparent;color:#fff;cursor:pointer;padding:0}.ai-ib:hover{border-color:#05e6f2}.ai-ib svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:square}" +
    ".ai-log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:14px;display:flex;flex-direction:column;gap:10px}" +
    ".ai-intro p{margin:0 0 10px;color:var(--a-ink)}.ai-chips{display:flex;flex-wrap:wrap;gap:8px}" +
    ".ai-chip{min-height:44px;padding:8px 12px;background:var(--a-card);color:var(--a-ink);border:2px solid var(--a-line);box-shadow:3px 3px 0 var(--a-sh);font-weight:600;font-size:14px;line-height:1.2;font-family:inherit;cursor:pointer;text-align:left}.ai-chip:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 var(--a-sh)}" +
    ".ai-m{max-width:92%;padding:9px 12px;border:2px solid var(--a-line);word-wrap:break-word;overflow-wrap:anywhere}.ai-m p{margin:0 0 6px}.ai-m p:last-child,.ai-m ul:last-child,.ai-m ol:last-child{margin-bottom:0}.ai-m ul,.ai-m ol{margin:0 0 6px;padding-left:20px}" +
    ".ai-u{align-self:flex-end;background:#05e6f2;color:#0B1236;box-shadow:3px 3px 0 var(--a-sh)}html[data-theme=dark] .ai-u{border-color:#05e6f2;box-shadow:3px 3px 0 #E8ECF5}" +
    ".ai-b{align-self:flex-start;background:var(--a-card);color:var(--a-ink)}.ai-b a{color:var(--a-link);text-decoration:underline;text-underline-offset:2px}.ai-b code{font:500 13px var(--font-mono,\"CC Mono\",monospace)}" +
    ".ai-e{border-style:dashed}.ai-dots::after{content:\"\";display:inline-block;width:8px;height:8px;margin-left:4px;background:var(--a-ink);animation:aiblink 1s steps(2) infinite}@keyframes aiblink{50%{opacity:0}}" +
    ".ai-form{display:flex;gap:8px;padding:10px;border-top:2px solid var(--a-line);background:var(--a-bg)}" +
    ".ai-form textarea{flex:1;min-height:44px;max-height:120px;resize:none;padding:10px 12px;border:2px solid var(--a-line);background:var(--a-card);color:var(--a-ink);font-weight:400;font-size:16px;line-height:1.4;font-family:inherit;border-radius:0}.ai-form textarea::placeholder{color:var(--a-mut);opacity:1}" +
    ".ai-send{width:48px;min-height:44px;background:#fc8c0c;color:#0B1236;border:2px solid var(--a-line);box-shadow:3px 3px 0 var(--a-sh);cursor:pointer;display:grid;place-items:center;padding:0}.ai-send svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2.6}.ai-send:disabled{opacity:.55;cursor:not-allowed}" +
    ".ai-note{margin:0;padding:0 10px 8px;font:500 11px/1.35 var(--font-mono,\"CC Mono\",monospace);color:var(--a-mut);background:var(--a-bg)}" +
    ".ai-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
    ".ai-scrim{position:fixed;inset:0;z-index:1049;background:rgba(5,8,25,.55)}" +
    "@media (max-width:599.98px){.ai-panel{left:0!important;right:0;bottom:0;top:auto!important;width:auto;max-height:min(85vh,640px);height:85vh;border-width:2px 0 0;box-shadow:0 -4px 0 var(--a-sh)}}" +
    "@media (prefers-reduced-motion:reduce){.ai-fab,.ai-face,.ai-chip{transition:none!important}.ai-dots::after{animation:none}}html.lite .ai-fab{transition:none}" +
    "@media print{#ai101{display:none!important}}";

  var I = { x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>', clr: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5"/></svg>',
    sw: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15l-4-4M20 16H5l4 4"/></svg>', go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>' };
  var st = d.createElement("style"); st.id = "ai101-css"; st.textContent = css; d.head.appendChild(st);
  var root = d.createElement("div"); root.id = "ai101";
  root.innerHTML = '<button type="button" class="ai-fab" aria-label="Open 101 AI assistant" aria-haspopup="dialog" aria-expanded="false" aria-controls="ai-panel"><span class="ai-face" aria-hidden="true"><span class="ai-n">101</span><span class="ai-t">AI</span></span></button>' +
    '<div class="ai-scrim" hidden></div><section id="ai-panel" class="ai-panel" role="dialog" aria-modal="true" aria-labelledby="ai-title" hidden>' +
    '<div class="ai-head"><div class="ai-h"><h2 id="ai-title">101 <span>AI</span></h2><p>Ask about 101 Codecrafts</p></div>' +
    '<button type="button" class="ai-ib ai-side">' + I.sw + '</button><button type="button" class="ai-ib ai-clr" aria-label="Clear the chat">' + I.clr + '</button><button type="button" class="ai-ib ai-x" aria-label="Close 101 AI">' + I.x + '</button></div>' +
    '<div class="ai-log" role="log" aria-label="Conversation with 101 AI" tabindex="0"></div><div class="ai-sr" aria-live="polite"></div>' +
    '<form class="ai-form"><label class="ai-sr" for="ai-in">Your question for 101 AI</label><textarea id="ai-in" rows="1" maxlength="' + MAXQ + '" placeholder="Ask about 101 Codecrafts…" enterkeyhint="send"></textarea><button type="submit" class="ai-send" aria-label="Send">' + I.go + '</button></form>' +
    '<p class="ai-note">Free AI: answers can be wrong. Don\'t share personal details.</p></section>';
  b.appendChild(root);
  var q = function (s) { return root.querySelector(s); };
  var fab = q(".ai-fab"), panel = q(".ai-panel"), scrim = q(".ai-scrim"), log = q(".ai-log"), sr = q(".ai-sr[aria-live]"), form = q(".ai-form"), inp = q("#ai-in"), send = q(".ai-send"), side = q(".ai-side");

  /* ---------------- position ---------------- */
  var pos = { s: "r", f: 1 }, cur = { x: 0, y: 0 };
  try { var sp = JSON.parse(LS.cc_ai_pos || "null"); if (sp && /^[lr]$/.test(sp.s) && sp.f >= 0 && sp.f <= 1) pos = sp; } catch (e) {}
  var probe = d.createElement("div"); probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)"; root.appendChild(probe);
  function vis(e) { if (!e || e.hidden) return null; var r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null; var c = getComputedStyle(e); return c.visibility === "hidden" || c.display === "none" ? null : r; }
  function bounds(s) {
    var W = html.clientWidth || innerWidth, H = innerHeight, ps = getComputedStyle(probe), sa = function (k) { return parseFloat(ps["padding" + k]) || 0; };
    var left = M + sa("Left"), right = W - S - M - sa("Right"), top = Math.max(M + sa("Top"), H < 480 ? 64 : 120), bot = H - S - M - 4 - sa("Bottom");
    /* fixed top bars (sticky headers, promo) push the top edge down; the cookie banner lifts the bottom; a fixed sidebar moves the left edge */
    [].forEach.call(d.querySelectorAll(".topbar,.cc-promo,.promo,header"), function (e) { var r = vis(e); if (r && /fixed|sticky/.test(getComputedStyle(e).position) && r.top < H / 3) top = Math.max(top, r.bottom + M); });
    [].forEach.call(d.querySelectorAll(".app>.side,#sbar"), function (e) { var r = vis(e); if (r && r.left >= -1 && r.width < 420 && r.height > H * .7 && /fixed|sticky/.test(getComputedStyle(e).position)) left = Math.max(left, r.right + M); });
    if (right < left) right = left;
    var x = (s || pos.s) === "l" ? left : right;   /* bottom blockers in this side's column: cookie banner, view-settings button */
    [].forEach.call(d.querySelectorAll(".cc-cookie,.cc-toolbar:not(.docked),[data-ai-avoid]"), function (e) { var r = vis(e); if (r && r.top > H / 2 && r.left < x + S + M && r.right > x - M) bot = Math.min(bot, r.top - S - M - 4); });
    if (bot < top) { top = Math.max(M, Math.min(top, H - S - M)); bot = Math.max(top, H - S - M); }
    return { l: left, r: right, t: top, b: bot, W: W, H: H };
  }
  function put(x, y) { cur.x = x; cur.y = y; fab.style.transform = "translate3d(" + Math.round(x) + "px," + Math.round(y) + "px,0)"; }
  function place() { var B = bounds(); put(pos.s === "l" ? B.l : B.r, B.t + (B.b - B.t) * pos.f); side.setAttribute("aria-label", "Move the 101 AI button to the " + (pos.s === "l" ? "right" : "left") + " side"); if (!panel.hidden) layout(); }
  function save() { try { LS.cc_ai_pos = JSON.stringify(pos); } catch (e) {} }
  function snap() { var W = html.clientWidth || innerWidth; pos.s = cur.x + S / 2 < W / 2 ? "l" : "r"; var B = bounds(), y = Math.min(B.b, Math.max(B.t, cur.y)); pos.f = B.b > B.t ? Math.round((y - B.t) / (B.b - B.t) * 1000) / 1000 : 1; place(); save(); }
  fab.style.transition = "none"; place(); fab.offsetWidth; fab.style.transition = "";
  var rz = 0; function onRz() { clearTimeout(rz); rz = setTimeout(place, 120); }
  addEventListener("resize", onRz); addEventListener("orientationchange", onRz);
  new MutationObserver(onRz).observe(b, { childList: true });   /* cookie banner / promo come and go */

  /* drag (pointer events) */
  var drag = null, moved = false, eat = false;
  fab.addEventListener("pointerdown", function (e) { if (e.button > 0) return; drag = { x: e.clientX, y: e.clientY, l: cur.x, t: cur.y, id: e.pointerId }; moved = false; try { fab.setPointerCapture(e.pointerId); } catch (x) {} });
  fab.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && dx * dx + dy * dy > 36) { moved = true; fab.classList.add("ai-drag"); }
    if (moved) { var W = html.clientWidth || innerWidth; put(Math.max(0, Math.min(W - S, drag.l + dx)), Math.max(0, Math.min(innerHeight - S, drag.t + dy))); e.preventDefault(); }
  });
  function end(e) { if (!drag || (e && e.pointerId !== drag.id)) return; drag = null; if (moved) { fab.classList.remove("ai-drag"); eat = true; setTimeout(function () { eat = false; }, 50); snap(); } }
  fab.addEventListener("pointerup", end); fab.addEventListener("pointercancel", end);
  fab.addEventListener("click", function (e) { if (eat) { eat = false; e.preventDefault(); return; } toggle(true); });
  side.addEventListener("click", function () { pos.s = pos.s === "l" ? "r" : "l"; place(); save(); });

  /* ---------------- panel ---------------- */
  var open = false;
  function layout() {
    var B = bounds(); if (B.W < 600) { panel.style.cssText = ""; vv(); return; }
    var w = Math.min(380, B.W - 2 * M), h = Math.min(560, B.H - 2 * M), x = pos.s === "r" ? cur.x - w - M : cur.x + S + M;
    if (x < M || x + w > B.W - M) x = pos.s === "r" ? B.W - w - M : M;
    var y = Math.max(M, Math.min(B.H - h - M, cur.y + S - h));
    panel.style.cssText = "left:" + Math.round(x) + "px;top:" + Math.round(y) + "px;width:" + w + "px;height:" + h + "px";
  }
  function vv() { var v = window.visualViewport; if (!v || (html.clientWidth || innerWidth) >= 600 || panel.hidden) return; var k = Math.max(0, innerHeight - v.height - v.offsetTop); panel.style.bottom = k + "px"; panel.style.maxHeight = Math.min(640, (v.height) * .92) + "px"; }
  if (window.visualViewport) visualViewport.addEventListener("resize", vv);
  function mobile() { return (html.clientWidth || innerWidth) < 600; }
  function toggle(on) {
    if (on === open) { if (on) inp.focus(); return; } open = on;
    fab.setAttribute("aria-expanded", String(on)); fab.setAttribute("aria-label", on ? "Close 101 AI assistant" : "Open 101 AI assistant");
    if (on) {
      panel.hidden = false; layout(); if (mobile()) { scrim.hidden = false; fab.hidden = true; }
      if (!log.childNodes.length) intro();
      log.scrollTop = log.scrollHeight;
      (matchMedia("(pointer:fine)").matches ? inp : q(".ai-x")).focus({ preventScroll: true });
    } else {
      panel.hidden = true; scrim.hidden = true; fab.hidden = false;
      fab.focus({ preventScroll: true });
    }
  }
  q(".ai-x").addEventListener("click", function () { toggle(false); }); scrim.addEventListener("click", function () { toggle(false); });
  panel.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); toggle(false); return; }
    if (e.key !== "Tab") return;
    var f = [].filter.call(panel.querySelectorAll("button,textarea,a[href],[tabindex='0']"), function (x) { return !x.disabled && x.offsetParent !== null; });
    if (!f.length) return; var a = f[0], z = f[f.length - 1];
    if (e.shiftKey && d.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && d.activeElement === z) { e.preventDefault(); a.focus(); }
  });

  /* ---------------- messages ---------------- */
  var msgs = []; try { msgs = (JSON.parse(SS.cc_ai_msgs || "[]") || []).filter(function (m) { return m && /^(user|assistant)$/.test(m.role) && typeof m.content === "string"; }).slice(-20); } catch (e) {}
  function keep() { try { SS.cc_ai_msgs = JSON.stringify(msgs.slice(-20)); } catch (e) {} }
  function el(t, c, txt) { var e = d.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
  function intro() {
    var w = el("div", "ai-intro"); w.appendChild(el("p", "", "Hi! I'm 101 AI. Ask me about 101 Codecrafts: the community, courses, joining and more."));
    if (!msgs.length) { var c = el("div", "ai-chips"); STARTERS.forEach(function (s) { var x = el("button", "ai-chip", s); x.type = "button"; x.addEventListener("click", function () { ask(s); }); c.appendChild(x); }); w.appendChild(c); } log.appendChild(w); msgs.forEach(function (m) { bubble(m.role, m.content); });
  }
  function bubble(role, text, err) { var m = el("div", "ai-m " + (role === "user" ? "ai-u" : "ai-b") + (err ? " ai-e" : "")); if (role === "user") m.textContent = text; else md(text, m); log.appendChild(m); log.scrollTop = log.scrollHeight; return m; }
  /* safe markdown subset: paragraphs, - / 1. lists, **bold**, *italic*, `code`, [text](https|mailto|page.html) and bare https links */
  var RX = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+|[a-z0-9-]+\.html(?:#[\w-]*)?)\)|(https?:\/\/[^\s<>()]*[^\s<>().,!?;:'"])|\*([^*\s][^*]*)\*)/g;
  function inline(p, s) {
    var i = 0, m; RX.lastIndex = 0;
    while ((m = RX.exec(s))) {
      if (m.index > i) p.appendChild(d.createTextNode(s.slice(i, m.index)));
      if (m[2]) p.appendChild(el("strong", "", m[2])); else if (m[3]) p.appendChild(el("code", "", m[3])); else if (m[7]) p.appendChild(el("em", "", m[7]));
      else { var u = m[5] || m[6], a = el("a", "", m[4] || m[6]); a.href = u; if (/^https?:/.test(u)) { a.target = "_blank"; a.rel = "noopener noreferrer"; } p.appendChild(a); }
      i = RX.lastIndex;
    }
    if (i < s.length) p.appendChild(d.createTextNode(s.slice(i)));
  }
  function md(text, box) {
    box.textContent = ""; var p = null, l = null;
    text.replace(/\r/g, "").split("\n").forEach(function (raw) {
      var line = raw.replace(/\s+$/, ""), li = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
      if (li) { var k = li[1] ? "OL" : "UL"; if (!l || l.tagName !== k) l = box.appendChild(el(k)); inline(l.appendChild(el("li")), li[2]); p = null; return; }
      l = null; if (!line.trim()) { p = null; return; }
      line = line.replace(/^#{1,6}\s+/, "").replace(/^>\s?/, "");
      if (p) p.appendChild(el("br")); else p = box.appendChild(el("p"));
      inline(p, line);
    });
  }
  var busy = false, ctl = null;
  function setBusy(v) { busy = v; send.disabled = v; inp.setAttribute("aria-busy", String(v)); }
  async function ask(text) {
    text = (text || "").trim(); if (!text || busy) return;
    if (text.length > MAXQ) text = text.slice(0, MAXQ);
    var it = log.querySelector(".ai-intro .ai-chips"); if (it) it.remove();
    msgs.push({ role: "user", content: text }); bubble("user", text); keep(); inp.value = ""; grow(); setBusy(true);
    var box = bubble("assistant", ""); box.classList.add("ai-dots"); box.setAttribute("aria-label", "101 AI is typing");
    var out = "", raf = 0, paint = function () { raf = 0; md(out, box); box.classList.add("ai-dots"); log.scrollTop = log.scrollHeight; };
    try {
      ctl = new AbortController(); var tm = setTimeout(function () { ctl.abort(); }, 60000);
      var r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/plain" }, credentials: "same-origin", signal: ctl.signal, body: JSON.stringify({ messages: msgs.slice(-8) }) });
      if (!r.ok || !r.body) { var em = ""; try { em = ((await r.json()).error || {}).message || ""; } catch (x) {} if (r.status === 404 || r.status === 405) em = NOAPI; throw new Error(em || BUSY); }
      var rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) { var c = await rd.read(); if (c.done) break; out += dec.decode(c.value, { stream: true }); if (!raf) raf = requestAnimationFrame(paint); }
      clearTimeout(tm); out = out.trim(); if (!out) throw new Error(BUSY);
      if (raf) cancelAnimationFrame(raf); md(out, box); msgs.push({ role: "assistant", content: out }); keep(); say(out);
    } catch (e) {
      if (raf) cancelAnimationFrame(raf); msgs.pop(); keep();
      var t = e && e.name !== "AbortError" && e.message && !/fetch|network|load failed/i.test(e.message) ? e.message : BUSY;
      box.classList.add("ai-e"); md(t, box); say(t);
    } finally { box.classList.remove("ai-dots"); box.removeAttribute("aria-label"); setBusy(false); ctl = null; log.scrollTop = log.scrollHeight; }
  }
  function say(t) { sr.textContent = ""; setTimeout(function () { sr.textContent = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*`]/g, ""); }, 60); }
  function grow() { inp.style.height = "auto"; inp.style.height = Math.min(120, inp.scrollHeight + 4) + "px"; }
  inp.addEventListener("input", grow);
  inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(inp.value); } });
  form.addEventListener("submit", function (e) { e.preventDefault(); ask(inp.value); });
  q(".ai-clr").addEventListener("click", function () { if (ctl) ctl.abort(); msgs = []; keep(); log.textContent = ""; intro(); inp.focus(); });
  window.CC_AI = { open: function () { toggle(true); }, close: function () { toggle(false); }, ask: ask, place: place };
})();
