/* 101 section loops (round 9): quiet animated bands behind sections marked data-loop="name".
   Loops after Scenario's Motion Loops (https://www.scenario.com/explorations/motion-loops): each is draw(ctx,w,h,t,P),
   a pure function of t whose periods divide 12 s, so it loops with no seam. Code per loop in js/loops/<name>.js,
   fetched only when its section nears the viewport. Drawn in a Worker on an OffscreenCanvas (this same file; main-thread
   fallback), <= 20 fps, only while on screen and the tab is visible, DPR <= 1.5, sized by ResizeObserver.
   Reduced motion, Lite / data saver, cc_bg_motion "reduced" = one still frame; "off" = no canvas; ?static=1 = nothing;
   print hides it (css). Colours: theme tokens --lp-1/2/3 (flat fills), --lp-ol (outline + hard shadow) on the section;
   the band's strength is one flat css opacity (--lp-a) on the canvas, so the drawing itself stays fully opaque and flat.
   Look: Neo-Brutalist (101 brand) - flat fills, 3px navy outlines, hard offset shadows, square corners, snappy moves with holds. */
(function (W) {
  var TAU = Math.PI * 2, fr = function (x) { return x - Math.floor(x); }, cl = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var M = W.CCL = {                                      /* helpers for the loop files (the Scenario template's M.*, trimmed) */
    TAU: TAU, fr: fr, cl: cl,
    ph: function (t, p, o) { return fr((t + (o || 0)) / p); },
    win: function (p, a, b) { return cl((p - a) / (b - a)); },
    io: function (k) { return (1 - Math.cos(Math.PI * k)) / 2; },
    ob: function (k) { k -= 1; return 1 + 2.70158 * k * k * k + 1.70158 * k * k; },
    rand: function (i, s) { var x = Math.sin((i * 12.9898 + (s || 0) * 78.233 + .5) * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); },
    /* Neo-Brutalist block: hard offset shadow (no blur), flat fill, thick square-cornered navy outline. p is a Path2D. */
    bk: function (x, P, p, fill, o) {
      o = o == null ? 4 : o; x.lineJoin = "miter"; x.lineCap = "butt";
      if (o) { x.translate(o, o); x.fillStyle = P.ol; x.fill(p); x.translate(-o, -o); }
      if (fill) { x.fillStyle = fill; x.fill(p); }
      x.lineWidth = 3; x.strokeStyle = P.ol; x.stroke(p);
    },
    /* the same for a stroked line motif: shadow line, navy outline line, colour line on top */
    bl: function (x, P, p, col, lw) {
      x.lineJoin = "miter"; x.lineCap = "butt"; x.translate(3, 3); x.lineWidth = lw + 4; x.strokeStyle = P.ol; x.stroke(p); x.translate(-3, -3);
      x.stroke(p); x.lineWidth = lw; x.strokeStyle = col; x.stroke(p);
    },
    D: {}, def: function (n, f) { M.D[n] = f; if (M.on) M.on(); }
  };
  var S = [], G = { st: 0, off: 0, hid: 0 }, raf = 0, last = 0, t0 = 0, base = "", wk = typeof document == "undefined";
  var now = function () { return ((performance.now() - t0) / 1000) % 12; };
  var RAF = W.requestAnimationFrame ? W.requestAnimationFrame.bind(W) : function (f) { return setTimeout(function () { f(performance.now()); }, 50); };
  var CAF = W.cancelAnimationFrame ? W.cancelAnimationFrame.bind(W) : clearTimeout;
  function paint(s, t) {
    var x = s.x, k = s.k; if (!x || !M.D[s.n]) return;
    x.setTransform(k, 0, 0, k, 0, 0); x.clearRect(0, 0, s.w, s.h); x.globalAlpha = 1;
    x.save(); M.D[s.n](x, s.w, s.h, t % 12, s.P); x.restore();
  }
  function size(s) { s.c.width = Math.round(s.w * s.k); s.c.height = Math.round(s.h * s.k); s.dn = 0; }
  function kick() {                                     /* draw stills once; run the clock while any band is visible */
    var any = 0;
    S.forEach(function (s) { if (!s.x || !M.D[s.n] || G.off) return; if (G.st) { if (!s.dn) { paint(s, s.st); s.dn = 1; } } else if (s.vis) any = 1; });
    if (any && !G.hid) { if (!raf) raf = RAF(tick); } else if (raf) { CAF(raf); raf = 0; }
  }
  function tick(ts) {
    raf = RAF(tick); if (ts - last < 48) return; last = ts;          /* ~20 fps */
    var t = now(); S.forEach(function (s) { if (s.vis && s.x) paint(s, t); });
  }
  M.on = kick; t0 = performance.now();
  if (wk) {                                             /* worker side: messages from the page below */
    onmessage = function (e) {
      var m = e.data, s = S[m.id];
      if (m.g) { G = m.g; base = m.base || base; S.forEach(function (s) { s.dn = 0; }); }
      else if (m.c) { s = S[m.id] = m; s.x = m.c.getContext("2d"); size(s); if (!M.D[s.n]) try { importScripts(base + s.n + ".js"); } catch (x) {} }
      else if (s) { for (var k in m) s[k] = m[k]; if (m.w) size(s); if (m.P) s.dn = 0; }
      kick();
    };
    return;
  }
  var d = document, h = d.documentElement;
  if (h.classList.contains("static")) return;
  var els = [].slice.call(d.querySelectorAll("[data-loop]"));
  if (!els.length || !W.IntersectionObserver || !W.ResizeObserver) return;
  var src = (d.currentScript && d.currentScript.src) || "js/loops.js", rm = matchMedia("(prefers-reduced-motion: reduce)"), got = {}, worker = null;
  base = src.replace(/[^\/]*$/, "") + "loops/";
  try { if (W.Worker && W.OffscreenCanvas && HTMLCanvasElement.prototype.transferControlToOffscreen && !/[?&]noworker/.test(location.search)) worker = new Worker(src); } catch (e) {}
  var mode = function () { var m = ""; try { m = localStorage.cc_bg_motion || ""; } catch (e) {} return m == "off" || m == "reduced" ? m : "on"; };
  var post = function (m, tr) { worker.postMessage(m, tr || []); };
  var pal = function (s) { var cs = getComputedStyle(s.el), v = function (k, d) { return cs.getPropertyValue(k).trim() || d; }; return { c1: v("--lp-1", "#2BE0DA"), c2: v("--lp-2", "#FFA615"), c3: v("--lp-3", "#F7F8FA"), ol: v("--lp-ol", "#03103A") }; };
  function flags() { var c = navigator.connection, m = mode(); G = { st: m == "reduced" || rm.matches || h.classList.contains("lite") || !!(c && c.saveData) ? 1 : 0, off: m == "off" ? 1 : 0, hid: d.hidden ? 1 : 0 }; }
  function sync() {
    flags(); if (worker) post({ g: G, base: base });
    S.forEach(function (s) {
      if (s.near && !s.c && !G.off) mount(s);
      if (!s.c) return; s.c.hidden = !!G.off;
      if (worker) post({ id: s.i, vis: s.vis }); else s.dn = 0;
    });
    if (!worker) kick();
  }
  function mount(s) {
    var c = d.createElement("canvas"); c.className = "lp-cv"; c.setAttribute("aria-hidden", "true");
    if (getComputedStyle(s.el).position == "static") s.el.classList.add("lp-rel");
    s.el.classList.add("lp-on"); s.el.insertBefore(c, s.el.firstChild); s.c = c; s.P = pal(s); measure(s);
    if (worker) { var o = c.transferControlToOffscreen(); post({ id: s.i, c: o, n: s.n, P: s.P, w: s.w, h: s.h, k: s.k, st: s.st, vis: s.vis }, [o]); }
    else { s.x = c.getContext("2d"); size(s); if (!got[s.n]) { got[s.n] = 1; var j = d.createElement("script"); j.src = base + s.n + ".js"; j.async = true; d.head.appendChild(j); } }
    new ResizeObserver(function () { var w = s.w, hh = s.h, k = s.k; measure(s); if (s.w != w || s.h != hh || s.k != k) { if (worker) post({ id: s.i, w: s.w, h: s.h, k: s.k }); else { size(s); if (s.vis && !G.st) paint(s, now()); kick(); } } }).observe(s.el);
  }
  function measure(s) { var r = s.el.getBoundingClientRect(); s.w = Math.max(1, Math.round(r.width)); s.h = Math.max(1, Math.round(r.height)); s.k = Math.min(W.devicePixelRatio || 1, 1.5); }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { var s = e.target.__lp; s.vis = e.isIntersecting; if (s.vis) s.near = 1; });
    sync();
  }, { rootMargin: "120px 0px" });
  function retheme() { S.forEach(function (s) { if (s.c) { s.P = pal(s); if (worker) post({ id: s.i, P: s.P }); else s.dn = 0; } }); sync(); }
  function init() {
    els.forEach(function (el, i) { var s = el.__lp = { el: el, n: el.dataset.loop, st: parseFloat(el.dataset.loopStill) || 3, i: i }; S.push(s); io.observe(el); });
    new MutationObserver(retheme).observe(h, { attributes: true, attributeFilter: ["data-theme", "class"] });
    d.addEventListener("visibilitychange", sync);
    d.addEventListener("change", function (e) { if (e.target && e.target.id == "cc-bgm") setTimeout(sync, 0); }, true);
    addEventListener("storage", function (e) { if (e.key == "cc_bg_motion") sync(); });
    (rm.addEventListener ? rm.addEventListener.bind(rm, "change") : rm.addListener.bind(rm))(sync);
  }
  var go = function () { (W.requestIdleCallback || setTimeout)(init, { timeout: 1500 }); };   /* after load + idle, like bg.js */
  if (d.readyState == "complete") go(); else addEventListener("load", go);
  M.info = function () { return { worker: !!worker, G: G, s: S.map(function (s) { return { n: s.n, near: !!s.near, vis: !!s.vis, mounted: !!s.c, hidden: !!(s.c && s.c.hidden), w: s.w, h: s.h, k: s.k }; }) }; };
})(self);
