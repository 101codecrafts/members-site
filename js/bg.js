/* Animated site background, both themes (fix/bg-glyphs, 5 Nov 2026; light used to be the static CSS grid only).
   Canvas with drifting code glyphs (navy ink in light; dark adds "+" marks): OffscreenCanvas in a Worker at 20fps (DPR <= 1.5), main-thread fallback.
   Starts after the load event; pauses while the tab is hidden; reduced motion, data saver / Lite or the "Reduced" setting = one still frame;
   "Off" (localStorage.cc_bg_motion) = no canvas. Live theme switches start/stop it without a reload. Never in ?static=1.
   EVERY page gets the canvas (round 11, founder): legal, /go and tool pages use the "quiet" type (fewer, slower, fainter glyphs). */
(function () {
  var d = document.documentElement, b = document.body;
  if (!b || d.classList.contains("static")) return;
  var page = b.dataset.page || "", src = (document.currentScript && document.currentScript.src) || "js/bg.js";
  var QUIET = /^(terms|privacy|cookies|article|go|ide|problem|admin|interview|contest|whiteboard)$/;
  var TYPE = page === "landing" ? "landing" : /^(auth|signin|signup|onboarding|verify|join|guardian)$/.test(page) ? "auth" : /^(404|offline)$/.test(page) ? "err" :
    /^(guest|dashboard|courses|course|learn|practice|sessions|session|groups|card|cart|checkout|launchpad|announcements|orders|seller|rfq|product-item|product|projects|profile|settings|testing|tutor|settings-apps|aitools|contests|opportunities)$/.test(page) ? "app" : "mkt";
  if (QUIET.test(page)) TYPE = "quiet";
  var rm = matchMedia("(prefers-reduced-motion: reduce)"), cv = null, w = null, P = null, L = null, live = false, loaded = false;
  var mode = function () { var m = ""; try { m = localStorage.cc_bg_motion || ""; } catch (e) {} return m === "off" || m === "reduced" ? m : "on"; };
  var still = function () { var c = navigator.connection; return mode() === "reduced" || rm.matches || d.classList.contains("lite") || !!(c && c.saveData); };
  var want = function () { return loaded && !!TYPE && mode() !== "off"; };
  var size = function () { return { W: innerWidth, H: innerHeight, dpr: Math.min(devicePixelRatio || 1, 1.5), type: TYPE, still: still(), dark: d.dataset.theme === "dark" }; };

  /* text + occluder rects (viewport px). Text sitting straight on the page background is guarded (glyphs fade 20px before it);
     opaque cards/images only steer where glyphs respawn. Elements are picked on start and after DOM changes; rects re-read at <=10Hz on scroll. */
  var TXT = [], OCC = [], rt = 0, mt = 0, mo = null;
  function opaque(e) { var cs = getComputedStyle(e), c = cs.backgroundColor; return cs.backgroundImage !== "none" || (c && c !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(c)); }
  function scan() {
    if (!live) return;
    var wr = [b].concat([].slice.call(document.querySelectorAll(".page,.page>.tit,.app.dz,.shell,main,.solo-main"))), memo = new Map(), up = function (a) {
      if (!a || a === b) return true; if (memo.has(a)) return memo.get(a); var v = (wr.indexOf(a) >= 0 || !opaque(a)) && up(a.parentElement); memo.set(a, v); return v; }, onPage = function (e) { return up(e.parentElement); };
    /* every element that holds visible text directly (landing copy is absolutely placed divs/spans, not h1-p) */
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), n, seen = new Set(); TXT = [];
    while ((n = tw.nextNode()) && TXT.length < 260) { var e = n.parentElement; if (!e || seen.has(e) || !n.textContent.trim()) continue; seen.add(e);
      if (!e.closest("#ccbg,.sr-only,[hidden],script,style,noscript,svg,option,[aria-hidden=true]") && onPage(e)) TXT.push(e); }
    [].forEach.call(document.querySelectorAll("button,.btn,a.cta,[data-bg-quiet]"), function (e) { if (!seen.has(e) && TXT.length < 300 && onPage(e)) TXT.push(e); });
    OCC = [].slice.call(document.querySelectorAll("body section,body article,body aside,body header,body footer,body nav,body form,body figure,body img,body video,body table,body .card,body [class*=card]"))
      .filter(function (e) { return wr.indexOf(e) < 0 && (e.tagName === "IMG" || e.tagName === "VIDEO" || opaque(e)) && onPage(e); }).slice(0, 160);
    read();
  }
  var RG = document.createRange();
  function box(e, txt) { if (!txt) return e.getBoundingClientRect(); RG.selectNodeContents(e); var a = RG.getBoundingClientRect(), c = e.getBoundingClientRect();   /* text that overflows its box (split headings) counts too */
    var l = Math.min(a.left, c.left), t = Math.min(a.top, c.top); return { left: l, top: t, width: Math.max(a.right, c.right) - l, height: Math.max(a.bottom, c.bottom) - t, bottom: Math.max(a.bottom, c.bottom) }; }
  function rl(L, pad, max, txt) { var H = innerHeight, o = []; for (var i = 0; i < L.length && o.length < max; i++) { var q = box(L[i], txt);
      if (q.width > 1 && q.height > 1 && q.bottom > -24 && q.top < H + 24) o.push([q.left - pad, q.top - pad, q.width + 2 * pad, q.height + 2 * pad]); } return o; }
  function read() { rt = 0; if (!live) return; var t = rl(TXT, 0, 48, 1), o = rl(OCC, 0, 60); if (w) w.postMessage({ rects: t, occ: o }); else if (P) { P.rects(t, o); if (still() || document.hidden) L.once(); } }
  function poke() { if (live && !rt) rt = setTimeout(read, 100); }
  var rz = 0; function onResize() { clearTimeout(rz); rz = setTimeout(function () { if (!live) return; if (w) w.postMessage(size()); else if (P) { var s = size(); s.time = L.time(); P.setup(s); L.once(); } poke(); }, 250); }
  function onVis() { run(!document.hidden); }
  function run(on) { on = on && !still(); if (w) w.postMessage({ run: on }); else if (L) on ? L.start() : L.stop(); }

  function fallback() {   /* main-thread canvas, same painter */
    if (w) { w.terminate(); w = null; } if (cv) cv.remove();
    cv = mk(); var go = function () { if (!live) return; P = CCBGP(cv); L = CCBGL(P.frame, 20); var s = size(); P.setup(s); read(); L.once(); run(!document.hidden); };
    var ff = typeof FontFace === "function" ? new FontFace("CCBG Mono", "url(" + new URL("../assets/fonts/jetbrains-mono-var.woff2", src) + ")", { weight: "100 800" }) : null;
    var fl = ff ? ff.load().then(function (f) { document.fonts.add(f); }).catch(function () {}) : Promise.resolve();
    if (window.CCBGP) fl.then(go); else { var s = document.createElement("script"); s.src = new URL("bg-paint.js", src).href; s.onload = function () { fl.then(go); }; document.head.appendChild(s); }
  }
  function mk() { var c = document.createElement("canvas"); c.id = "ccbg"; c.setAttribute("aria-hidden", "true"); c.setAttribute("role", "presentation"); b.insertBefore(c, b.firstChild); return c; }
  function start() {
    live = true; cv = mk();
    if (cv.transferControlToOffscreen && window.Worker && !/[?&]noworker/.test(location.search)) {
      try {
        var off = cv.transferControlToOffscreen(); w = new Worker(new URL("bg-worker.js", src).href);
        w.onmessage = function (e) { if (e.data === "fallback" && live) fallback(); }; w.onerror = function () { if (live) fallback(); };
        var m = size(); m.canvas = off; m.fps = 20; w.postMessage(m, [off]);
      } catch (e) { fallback(); }
    } else fallback();
    scan(); setTimeout(scan, 1500);
    addEventListener("scroll", poke, { passive: true }); addEventListener("resize", onResize); document.addEventListener("visibilitychange", onVis);
    mo = new MutationObserver(function () { clearTimeout(mt); mt = setTimeout(scan, 400); }); mo.observe(b, { childList: true, subtree: true });
    if (w) run(!document.hidden);
  }
  function stop() {
    live = false; if (w) { w.terminate(); w = null; } if (L) L.stop(); P = L = null; if (cv) { cv.remove(); cv = null; }
    removeEventListener("scroll", poke); removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", onVis);
    if (mo) { mo.disconnect(); mo = null; } clearTimeout(rt); rt = 0; TXT = OCC = [];
  }
  function sync() { if (live) stop(); if (want()) start(); }
  /* label cut-outs: text that sits straight on the page and would drop under 4.5:1 (3:1 large) where two major grid lines cross it
     (light orange/link ink) gets a page-coloured patch, so the grid breaks around it like a label on a blueprint. Runs in both themes
     (dark has the headroom, so nothing qualifies there); no layout change (padding offset by negative margin). */
  var PARSE = function (c) { var m = /rgba?\(([^)]+)\)/.exec(c || ""); if (!m) return null; var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  var LUM = function (c) { var f = function (v) { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  var MIX = function (f, a, bg) { return [0, 1, 2].map(function (i) { return f[i] * a + bg[i] * (1 - a); }); };
  function cut() {
    [].forEach.call(document.querySelectorAll(".ccbg-cut"), function (e) { e.classList.remove("ccbg-cut"); });
    var hits = [];
    var base = PARSE(getComputedStyle(b).backgroundColor); if (!base || base[3] < 1) return;
    var dk = d.dataset.theme === "dark", ln = dk ? [238, 241, 248] : [11, 18, 54], la = dk ? .09 : .07, worst = MIX(ln, la, MIX(ln, la, base));
    if (dk) worst = MIX([5, 230, 242], .105, worst);
    b.style.setProperty("--ccbg-page", "rgb(" + base.slice(0, 3).join(",") + ")");
    var wl = LUM(worst), bl = LUM(base), seen = new Set(), memo = new Map(), wr = [].slice.call(document.querySelectorAll(".page,.page>.tit,.app.dz,main,.solo-main"));
    function onPage(e) { if (!e || e === b) return true; if (memo.has(e)) return memo.get(e); var v;
      if (wr.indexOf(e) >= 0) v = onPage(e.parentElement); else { var ac = getComputedStyle(e), bc = PARSE(ac.backgroundColor); v = !((bc && bc[3] > .05) || ac.backgroundImage !== "none") && onPage(e.parentElement); }
      memo.set(e, v); return v; }
    var tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), n;
    while ((n = tw.nextNode())) {
      var e = n.parentElement; if (!e || !n.textContent.trim() || seen.has(e)) continue; seen.add(e);
      if (e.closest("svg,script,style,noscript,option,select,textarea,.sr-only,[aria-hidden=true]")) continue;
      var cs = getComputedStyle(e), fg = PARSE(cs.color); if (!fg || cs.display === "none") continue;
      if (!onPage(e)) continue;
      var fl = LUM(MIX(fg, fg[3], worst)), cr = (Math.max(fl, wl) + .05) / (Math.min(fl, wl) + .05), fs = parseFloat(cs.fontSize), fw = parseInt(cs.fontWeight, 10) || 400;
      var need = (fs >= 24 || (fs >= 18.66 && fw >= 700)) ? 3 : 4.5, f0 = LUM(MIX(fg, fg[3], base)), c0 = (Math.max(f0, bl) + .05) / (Math.min(f0, bl) + .05);
      /* c0 < need: the text does not really sit on the page (something else paints behind it), so leave it alone */
      if (cr < need && c0 >= need) {
        if (cs.display === "inline") e.classList.add("ccbg-cut");
        else hits.push(e);   /* block/flex: patch only its text (wrapped in a span once), so the box itself is untouched */
      }
    }
    hits.forEach(function (e) { [].slice.call(e.childNodes).forEach(function (t) {
      if (t.nodeType === 1 && t.hasAttribute("data-ccbg-t")) t.classList.add("ccbg-cut");
      else if (t.nodeType === 3 && t.textContent.trim()) { var sp = document.createElement("span"); sp.setAttribute("data-ccbg-t", ""); sp.className = "ccbg-cut"; e.insertBefore(sp, t); sp.appendChild(t); } }); });
  }
  /* r13 seo (Q21 perf): each pass walks every text node with getComputedStyle; run them in idle time so they never sit in
     the load-time long tasks (same three passes as before: after parse, after load, 1.5 s later for late content). */
  var idle = function (f) { (window.requestIdleCallback || setTimeout)(f, { timeout: 800 }); };
  { idle(cut); addEventListener("load", function () { idle(cut); setTimeout(function () { idle(cut); }, 1500); }); }
  window.CC_BG = { info: function () { return { live: live, worker: !!w, text: rl(TXT, 0, 48, 1), occ: OCC.length }; }, sync: sync, mode: mode, set: function (m) { try { localStorage.cc_bg_motion = m; } catch (e) {} sync(); } };
  new MutationObserver(function () { setTimeout(cut, 260); if (live || want()) sync(); }).observe(d, { attributes: true, attributeFilter: ["data-theme"] });
  (rm.addEventListener ? rm.addEventListener.bind(rm, "change") : rm.addListener.bind(rm))(function () { if (live) sync(); });
  addEventListener("storage", function (e) { if (e.key === "cc_bg_motion") sync(); });
  var boot = function () { loaded = true; (window.requestIdleCallback || setTimeout)(sync, { timeout: 1200 }); };
  document.readyState === "complete" ? boot() : addEventListener("load", boot);
})();
