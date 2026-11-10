/* Motion layer: GSAP 3 (+SplitText, loaded on demand), Lenis smooth scroll, count-ups, tilt/magnetic hover,
   canvas grid particles. Final frames equal the static layout, so screenshots after settle match ?static=1.
   Off when: ?static=1, Lite/data-saver mode, or prefers-reduced-motion. */
(function () {
  const html = document.documentElement;
  const STATIC = new URLSearchParams(location.search).has("static");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite = html.classList.contains("lite");
  /* ---- r12 interface: a visible Pause/Play on every always-moving link strip (WCAG 2.2.2). Built even when motion is off,
     so the control is there whenever the CSS loop could run; under reduced motion the loops are already stopped (brutal.css). ---- */
  if (!STATIC) {
    const mqReady = () => document.querySelectorAll(".e-marq .e-marquee, .marquee").forEach(box => {
      if (box.querySelector(".mq-toggle")) return;
      const b = document.createElement("button"); b.type = "button"; b.className = "mq-toggle";
      const set = paused => { box.classList.toggle("is-paused", paused); b.setAttribute("aria-pressed", String(paused));
        b.innerHTML = `<span aria-hidden="true">${paused ? "\u25B6" : "\u275A\u275A"}</span>${paused ? "Play" : "Pause"}`;
        b.setAttribute("aria-label", (paused ? "Play" : "Pause") + " the moving " + (box.getAttribute("aria-label") || "course providers").toLowerCase()); };
      b.addEventListener("click", () => set(!box.classList.contains("is-paused")));
      set(false); box.append(b);
    });
    document.readyState !== "loading" ? mqReady() : document.addEventListener("DOMContentLoaded", mqReady);
  }
  if (STATIC || reduce || lite) { html.classList.add("no-motion"); return; }
  /* r12 interface: expressive motion (entrances, smooth scroll, tilt) is for the marketing pages only. App pages (the
     sidebar shell: dashboard, course, practice, settings, events…) are read and revisited all day: they render in place. */
  const appShell = () => !!document.querySelector(".shell, .sbar");
  html.classList.add("fx");

  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  /* r13 seo (QA Q21, landing Lighthouse 37 / TBT 5.3 s): GSAP + SplitText (+ Lenis on the landing) are no longer four
     render-path <script> tags on every page. They load here, only when motion is on, and only if the page has something
     to animate. Entrances are set up lazily: whatever is already on screen when the page opens is shown as it is (no
     hidden-then-revealed hero), and everything below gets its tween when it comes near the viewport. GSAP reads computed
     style for every target it starts, and on the landing those reads at load cost 5.5 s of style recalculation at 4x CPU
     (getComputedStyle inside gsap, perf/profile-before-index.txt); now they happen one section at a time while scrolling.
     ScrollTrigger is gone (its only job was "start once when visible"; an IntersectionObserver does that). URLs + SRI are
     written into LIBS by tools/build.py from its LIBS list (single source). */
  const LIBS = /*LIBS*/{"gsap":["https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js","sha384-HOvlOYPIs/zjoIkWUGXkVmXsjr8GuZLV+Q+rcPwmJOVZVpvTSXQChiN4t9Euv9Vc"],"split":["https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js","sha384-xb96EMJeax+NLXMC88ZBa1xAeAW+kn+horHh/zFlbMLG2UPWhMJJSlv7fi57hS+Q"],"lenis":["https://cdn.jsdelivr.net/npm/lenis@1.3.4/dist/lenis.min.js","sha384-FKTX0CNJ8ngN1oGMBReVu7mvjTJyjFiD5etb1NKnYxc+8eFI2O0KWnksTN+oTFcu"]}/*END*/;
  const load = k => new Promise((ok, no) => { const l = LIBS[k]; if (!l) return no(new Error(k));
    if (document.querySelector(`script[data-lib="${k}"]`)) return ok();
    const s = document.createElement("script"); s.src = l[0]; s.integrity = l[1]; s.crossOrigin = "anonymous"; s.dataset.lib = k;
    s.onload = ok; s.onerror = no; document.head.append(s); });
  const near = (el, fn) => { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: "0px 0px 20% 0px" }); io.observe(el); };
  ready(async () => {
    const vh = innerHeight, onScreen = el => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.width > 0; };
    const split = [...document.querySelectorAll(".split")].filter(h => !onScreen(h));
    const groups = (appShell() ? [] : [".tool", ".lp", ".act", ".feat", ".tile", ".path", ".tcard", ".qa", ".feed", ".ev", ".rcard", ".ncard", ".kpi", ".card"])
      .map(sel => [...document.querySelectorAll(sel)].filter(el => !onScreen(el))).filter(els => els.length);
    const counts = [...document.querySelectorAll("[data-count]")];
    const smooth = document.body.dataset.smooth ? document.body.dataset.smooth === "on" : document.body.dataset.page === "landing";
    if (!split.length && !groups.length && !counts.length && !smooth) return;
    /* wait for the page to finish loading, then for an idle moment, so none of this competes with first paint */
    await new Promise(r => document.readyState === "complete" ? r() : addEventListener("load", r, { once: true }));
    await new Promise(r => (window.requestIdleCallback || setTimeout)(r, { timeout: 1500 }));
    try { await load("gsap"); if (split.length) await load("split"); if (smooth) await load("lenis"); } catch (e) { return; }
    try { await document.fonts.ready; } catch (e) {}
    const g = window.gsap; if (!g) return;
    if (window.SplitText) g.registerPlugin(SplitText);
    /* ---- count-ups (10K+, 500+, 100+ …): animate to the exact printed value when they come into view ---- */
    counts.forEach(el => near(el, () => {
      const end = +el.dataset.count, suf = el.dataset.suffix || "", sep = el.dataset.sep;
      const fmt = v => (sep ? Math.round(v).toLocaleString("en-US") : Math.round(v)) + suf;
      const o = { v: 0 };
      g.to(o, { v: end, duration: 1.6, ease: "power3.out", delay: .3, onUpdate: () => el.textContent = fmt(o.v), onComplete: () => el.textContent = fmt(end) });
    }));
    /* ---- heading reveals (below the first screen only) ---- */
    split.forEach(h => near(h, () => {
      if (!window.SplitText || onScreen(h)) return;   // scrolled into view before the library arrived: leave it as it is
      /* aria:"auto" names the host with aria-label, which is prohibited on a plain <div>/<span> (ARIA 1.2). Those hosts get a
         visually hidden copy of the text while the chars are split and aria-hidden; revert() puts the original text back. */
      const named = /^(H[1-6]|A|BUTTON)$/.test(h.tagName) || h.hasAttribute("role");
      let sr = null;
      if (!named) { sr = document.createElement("span"); sr.className = "sr-only"; sr.textContent = h.textContent.replace(/\s+/g, " ").trim(); h.before(sr); }
      const s = SplitText.create(h, { type: "chars", charsClass: "ch", aria: named ? "auto" : "hidden" });
      g.from(s.chars, { yPercent: 110, opacity: 0, duration: .7, ease: "power4.out", stagger: .018, delay: .1,
        onComplete: () => { s.revert(); if (sr) { sr.remove(); h.removeAttribute("aria-hidden"); } } });
    }));
    /* ---- staggered entrances (below the first screen only) ---- */
    groups.forEach(els => near(els[0], () => {
      const todo = els.filter(el => !onScreen(el)); if (!todo.length) return;
      g.from(todo, { y: 26, opacity: 0, duration: .6, ease: "power3.out", stagger: .06, clearProps: "transform,opacity" });
    }));
    /* ---- Lenis smooth scroll: the landing only (or a page that opts in with data-smooth="on"). Elsewhere it made
       wheel/keyboard scrolling lag the input on long reading pages (r12 interface). ---- */
    if (window.Lenis && smooth) {
      const lenis = new Lenis({ lerp: .12 });
      g.ticker.add(t => lenis.raf(t * 1000)); g.ticker.lagSmoothing(0);
    }
  });
  ready(() => {
    /* ---- tilt hover (pointer devices, marketing pages only). The magnetic pull on buttons was removed in r12: it moved
       the target while the pointer aimed at it and its inline translate cancelled the shared :active press (touch.css). ---- */
    if (matchMedia("(hover:hover)").matches && !appShell()) {
      document.querySelectorAll(".tilt, .tool, .feat, .rcard, .ncard").forEach(el => { if (el.matches(".ck, .ck-skin")) return;
        el.addEventListener("pointermove", e => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
          el.style.transform = `perspective(700px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translate(-3px,-3px)`; });
        el.addEventListener("pointerleave", () => el.style.transform = "");
      });
    }
    /* ---- canvas grid + drifting particles behind hero panels ---- */
    document.querySelectorAll("canvas[data-fx=grid]").forEach(cv => {
      const ctx = cv.getContext("2d"); let w, h, pts;
      const size = () => { const r = cv.parentElement.getBoundingClientRect(); w = cv.width = r.width; h = cv.height = r.height;
        pts = Array.from({ length: 26 }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25 })); };
      size(); addEventListener("resize", size);
      let alive = true; const io = new IntersectionObserver(([e]) => alive = e.isIntersecting); io.observe(cv);
      (function tick() {
        if (alive && !html.classList.contains("lite")) {
          ctx.clearRect(0, 0, w, h); ctx.strokeStyle = "rgba(16,24,31,.06)"; ctx.lineWidth = 1;
          for (let x = 0; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, h); ctx.stroke(); }
          for (let y = 0; y < h; y += 24) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(w, y + .5); ctx.stroke(); }
          ctx.fillStyle = "rgba(16,24,31,.18)";
          pts.forEach(p => { p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h; ctx.fillRect(p.x, p.y, 3, 3); });
        }
        requestAnimationFrame(tick);
      })();
    });
  });
})();
