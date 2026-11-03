/* era92 polish layer (site-wide, live only): scroll reveal, stat count-ups, latest updates.
   Off under ?static=1. Reveal and count-up are also off for prefers-reduced-motion and Lite mode: the final state shows at once. */
(function () {
  const html = document.documentElement;
  const STATIC = html.classList.contains("static") || /[?&]static/.test(location.search);
  if (STATIC) return;
  const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches || html.classList.contains("lite");
  const fmt = (v, suf) => Math.round(v).toLocaleString("en-US") + (suf || "");
  const io = cb => ("IntersectionObserver" in window) ? new IntersectionObserver(cb, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }) : null;

  function stats() {
    const cfg = (window.CC_SITE_STATS || {}).items || {};
    const els = [...document.querySelectorAll("[data-stat]")];
    els.forEach(el => { const c = cfg[el.dataset.stat]; if (!c) return; el.textContent = fmt(c.value, c.suffix);
      const lbl = el.parentElement.querySelector(".e-lbl"); if (lbl && c.label) lbl.textContent = c.label; });
    if (still()) return;
    const run = el => { const c = cfg[el.dataset.stat]; if (!c) return; const t0 = performance.now(), d = 1300;
      const step = t => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(c.value * e, c.suffix); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step); };
    const o = io(es => es.forEach(e => { if (e.isIntersecting) { o.unobserve(e.target); run(e.target); } }));
    if (!o) return;
    els.forEach(el => { if (el.getBoundingClientRect().top > innerHeight) { const c = cfg[el.dataset.stat]; if (c) el.textContent = fmt(0, c.suffix); o.observe(el); } });
  }

  function reveal() {
    if (still()) return;
    const sel = ".e-head, .e-card, .e-split > *, .e-fbox, [data-rv], .shell .main :is(.ph-head, .page-head, .sec-head)";
    const els = [...document.querySelectorAll(sel)].filter(el => !el.closest(".split") && el.getBoundingClientRect().top > innerHeight);
    const o = io(es => es.forEach(e => { if (e.isIntersecting) { o.unobserve(e.target); e.target.classList.add("rv-in"); } }));
    if (!o || !els.length) return;
    els.forEach((el, i) => { el.classList.add("rv"); el.style.setProperty("--rv-d", (i % 4) * 70 + "ms"); o.observe(el); });
    html.classList.add("rv-on");
  }

  function latest() {
    const host = document.querySelector("[data-latest]"); const F = window.CC_FEED_DATA; if (!host || !F || !F.announcements) return;
    const items = F.announcements.filter(a => !a.audience || !a.audience.roles.length || a.audience.roles.includes("learner"))
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, 3);
    const cards = host.querySelectorAll(".e-ncard");
    items.forEach((a, i) => { const c = cards[i]; if (!c) return; const d = new Date(a.publishedAt);
      const t = c.querySelector("time"); t.dateTime = d.toISOString(); t.textContent = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Kampala" });
      const l = c.querySelector("a"); l.textContent = a.title; l.href = a.link || "news.html"; });
  }

  /* footer © year: always the current year (the HTML carries the build year as the no-JS fallback) */
  function year() { const y = String(new Date().getFullYear()); document.querySelectorAll("[data-year]").forEach(el => { if (+y >= 2026) el.textContent = y; }); }

  /* landing header: hamburger below 900px (and on touch screens up to 1023px, e.g. a phone in "Desktop site" mode).
     The button toggles .nav-open on .hdr; Escape, a link tap, a tap outside or growing past the breakpoint closes it. */
  function landingMenu() {
    const hdr = document.querySelector(".page > .hdr"), btn = hdr && hdr.querySelector(".hburg"), nav = hdr && hdr.querySelector("nav");
    if (!btn || !nav) return;
    const mq = matchMedia("(max-width: 899px), (hover: none) and (pointer: coarse) and (max-width: 1023px)");
    const set = open => { hdr.classList.toggle("nav-open", open); btn.setAttribute("aria-expanded", String(open)); btn.setAttribute("aria-label", open ? "Close menu" : "Open menu"); };
    btn.addEventListener("click", () => { const open = !hdr.classList.contains("nav-open"); set(open); if (open) { const a = nav.querySelector("a"); if (a) a.focus({ preventScroll: true }); } });
    nav.addEventListener("click", e => { if (e.target.closest("a")) set(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && hdr.classList.contains("nav-open")) { set(false); btn.focus(); } });
    document.addEventListener("click", e => { if (hdr.classList.contains("nav-open") && !hdr.contains(e.target)) set(false); });
    const sync = () => { if (!mq.matches) set(false); };
    mq.addEventListener ? mq.addEventListener("change", sync) : mq.addListener(sync);
  }

  const go = () => { try { year(); } catch (e) {} try { landingMenu(); } catch (e) {} try { latest(); } catch (e) {} try { stats(); } catch (e) {} try { reveal(); } catch (e) {} };
  /* deferred: wait for DOMContentLoaded so the later deferred data files (site-stats.js, feed-data.js) have run */
  document.readyState === "complete" ? go() : document.addEventListener("DOMContentLoaded", go);
})();
