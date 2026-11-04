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

  /* ---- round 10: card reveal (css/cards.css .ck-rv): once, on scroll, every card type. Rise + overshoot, hold, the hard
     shadow snaps in; 200ms, 40ms stagger. Cards on screen when they first appear (at load, or rendered in view later) are
     left alone, so first paint, LCP and content swaps never wait on it. Off with cc_bg_motion off|reduced. ---- */
  const CARD = ".ck,.ck-skin,.ann-card,article.card,.content div.card:not(.dark),.ord,.kpi,.dz-stat,.feat-slot,.cd-stage";
  const cardStill = () => { try { return /^(off|reduced)$/.test(localStorage.cc_bg_motion || ""); } catch (e) { return false; } };
  if ("IntersectionObserver" in window && !cardStill()) {
    const seen = new WeakSet();
    const done = el => { el.classList.remove("ck-rv", "ck-rv-go"); el.style.removeProperty("--ck-rv-d"); };
    const io = new IntersectionObserver(es => {
      let k = 0;
      es.forEach(e => { if (!e.isIntersecting) return; const el = e.target; io.unobserve(el);
        if (cardStill() || html.classList.contains("lite")) return done(el);
        el.style.setProperty("--ck-rv-d", Math.min(k++, 5) * 40 + "ms"); el.classList.add("ck-rv-go");
        el.addEventListener("animationend", () => done(el), { once: true }); setTimeout(() => done(el), 700); });
    }, { rootMargin: "0px 0px -6% 0px" });
    const scan = root => {
      const vh = innerHeight;
      (root.matches && root.matches(CARD) ? [root] : []).concat([...(root.querySelectorAll ? root.querySelectorAll(CARD) : [])]).forEach(el => {
        if (seen.has(el)) return; seen.add(el);
        if (el.parentElement && el.parentElement.closest(".ck,.ck-skin,.ann-card,article.card,.ord")) return;   // nested card: the outer one moves
        const r = el.getBoundingClientRect(); if (!r.width || (r.top < vh && r.bottom > 0)) return;
        el.classList.add("ck-rv"); io.observe(el);
      });
    };
    const start = () => {
      scan(document);
      let q = []; let t = 0;
      new MutationObserver(ms => { ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) q.push(n); }));
        if (!t) t = requestAnimationFrame(() => { t = 0; const nodes = q; q = []; nodes.forEach(n => n.isConnected && scan(n)); }); })
        .observe(document.body, { childList: true, subtree: true });
    };
    document.readyState !== "loading" ? start() : document.addEventListener("DOMContentLoaded", start);
  }

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
      const groups = [".tool", ".lp", ".act", ".feat", ".tile", ".path", ".tcard", ".qa", ".feed", ".ev", ".rcard", ".ncard", ".kpi", ".card"];
      groups.forEach(sel => {
        const els = [...document.querySelectorAll(sel)].filter(el => !el.matches(CARD)); if (!els.length) return;   // cards use the CSS reveal above
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
