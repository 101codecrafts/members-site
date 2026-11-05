/* 101 AI floating assistant (loaded by js/ai.js after load). Draggable launcher (pointer events) that snaps to the nearest side,
   stays in the viewport and clear of the top bar, cookie banner, view-settings button and fixed sidebar; position in
   localStorage.cc_ai_pos (transform only: no layout shift). Dialog with focus trap + Esc; bottom sheet under 600px.
   Streams from POST /api/v1/assistant (server-side key, free models). Safe markdown via DOM nodes; history in sessionStorage.
   Round 8: the launcher is the AIMascot (js/ai-mascot.min.js, loaded first by js/ai.js): it rests as the 101 logo and morphs into
   the robot on hover/focus and every ~25 s. A second robot sits in the panel header: wave + hop on open, thinking while waiting,
   listening / talking (lip-sync) through AIVoice.bindMascot, and a gesture per reply. Voice (js/ai-voice.min.js + ai-voice-ui.min.js)
   lazy-loads on first open: speaker toggle in the header, mic in the form. */
(function () {
  if (window.CC_AI) return; window.CC_AI = 1;
  var d = document, html = d.documentElement, b = d.body, LS = localStorage, SS = sessionStorage, SRC = (d.currentScript && d.currentScript.src) || "js/ai-float.js";
  var API = ((window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api").replace(/\/$/, "") + "/v1/assistant";
  var WA = "https://chat.whatsapp.com/LwXmmJK0ujN6hp4Zh6lhzh", S = 56, M = 12, MAXQ = 4000;
  var STARTERS = ["What is 101 Codecrafts?", "Explain recursion with a Python example", "Help me plan a week of study", "How do I join?"];
  var NOAPI = "101 AI isn't switched on for this version of the site yet. Meanwhile, ask in the [WhatsApp community](" + WA + ").";
  var OFFLINE = "I can't reach 101 AI from here. Check your internet connection, then tap **Try again**.";
  var UNAVAIL = "101 AI can't answer right now. Try again in a minute.";
  var QUOTA = "101 AI has used today's free AI allowance. It resets at 03:00 Kampala time. Until then, ask in the [WhatsApp community](" + WA + ").";
  /* ai error text: maps a failed /v1/assistant response to what the user sees (round 12 QA). The "free AI allowance" copy
     appears ONLY for the server's machine code ai_quota; any other 5xx is "can't answer right now" with Try again. */
  function errInfo(status, j) {
    var e = (j && j.error) || {}, code = typeof e === "string" ? e : e.code, m = typeof e === "string" ? "" : (e.message || "");
    if (code === "ai_quota") return { text: m || QUOTA, retry: false, quota: true };
    if (status === 404 || status === 405) return { text: NOAPI, retry: false };
    if (status === 429 || (status >= 400 && status < 500 && code === "bad_request")) return { text: m || UNAVAIL, retry: true };
    return { text: UNAVAIL, retry: true };
  }
  /* end ai error text */
  var rm = matchMedia("(prefers-reduced-motion: reduce)");

  var css = "#ai101{--a-bg:#f7f8f9;--a-card:#fff;--a-ink:#0B1236;--a-mut:#3e5d74;--a-line:#0B1236;--a-sh:#0B1236;--a-fsh:#fc8c0c;--a-fb:#0B1236;--a-link:#146c9f;--a-cy:#05e6f2;font:400 15px/1.5 var(--font-sans,\"CC Sans\",system-ui,sans-serif);color:var(--a-ink)}" +
    "html[data-theme=dark] #ai101{--a-bg:#111A45;--a-card:#0B1236;--a-ink:#F3F5FA;--a-mut:#C3CBE0;--a-line:#E8ECF5;--a-sh:#05e6f2;--a-fsh:#05e6f2;--a-fb:#E8ECF5;--a-link:#05e6f2}" +
    "#ai101 *{box-sizing:border-box}#ai101 [hidden]{display:none!important}" +
    ".ai-fab{position:fixed;left:0;top:0;z-index:1050;width:56px;height:56px;padding:0;margin:0;border:0;background:none;overflow:visible;cursor:grab;touch-action:none;-webkit-tap-highlight-color:transparent;will-change:transform;transition:transform .28s cubic-bezier(.2,.8,.2,1);--aim-sh:#03103A;--aim-floor:rgba(3,16,58,.18);--aim-ring:#03103A}" +
    "html[data-theme=dark] .ai-fab{--aim-sh:#022A78;--aim-floor:rgba(0,0,0,.35);--aim-ring:#2BE0DA}" +
    ".ai-bot{display:block;width:56px;height:56px;overflow:visible;pointer-events:none;transition:transform .15s}.ai-bot svg{overflow:visible;filter:drop-shadow(2px 2px 0 #03103A)}.ai-fab.ai-drag .ai-bot{transform:scale(1.08)}" +
    ".ai-fx{display:none;position:absolute;left:6px;top:6px;width:44px;height:44px;place-items:center;background:#0B1236;color:#fff;border:2px solid var(--a-fb);box-shadow:4px 4px 0 var(--a-fsh);pointer-events:none}.ai-fx svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:square}" +
    ".ai-fab[aria-expanded=true] .ai-bot,.ai-fab[aria-expanded=true] .ai-face{visibility:hidden}.ai-fab[aria-expanded=true] .ai-fx{display:grid}" +
    ".ai-fab.ai-drag{transition:none;cursor:grabbing}.ai-fab.ai-drag .ai-face{box-shadow:6px 6px 0 var(--a-fsh);transform:translate(-2px,-2px)}" +
    ".ai-face{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:#0B1236;border:2px solid var(--a-fb);box-shadow:4px 4px 0 var(--a-fsh);transition:transform .15s,box-shadow .15s;line-height:1}" +
    ".ai-fab:hover .ai-face{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--a-fsh)}.ai-fab:active .ai-face{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--a-fsh)}" +
    ".ai-n{font:400 18px/1 var(--font-brand-display,\"CC Display\",\"Archivo Black\",Impact,sans-serif);color:#05e6f2;letter-spacing:.5px}.ai-t{font:700 11px/1 var(--font-mono,\"CC Mono\",monospace);color:#fff;letter-spacing:2px;margin-top:4px}" +
    "#ai101 :focus-visible{outline:3px solid #00b9e6;outline-offset:2px}" +
    ".ai-panel{position:fixed;z-index:1051;display:flex;flex-direction:column;width:380px;background:var(--a-bg);border:2px solid var(--a-line);box-shadow:6px 6px 0 var(--a-sh);overflow:hidden}" +
    ".ai-head{display:flex;align-items:center;gap:4px;background:#0B1236;color:#fff;padding:6px 6px 6px 14px;border-bottom:2px solid var(--a-line)}.ai-head.ai-hb{padding-left:4px}" +
    ".ai-bot-h{flex:none;width:64px;height:64px;margin-right:4px;overflow:visible;pointer-events:none}.ai-bot-h svg{overflow:visible}@media (min-width:600px){.ai-bot-h{width:72px;height:72px}}@media (max-width:399.98px){.ai-head.ai-hb .ai-h p{display:none}}" +
    ".ai-h{flex:1;min-width:0}.ai-h h2{margin:0;font:400 18px/1.1 var(--font-brand-display,\"CC Display\",\"Archivo Black\",sans-serif);color:#fff;letter-spacing:.3px}.ai-h h2 span{color:#05e6f2}" +
    ".ai-h p{margin:2px 0 0;font:500 11px/1.3 var(--font-mono,\"CC Mono\",monospace);color:#C3CBE0;letter-spacing:.4px;text-transform:uppercase}" +
    ".ai-ib{width:44px;height:44px;display:grid;place-items:center;background:none;border:2px solid transparent;color:#fff;cursor:pointer;padding:0}.ai-ib:hover{border-color:#05e6f2}.ai-ib svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:square}" +
    ".ai-log{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:14px;display:flex;flex-direction:column;gap:10px}" +
    ".ai-intro p{margin:0 0 10px;color:var(--a-ink)}.ai-chips{display:flex;flex-wrap:wrap;gap:8px}" +
    ".ai-chip{min-height:44px;padding:8px 12px;background:var(--a-card);color:var(--a-ink);border:2px solid var(--a-line);box-shadow:3px 3px 0 var(--a-sh);font-weight:600;font-size:14px;line-height:1.2;font-family:inherit;cursor:pointer;text-align:left}.ai-chip:hover{transform:translate(-1px,-1px);box-shadow:4px 4px 0 var(--a-sh)}" +
    ".ai-m{max-width:92%;padding:9px 12px;border:2px solid var(--a-line);word-wrap:break-word;overflow-wrap:anywhere}.ai-m p{margin:0 0 6px}.ai-m p:last-child,.ai-m ul:last-child,.ai-m ol:last-child{margin-bottom:0}.ai-m ul,.ai-m ol{margin:0 0 6px;padding-left:20px}" +
    ".ai-u{align-self:flex-end;background:#05e6f2;color:#0B1236;box-shadow:3px 3px 0 var(--a-sh)}html[data-theme=dark] .ai-u{border-color:#05e6f2;box-shadow:3px 3px 0 #E8ECF5}" +
    ".ai-b{align-self:flex-start;background:var(--a-card);color:var(--a-ink)}.ai-b a{color:var(--a-link);text-decoration:underline;text-underline-offset:2px}.ai-b code{font:500 13px var(--font-mono,\"CC Mono\",monospace)}" +
    ".ai-b pre{margin:6px 0;position:relative;background:#0B1236;color:#F3F5FA;border:2px solid var(--a-line);overflow-x:auto;max-width:100%}.ai-b pre code{display:block;padding:10px 12px;font:500 12.5px/1.5 var(--font-mono,\"CC Mono\",monospace);white-space:pre;color:inherit}.ai-cp{position:absolute;top:4px;right:4px;min-height:28px;padding:2px 8px;font:700 11px var(--font-mono,\"CC Mono\",monospace);background:#05e6f2;color:#0B1236;border:2px solid #0B1236;cursor:pointer}.ai-lang{display:block;padding:4px 12px 0;font:700 10px var(--font-mono,\"CC Mono\",monospace);letter-spacing:1px;text-transform:uppercase;color:#05e6f2}" +
    ".ai-b h4{margin:8px 0 4px;font-size:15px;font-weight:700}.ai-b blockquote{margin:6px 0;padding-left:10px;border-left:3px solid var(--a-cy)}.ai-tw{overflow-x:auto;margin:6px 0}.ai-b table{border-collapse:collapse;font-size:13.5px}.ai-b th,.ai-b td{border:1px solid var(--a-line);padding:4px 8px;text-align:left;vertical-align:top}.ai-b th{font-weight:700}.ai-b hr{border:0;border-top:2px solid var(--a-line);margin:8px 0}.ai-math{font-family:\"Cambria Math\",\"STIX Two Math\",serif;white-space:nowrap}" +
    ".ai-retry{display:inline-block;margin-top:8px;min-height:36px;padding:4px 12px;font:700 13px inherit;background:var(--a-card);color:var(--a-ink);border:2px solid var(--a-line);box-shadow:2px 2px 0 var(--a-sh);cursor:pointer}" +
    ".ai-note{margin:0;padding:4px 12px 8px;font-size:11.5px;line-height:1.35;color:var(--a-mut);background:var(--a-bg)}.ai-note a{color:var(--a-link);text-decoration:underline}" +
    ".ai-e{border-style:dashed}.ai-dots::after{content:\"\";display:inline-block;width:8px;height:8px;margin-left:4px;background:var(--a-ink);animation:aiblink 1s steps(2) infinite}@keyframes aiblink{50%{opacity:0}}" +
    ".ai-form{display:flex;gap:8px;padding:10px;border-top:2px solid var(--a-line);background:var(--a-bg)}" +
    ".ai-form textarea{flex:1;min-height:44px;max-height:120px;resize:none;padding:10px 12px;border:2px solid var(--a-line);background:var(--a-card);color:var(--a-ink);font-weight:400;font-size:16px;line-height:1.4;font-family:inherit;border-radius:0}.ai-form textarea::placeholder{color:var(--a-mut);opacity:1}" +
    ".ai-send{width:48px;min-height:44px;background:#fc8c0c;color:#0B1236;border:2px solid var(--a-line);box-shadow:3px 3px 0 var(--a-sh);cursor:pointer;display:grid;place-items:center;padding:0}.ai-send svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2.6}.ai-send:disabled{opacity:.55;cursor:not-allowed}" +
    ".ai-note{margin:0;padding:0 10px 8px;font:500 11px/1.35 var(--font-mono,\"CC Mono\",monospace);color:var(--a-mut);background:var(--a-bg)}" +
    ".ai-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}" +
    ".ai-scrim{position:fixed;inset:0;z-index:1049;background:rgba(5,8,25,.55)}" +
    "@media (max-width:599.98px){.ai-panel{left:0!important;right:0;bottom:0;top:auto!important;width:auto;max-height:min(85vh,640px);height:85vh;border-width:2px 0 0;box-shadow:0 -4px 0 var(--a-sh)}}" +
    "@media (prefers-reduced-motion:reduce){.ai-fab,.ai-face,.ai-bot,.ai-chip{transition:none!important}.ai-dots::after{animation:none}}html.lite .ai-fab{transition:none}" +
    "@media print{#ai101{display:none!important}}";

  var I = { x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>', clr: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5"/></svg>',
    sw: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15l-4-4M20 16H5l4 4"/></svg>', go: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6"/></svg>' };
  var st = d.createElement("style"); st.id = "ai101-css"; st.textContent = css; d.head.appendChild(st);
  var root = d.createElement("div"); root.id = "ai101";
  root.innerHTML = '<button type="button" class="ai-fab" aria-label="Open 101 AI assistant" aria-haspopup="dialog" aria-expanded="false" aria-controls="ai-panel"><span class="ai-bot" aria-hidden="true"></span><span class="ai-face" aria-hidden="true" hidden><span class="ai-n">101</span><span class="ai-t">AI</span></span><span class="ai-fx" aria-hidden="true">' + I.x + '</span></button>' +
    '<div class="ai-scrim" hidden></div><section id="ai-panel" class="ai-panel" role="dialog" aria-modal="true" aria-labelledby="ai-title" hidden>' +
    '<div class="ai-head"><div class="ai-bot-h" aria-hidden="true" hidden></div><div class="ai-h"><h2 id="ai-title">101 <span>AI</span></h2><p>AI helper · not a person</p></div>' +
    '<button type="button" class="ai-ib ai-side">' + I.sw + '</button><button type="button" class="ai-ib ai-clr" aria-label="Clear the chat">' + I.clr + '</button><button type="button" class="ai-ib ai-x" aria-label="Close 101 AI">' + I.x + '</button></div>' +
    '<div class="ai-log" role="log" aria-label="Conversation with 101 AI" tabindex="0"></div><div class="ai-sr" aria-live="polite"></div>' +
    '<form class="ai-form"><label class="ai-sr" for="ai-in">Your question for 101 AI</label><textarea id="ai-in" rows="1" maxlength="' + MAXQ + '" placeholder="Ask a question…" enterkeyhint="send"></textarea><button type="submit" class="ai-send" aria-label="Send">' + I.go + '</button></form>' +
    '<p class="ai-note">You\'re chatting with an AI, not a person. It can make mistakes, so check important answers. Don\'t share personal details. <a href="ai-notice.html">AI notice</a></p>' +
    '<p class="ai-note">Free AI: answers can be wrong. Don\'t share personal details.</p></section>';
  b.appendChild(root);
  var q = function (s) { return root.querySelector(s); };
  var fab = q(".ai-fab"), panel = q(".ai-panel"), scrim = q(".ai-scrim"), log = q(".ai-log"), sr = q(".ai-sr[aria-live]"), form = q(".ai-form"), inp = q("#ai-in"), send = q(".ai-send"), side = q(".ai-side");

  /* ---------------- mascot (round 8) ---------------- */
  var AM = window.AIMascot, lm = null, hm = null, hbox = q(".ai-bot-h");
  try { if (AM) lm = AM.mount(q(".ai-bot"), { size: S, launcher: true, trigger: fab, label: "101 AI" }); } catch (e) { lm = null; }
  if (!lm) { q(".ai-bot").hidden = true; q(".ai-face").hidden = false; AM = null; }   /* fallback: the round-7 "101 AI" tile */
  else { hbox.hidden = false; q(".ai-head").classList.add("ai-hb"); }
  function hsize() { return (html.clientWidth || innerWidth) < 600 ? 64 : 72; }
  function V() { return window.AIVoice && window.AIVoice.ui ? window.AIVoice : null; }
  var bot = { setMouth: function (v) { if (hm) hm.setMouth(v); }, setState: function (v) { if (hm) hm.setState(v); } };   /* AIVoice.bindMascot target */
  function g(n, o) { if (!hm) return Promise.resolve(false); var h = hm; return h.gesture(n, o).then(function (ok) { return h === hm && ok; }, function () { return false; }); }
  function idleUnlessTalking() { var v = V(); if (hm && !(v && v.state() === "talking")) hm.setState(v && v.listening() ? "listening" : "idle"); }
  function react(qn, a, err) {   /* one gesture per reply */
    var h = (a || "").slice(0, 180);
    g(err ? "shrug" : /\b(?:can['’]?t|cannot|can not) (?:help|do|answer)\b|\bcan only (?:help|answer)\b|\bonly help with\b/i.test(h) ? "shake"
      : /\b(?:don['’]?t|do not) know\b|\bnot (?:been )?confirmed\b|\bisn['’]t confirmed\b/i.test(h) ? "shrug"
      : /\b(?:thanks|thank (?:you|u)|thx|cheers|webale|asante)\b/i.test(qn) ? "bow" : "nod");
  }
  /* view-settings "Background animation" changes cc_bg_motion in this tab (no storage event): re-read it */
  d.addEventListener("change", function (e) { if (e.target && e.target.id === "cc-bgm") setTimeout(function () { if (lm) lm.refreshMotion(); if (hm) hm.refreshMotion(); }, 0); }, true);
  var vload = 0;
  function loadVoice() {   /* lazy: first panel open only */
    if (vload) return; vload = 1;
    var add = function (f, cb) { var s = d.createElement("script"); s.src = new URL(f, SRC).href; s.async = true; s.onload = cb; s.onerror = function () {}; d.head.appendChild(s); };
    var wire = function () {
      var v = V(); if (!v) return;
      var spk = v.ui.speaker({ head: true }); if (spk) side.parentNode.insertBefore(spk, side);
      var mic = v.ui.mic({ input: inp, onFinal: function (t) { ask(t); }, onError: function (e) { if (e && e.message) g("shrug"); } }); if (mic) form.insertBefore(mic, send);
      v.bindMascot(bot);
    };
    if (window.AIVoice && window.AIVoice.ui) wire(); else if (window.AIVoice) add("ai-voice-ui.min.js", wire); else add("ai-voice.min.js", function () { add("ai-voice-ui.min.js", wire); });
  }

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
  function place() { var B = bounds(); put(pos.s === "l" ? B.l : B.r, B.t + (B.b - B.t) * pos.f); side.setAttribute("aria-label", "Move the 101 AI button to the " + (pos.s === "l" ? "right" : "left") + " side"); if (hm) hm.setSize(hsize()); if (!panel.hidden) layout(); }
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
  fab.addEventListener("click", function (e) { if (eat) { eat = false; e.preventDefault(); return; } toggle(!open); });
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
      if (AM) {   /* the launcher holds still while open; the header robot greets: wave + hop, then points at the input on the empty state */
        if (lm) lm.pin();
        try { hm = AM.mount(hbox, { size: hsize(), robot: true, label: "101 AI", point: "right" }); } catch (e) { hm = null; }
        if (V() && hm) hm.setState(V().listening() ? "listening" : V().state() === "talking" ? "talking" : "idle");
        g("wave").then(function (ok) { return ok && g("hop"); }).then(function (ok) { if (ok && !msgs.length && !busy) g("point"); });
      }
      loadVoice();
      log.scrollTop = log.scrollHeight;
      (matchMedia("(pointer:fine)").matches ? inp : q(".ai-x")).focus({ preventScroll: true });
    } else {
      panel.hidden = true; scrim.hidden = true; fab.hidden = false;
      if (V()) V().stop({ reset: true });
      if (hm) { hm.destroy(); hm = null; }
      fab.focus({ preventScroll: true });
      if (lm) lm.toLogo();   /* after focus: the focus-in morph is cancelled, so it settles as the logo */
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
    var w = el("div", "ai-intro"); w.appendChild(el("p", "", "Hi! I'm 101 AI. Ask me anything you're learning: coding, maths, science, writing, study plans, or about 101 Codecrafts. Paste a link and I can summarise it."));
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
  /* maths: $...$ / \(...\) shown as readable Unicode (no KaTeX download: it is ~350 KB with fonts) */
  var TEX = { "\\times": "×", "\\cdot": "·", "\\div": "÷", "\\pm": "±", "\\le": "≤", "\\leq": "≤", "\\ge": "≥", "\\geq": "≥", "\\neq": "≠", "\\ne": "≠", "\\approx": "≈", "\\infty": "∞", "\\pi": "π", "\\theta": "θ", "\\alpha": "α", "\\beta": "β", "\\lambda": "λ", "\\mu": "μ", "\\sigma": "σ", "\\Delta": "Δ", "\\sum": "Σ", "\\int": "∫", "\\rightarrow": "→", "\\to": "→", "\\Rightarrow": "⇒", "\\in": "∈", "\\degree": "°", "\\circ": "°", "\\%": "%", "\\,": " ", "\\;": " ", "\\quad": "  ", "\\left": "", "\\right": "", "\\text": "", "\\mathrm": "" };
  var SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "n": "ⁿ", "+": "⁺", "-": "⁻", "x": "ˣ", "i": "ⁱ" }, SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "n": "ₙ", "i": "ᵢ", "x": "ₓ" };
  function tex(t) {
    for (var k = 0; k < 4; k++) t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, function (_, a, b) { return (a.length > 1 ? "(" + a + ")" : a) + "/" + (b.length > 1 ? "(" + b + ")" : b); }).replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
    t = t.replace(/\\[A-Za-z]+|\\[,;%]/g, function (m) { return TEX[m] != null ? TEX[m] : m.slice(1); });
    t = t.replace(/\^\{([^{}]*)\}|\^(\S)/g, function (m, a, b) { var x = a != null ? a : b; return x.split("").every(function (c) { return SUP[c]; }) ? x.split("").map(function (c) { return SUP[c]; }).join("") : "^(" + x + ")"; });
    t = t.replace(/_\{([^{}]*)\}|_(\w)/g, function (m, a, b) { var x = a != null ? a : b; return x.split("").every(function (c) { return SUB[c]; }) ? x.split("").map(function (c) { return SUB[c]; }).join("") : "_" + x; });
    return t.replace(/[{}]/g, "");
  }
  /* safe markdown: paragraphs, ### headings, - / 1. lists, > quotes, --- rules, | tables |, ``` fenced code ```,
     **bold**, *italic*, `code`, $maths$, [text](https|mailto|page.html) and bare https links. DOM nodes only, never innerHTML. */
  var RX = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+|[a-z0-9-]+\.html(?:#[\w-]*)?)\)|(https?:\/\/[^\s<>()]*[^\s<>().,!?;:'"])|\$([^\s$][^$\n]{0,199}?[^\s$]|[^\s$])\$(?!\d)|\\\((.{1,200}?)\\\)|\*([^*\s][^*]*)\*)/g;
  function inline(p, s) {
    var i = 0, m; RX.lastIndex = 0;
    while ((m = RX.exec(s))) {
      if (m.index > i) p.appendChild(d.createTextNode(s.slice(i, m.index)));
      if (m[2]) p.appendChild(el("strong", "", m[2])); else if (m[3]) p.appendChild(el("code", "", m[3])); else if (m[9]) p.appendChild(el("em", "", m[9]));
      else if (m[7] != null || m[8] != null) p.appendChild(el("span", "ai-math", tex(m[7] != null ? m[7] : m[8])));
      else { var u = m[5] || m[6], a = el("a", "", m[4] || m[6]); a.href = u; if (/^https?:/.test(u)) { a.target = "_blank"; a.rel = "noopener noreferrer"; } p.appendChild(a); }
      i = RX.lastIndex;
    }
    if (i < s.length) p.appendChild(d.createTextNode(s.slice(i)));
  }
  function codeBlock(box, lang, lines) {
    var pre = box.appendChild(el("pre")), code = el("code", "", lines.join("\n"));
    if (lang) pre.appendChild(el("span", "ai-lang", lang.slice(0, 20)));
    pre.appendChild(code);
    var cp = el("button", "ai-cp", "Copy"); cp.type = "button"; cp.setAttribute("aria-label", "Copy code");
    cp.addEventListener("click", function () { var done = function () { cp.textContent = "Copied"; setTimeout(function () { cp.textContent = "Copy"; }, 1500); }; try { navigator.clipboard.writeText(code.textContent).then(done, function () {}); } catch (e) {} });
    pre.appendChild(cp);
  }
  function cells(line) { return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function (c) { return c.trim(); }); }
  function md(text, box) {
    box.textContent = ""; var p = null, l = null, fence = null, buf = [], rows = null;
    var lines = text.replace(/\r/g, "").split("\n");
    function flushTable() { if (!rows) return; var w = box.appendChild(el("div", "ai-tw")), t = w.appendChild(el("table")); rows.forEach(function (r, ri) { var tr = t.appendChild(el("tr")); r.forEach(function (c) { inline(tr.appendChild(el(ri ? "td" : "th")), c); }); }); rows = null; }
    lines.forEach(function (raw, idx) {
      var line = raw.replace(/\s+$/, "");
      if (fence !== null) { if (/^\s*```/.test(line)) { codeBlock(box, fence, buf); fence = null; buf = []; } else buf.push(raw); return; }
      var f = /^\s*```\s*([\w+#.-]*)/.exec(line); if (f) { flushTable(); fence = f[1] || ""; p = l = null; return; }
      if (/^\s*\|.*\|\s*$/.test(line)) { if (/^\s*\|?\s*:?-{2,}/.test(line.replace(/\|/g, "|"))) { if (/^[\s|:-]+$/.test(line)) return; } (rows = rows || []).push(cells(line)); p = l = null; return; }
      flushTable();
      var li = /^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(line);
      if (li && !/^\s*[-*_]{3,}\s*$/.test(line)) { var k = li[1] ? "OL" : "UL"; if (!l || l.tagName !== k) { l = box.appendChild(el(k)); if (li[1] && li[1] !== "1") l.start = +li[1]; } inline(l.appendChild(el("li")), li[2]); p = null; return; }
      l = null; if (!line.trim()) { p = null; return; }
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { box.appendChild(el("hr")); p = null; return; }
      var h = /^#{1,6}\s+(.*)$/.exec(line); if (h) { inline(box.appendChild(el("h4")), h[1]); p = null; return; }
      var q2 = /^>\s?(.*)$/.exec(line); if (q2) { var bq = box.lastChild && box.lastChild.tagName === "BLOCKQUOTE" ? box.lastChild : box.appendChild(el("blockquote")); if (bq.childNodes.length) bq.appendChild(el("br")); inline(bq, q2[1]); p = null; return; }
      if (p) p.appendChild(el("br")); else p = box.appendChild(el("p"));
      inline(p, line);
    });
    flushTable();
    if (fence !== null) codeBlock(box, fence, buf);   /* still streaming: show the open code block */
  }
  var busy = false, ctl = null;
  function setBusy(v) { busy = v; send.disabled = v; inp.setAttribute("aria-busy", String(v)); }
  async function ask(text) {
    text = (text || "").trim(); if (!text || busy) return;
    if (text.length > MAXQ) text = text.slice(0, MAXQ);
    var it = log.querySelector(".ai-intro .ai-chips"); if (it) it.remove();
    msgs.push({ role: "user", content: text }); bubble("user", text); keep(); inp.value = ""; grow(); setBusy(true);
    var v = V(); if (v) v.stop();   /* a new question stops the previous spoken reply */
    if (hm) hm.setState("thinking");
    var box = bubble("assistant", ""); box.classList.add("ai-dots"); box.setAttribute("aria-label", "101 AI is typing");
    var out = "", raf = 0, paint = function () { raf = 0; md(out, box); box.classList.add("ai-dots"); log.scrollTop = log.scrollHeight; };
    try {
      ctl = new AbortController(); var tm = setTimeout(function () { ctl.abort(); }, 60000);
      var r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/plain" }, credentials: "same-origin", signal: ctl.signal, body: JSON.stringify({ messages: msgs.slice(-12) }) });
      if (!r.ok || !r.body) { var ej = null; try { ej = await r.json(); } catch (x) {} var ei = errInfo(r.status, ej), er = new Error(ei.text); er.noRetry = !ei.retry; throw er; }
      var rd = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        var c = await rd.read(); if (c.done) break; var t = dec.decode(c.value, { stream: true }); out += t;
        if (t && hm && hm.__w !== box) { hm.__w = box; idleUnlessTalking(); }   /* first token: stop thinking */
        if (v && t) v.speak(t); if (!raf) raf = requestAnimationFrame(paint);
      }
      clearTimeout(tm); out = out.trim(); if (!out) throw new Error(UNAVAIL);
      if (v) v.speak("", { final: true });
      if (raf) cancelAnimationFrame(raf); md(out, box); msgs.push({ role: "assistant", content: out }); keep(); say(out); react(text, out, false);
    } catch (e) {
      if (raf) cancelAnimationFrame(raf); msgs.pop(); keep();
      var net = !e || e.name === "TypeError" || /fetch|network|load failed/i.test(e.message || ""), t = e && e.name === "AbortError" ? "That took too long, so I stopped waiting. Tap **Try again**." : net ? (navigator.onLine === false ? OFFLINE : UNAVAIL) : (e.message || UNAVAIL);
      box.classList.add("ai-e"); md(t, box); say(t);
      if (!(e && e.noRetry)) { var rt = el("button", "ai-retry", "Try again"); rt.type = "button"; rt.addEventListener("click", function () { if (busy) return; box.remove(); var ub = box.previousSibling; if (ub && ub.classList && ub.classList.contains("ai-u")) ub.remove(); ask(text); }); box.appendChild(rt); }
      if (v) { v.stop(); v.speak(t, { final: true }); }
      if (hm) { idleUnlessTalking(); react(text, t, true); }
    } finally { box.classList.remove("ai-dots"); box.removeAttribute("aria-label"); setBusy(false); ctl = null; log.scrollTop = log.scrollHeight; idleUnlessTalking(); }
  }
  function say(t) { sr.textContent = ""; setTimeout(function () { sr.textContent = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*`]/g, ""); }, 60); }
  function grow() { inp.style.height = "auto"; inp.style.height = Math.min(120, inp.scrollHeight + 4) + "px"; }
  inp.addEventListener("input", grow);
  inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(inp.value); } });
  form.addEventListener("submit", function (e) { e.preventDefault(); ask(inp.value); });
  q(".ai-clr").addEventListener("click", function () { if (ctl) ctl.abort(); if (V()) V().stop(); msgs = []; keep(); log.textContent = ""; intro(); inp.focus(); idleUnlessTalking(); g("point"); });
  window.CC_AI = { open: function () { toggle(true); }, close: function () { toggle(false); }, ask: ask, place: place, mascot: function () { return { launcher: lm, head: hm }; } };
})();
