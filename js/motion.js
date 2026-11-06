/* Motion layer: GSAP 3 (+ScrollTrigger, SplitText), Lenis smooth scroll, count-ups, tilt/magnetic hover,
   canvas grid particles. Final frames equal the static layout, so screenshots after settle match ?static=1.
   Off when: ?static=1, Lite/data-saver mode, or prefers-reduced-motion. */
(function () {
  const html = document.documentElement;
  const STATIC = new URLSearchParams(location.search).has("static");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite = html.classList.contains("lite");
  if (STATIC || reduce || lite) { html.classList.add("no-motion"); return; }
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
          /* aria:"auto" names the host with aria-label, which is prohibited on a plain <div>/<span> (ARIA 1.2). Those hosts get a
             visually hidden copy of the text while the chars are split and aria-hidden; revert() puts the original text back. */
          const named = /^(H[1-6]|A|BUTTON)$/.test(h.tagName) || h.hasAttribute("role");
          let sr = null;
          if (!named) { sr = document.createElement("span"); sr.className = "sr-only"; sr.textContent = h.textContent.replace(/\s+/g, " ").trim(); h.before(sr); }
          const s = SplitText.create(h, { type: "chars", charsClass: "ch", aria: named ? "auto" : "hidden" });
          g.from(s.chars, { yPercent: 110, opacity: 0, duration: .7, ease: "power4.out", stagger: .018, delay: .1 + i * .05,
            scrollTrigger: window.ScrollTrigger ? { trigger: h, start: "top 92%", once: true } : undefined, onComplete: () => { s.revert(); if (sr) { sr.remove(); h.removeAttribute("aria-hidden"); } } });
        }
      });
      /* ---- staggered entrances ---- */
      const groups = [".tool", ".lp", ".act", ".feat", ".tile", ".path", ".tcard", ".qa", ".feed", ".ev", ".rcard", ".ncard", ".kpi", ".card"];
      groups.forEach(sel => {
        const els = [...document.querySelectorAll(sel)]; if (!els.length) return;
        g.from(els, { y: 26, opacity: 0, duration: .6, ease: "power3.out", stagger: .06, clearProps: "transform,opacity",
          scrollTrigger: window.ScrollTrigger ? { trigger: els[0], start: "top 95%", once: true } : undefined });
      });
    }
    /* ---- Lenis smooth scroll (landing + long pages) ---- */
    if (window.Lenis && document.body.dataset.smooth !== "off") {
      const lenis = new Lenis({ lerp: .12 });
      if (g && window.ScrollTrigger) { lenis.on("scroll", ScrollTrigger.update); g.ticker.add(t => lenis.raf(t * 1000)); g.ticker.lagSmoothing(0); }
      else { const raf = t => { lenis.raf(t); requestAnimationFrame(raf); }; requestAnimationFrame(raf); }
    }
    /* ---- tilt + magnetic hover (pointer devices only) ---- */
    if (matchMedia("(hover:hover)").matches) {
      document.querySelectorAll(".tilt, .tool, .feat, .rcard, .ncard").forEach(el => { if (el.matches(".ck, .ck-skin")) return;
        el.addEventListener("pointermove", e => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
          el.style.transform = `perspective(700px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translate(-3px,-3px)`; });
        el.addEventListener("pointerleave", () => el.style.transform = "");
      });
      document.querySelectorAll(".magnetic, .cta, .btn-or, .btn-nv, .join").forEach(el => {
        el.addEventListener("pointermove", e => { const r = el.getBoundingClientRect(); el.style.translate = `${((e.clientX - r.left) / r.width - .5) * 8}px ${((e.clientY - r.top) / r.height - .5) * 6}px`; });
        el.addEventListener("pointerleave", () => el.style.translate = "");
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
