/* Motion layer: GSAP 3 (+ScrollTrigger, SplitText), Lenis smooth scroll, count-ups, tilt/magnetic hover,
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
  ready(async () => {
    try { await document.fonts.ready; } catch (e) {}
    const g = window.gsap;
    /* ---- count-ups (10K+, 500+, 100+ …): animate to the exact printed value ---- */
    document.querySelectorAll("[data-count]").forEach(el => {
      const end = +el.dataset.count, suf = el.dataset.suffix || "", sep = el.dataset.sep;
      const fmt = v => (sep ? Math.round(v).toLocaleString("en-US") : Math.round(v)) + suf;
      const o = { v: 0 };
      if (g) g.to(o, { v: end, duration: 1.6, ease: "power3.out", delay: .3, onUpdate: () => el.textContent = fmt(o.v), onComplete: () => el.textContent = fmt(end),
        scrollTrigger: window.ScrollTrigger ? { trigger: el, start: "top 95%", once: true } : undefined });
    });
    if (g) {
      if (window.ScrollTrigger) g.registerPlugin(ScrollTrigger);
      if (window.SplitText) g.registerPlugin(SplitText);
      /* ---- heading reveals ---- */
      document.querySelectorAll(".split").forEach((h, i) => {
        if (window.SplitText) {
          const s = SplitText.create(h, { type: "chars", charsClass: "ch" });
          g.from(s.chars, { yPercent: 110, opacity: 0, duration: .7, ease: "power4.out", stagger: .018, delay: .1 + i * .05,
            scrollTrigger: window.ScrollTrigger ? { trigger: h, start: "top 92%", once: true } : undefined, onComplete: () => s.revert() });
        }
      });
      /* ---- staggered entrances ---- */
      const groups = appShell() ? [] : [".tool", ".lp", ".act", ".feat", ".tile", ".path", ".tcard", ".qa", ".feed", ".ev", ".rcard", ".ncard", ".kpi", ".card"];
      groups.forEach(sel => {
        const els = [...document.querySelectorAll(sel)]; if (!els.length) return;
        g.from(els, { y: 26, opacity: 0, duration: .6, ease: "power3.out", stagger: .06, clearProps: "transform,opacity",
          scrollTrigger: window.ScrollTrigger ? { trigger: els[0], start: "top 95%", once: true } : undefined });
      });
    }
    /* ---- Lenis smooth scroll: the landing only (or a page that opts in with data-smooth="on"). Elsewhere it made
       wheel/keyboard scrolling lag the input on long reading pages (r12 interface). ---- */
    const smooth = document.body.dataset.smooth ? document.body.dataset.smooth === "on" : document.body.dataset.page === "landing";
    if (window.Lenis && smooth) {
      const lenis = new Lenis({ lerp: .12 });
      if (g && window.ScrollTrigger) { lenis.on("scroll", ScrollTrigger.update); g.ticker.add(t => lenis.raf(t * 1000)); g.ticker.lagSmoothing(0); }
      else { const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
    }
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
