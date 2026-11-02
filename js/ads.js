/* 101 Codecrafts — ads (Google AdSense) + launch promo.
   ─────────────────────────────────────────────────────────────────────────────
   REPLACE BEFORE GOING LIVE: ADSENSE_CLIENT, every slot id marked TODO, ads.txt (root), LAUNCH_PROMO.endsAt.

   LAUNCH PROMO: while LAUNCH_PROMO is active nothing below loads (no AdSense script, no slots) and a slim,
   dismissible banner says the launch month is free with no ads. After endsAt the tiered rules apply.

   TIERS (who sees what, after the promo):
     • 101 Pro / premium members ............ no ads anywhere.
     • Visitors (not signed in) .............. public content pages only, max 2 per page (1 in-feed card + 1 banner).
     • Free signed-in members ................ more ads: in-feed card every ~6 items (library, courses, news, launchpad),
                                               banner, 1 sidebar ad on the dashboard, banner under the course video
                                               (never over it) and one between lessons, plus Google's own Auto ads
                                               overlay formats (dismissible bottom anchor + vignette between page loads).
     • Under-18 members ...................... same in-page slots as free members but child-directed + non-personalized,
                                               and NEVER anchor or vignette (Auto ads are not requested for them).
   NEVER ads on: checkout/payments, sign-in/up, onboarding, admin, tutor tools, testing (submission forms), legal pages,
   404/offline, go.html, verify, profile, projects, groups, competitions, product — i.e. any page not in PLACEMENTS.
   Also never: Lite/data-saver mode, ?static=1, before the visitor chooses "Accept all" in the cookie notice.
   No custom popups, no custom sticky units, no custom interstitials. Overlay formats come only from Google Auto ads.

   ADSENSE DASHBOARD SETUP (Auto ads): Ads → By site → enable Auto ads with ONLY "Anchor ads" and "Vignette ads"
   (turn In-page ads OFF). This file requests Auto ads (script URL carries ?client=) only for free adult members on
   allowed pages; everyone else gets the script without ?client=, which serves only the manual units below.

   VIEWER: window.CC_USER (set by the backend session) or localStorage "cc_user" = {signedIn, plan:"free"|"pro", minor}.
   Dev preview (no network, dashed placeholders): add ?adpreview=1 and optionally &as=anon|free|minor|pro.
*/
(function () {
  "use strict";
  const ADSENSE_CLIENT = "ca-pub-TODO";
  const SLOTS = { infeed: "TODO", banner: "TODO", sidebar: "TODO", player: "TODO", lesson: "TODO" };
  const LAUNCH_PROMO = { enabled: true, endsAt: "TODO-launch+1month" }; // ISO date with zone, e.g. "2027-01-31T23:59:00+03:00"
  const UPGRADE_URL = "signup.html?plan=pro"; // TODO: point at the 101 Pro pricing / checkout page when it exists
  const HEIGHTS = { infeed: 300, banner: 120, sidebar: 600, player: 100, lesson: 90 }; // px reserved before fill (no layout shift)

  /* where ads may go, per body[data-page]. member:true = free signed-in members only. */
  const PLACEMENTS = {
    landing:   [{ type: "banner", append: "#today-in-tech" }],
    news:      [{ type: "infeed", list: "#news-grid" }, { type: "banner", after: "#news-grid" }],
    resources: [{ type: "infeed", list: "#res-grid" }, { type: "banner", after: "#res-grid" }],
    courses:   [{ type: "infeed", list: "#gfree" }, { type: "banner", append: "#cfree" }],     // Free Courses Worldwide region only
    launchpad: [{ type: "infeed", list: "#lp-list", li: true }, { type: "banner", after: "#lp-list" }],
    dashboard: [{ type: "sidebar", append: "#below-fold", member: true }],
    learn:     [{ type: "infeed", list: "#learn-grid" }, { type: "banner", after: "#learn-grid" }],   // 101 Learn library (never on practice/problem/ide/contest pages)
    article:   [{ type: "banner", after: "#art-related" }],
    course:    [{ type: "player", after: "#c-video", member: true }, { type: "lesson", list: "#c-lessons", li: true, every: 3, cap: 1, member: true }]
  };

  const html = document.documentElement, q = new URLSearchParams(location.search);
  const page = document.body && document.body.dataset.page;
  const PREVIEW = q.has("adpreview");
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------------- launch promo ---------------- */
  function promo() {
    if (!LAUNCH_PROMO.enabled) return { active: false };
    const end = Date.parse(LAUNCH_PROMO.endsAt);
    return { active: isNaN(end) || Date.now() < end, end: isNaN(end) ? null : end };
  }
  function promoBanner(p) {
    if (q.has("static") || localStorage.getItem("cc_promo_dismissed") === String(LAUNCH_PROMO.endsAt)) return;
    const b = document.createElement("div"); b.className = "promo-bar"; b.setAttribute("role", "region"); b.setAttribute("aria-label", "Launch offer");
    const left = () => { if (!p.end) return "ends one month after launch"; const ms = Math.max(0, p.end - Date.now()), d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4); return `ends in ${d}d ${h}h ${m}m`; };
    b.innerHTML = `<p><b>Launch month:</b> everything on 101 is free — no ads. <span class="promo-cd">${left()}</span></p><button type="button" aria-label="Dismiss launch offer banner">✕</button>`;
    b.querySelector("button").onclick = () => { localStorage.setItem("cc_promo_dismissed", String(LAUNCH_PROMO.endsAt)); b.remove(); };
    document.body.insertBefore(b, document.body.firstChild);
    if (p.end) setInterval(() => { const s = b.querySelector(".promo-cd"); if (s) s.textContent = left(); }, 60000);
  }

  /* ---------------- who is looking ---------------- */
  function viewer() {
    let u = window.CC_USER; if (!u) { try { u = JSON.parse(localStorage.getItem("cc_user") || "null"); } catch (e) { u = null; } }
    if (PREVIEW && q.get("as")) { const a = q.get("as"); u = a === "anon" ? null : { signedIn: true, plan: a === "pro" ? "pro" : "free", minor: a === "minor" }; }
    if (!u || !u.signedIn) return { tier: "anon", minor: false };
    if (u.plan && u.plan !== "free") return { tier: "pro", minor: !!u.minor };   // 101 Pro and any future premium plan
    return { tier: "free", minor: !!u.minor };
  }

  function adsAllowed(v) {
    if (!PLACEMENTS[page]) return false;
    if (q.has("static") || html.classList.contains("static") || html.classList.contains("lite")) return false;
    if (v.tier === "pro") return false;
    if (PREVIEW) return true;
    if (ADSENSE_CLIENT.includes("TODO")) return false;            // no AdSense account yet: render nothing in production
    return localStorage.getItem("cookies") === "all";              // only after "Accept all"
  }

  /* ---------------- script loading (lazy, once) ---------------- */
  let loading = null;
  function loadScript(v) {
    if (loading) return loading;
    const ab = window.adsbygoogle = window.adsbygoogle || [];
    if (v.minor) { ab.requestNonPersonalizedAds = 1; ab.tagForChildDirectedTreatment = 1; } // TODO verify both flags against current AdSense docs
    const autoAds = v.tier === "free" && !v.minor && localStorage.getItem("cc_ads_overlays") !== "0";
    const s = document.createElement("script"); s.async = true; s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js" + (autoAds ? "?client=" + encodeURIComponent(ADSENSE_CLIENT) : "");
    if (v.minor) s.setAttribute("data-tag-for-child-directed-treatment", "1");
    loading = new Promise(r => { s.onload = r; s.onerror = r; }); document.head.appendChild(s); return loading;
  }

  /* ---------------- slots ---------------- */
  function slot(type, v, li) {
    const el = document.createElement(li ? "li" : "aside");
    el.className = `ad-slot ad-${type}`; el.setAttribute("aria-label", "Advertisement"); el.style.setProperty("--ad-h", HEIGHTS[type] + "px");
    const kids = v.minor ? ' data-tag-for-child-directed-treatment="1"' : "";
    el.innerHTML = `<div class="ad-head"><span class="ad-label">Advertisement</span><a class="ad-pro" href="${UPGRADE_URL}">Go ad-free with 101 Pro</a></div>
      <div class="ad-box">${PREVIEW ? `<span class="ad-ph">Ad slot · ${type} · ${HEIGHTS[type]}px reserved${v.minor ? " · child-directed" : ""}</span>`
        : `<ins class="adsbygoogle" style="display:block;width:100%;height:100%" data-ad-client="${ADSENSE_CLIENT}" data-ad-slot="${SLOTS[type]}" data-full-width-responsive="false"${kids}></ins>`}</div>`;
    return el;
  }
  const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } }), { rootMargin: "400px 0px" }) : null;
  let VIEW;
  async function fill(el) {
    if (PREVIEW || el.dataset.filled) return; el.dataset.filled = "1";
    await loadScript(VIEW); try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* blocked or no fill: the reserved box stays empty */ }
  }
  const watch = el => io ? io.observe(el) : fill(el);

  function place(p, v) {
    const target = $(p.list || p.after || p.append); if (!target) return;
    if (p.type === "sidebar") target.classList.add("has-ad-side");
    if (!p.list) { const el = slot(p.type, v); p.after ? target.after(el) : target.appendChild(el); watch(el); return; }
    /* in-feed: the list is re-rendered by filters, so re-insert whenever it changes */
    const every = p.every || (v.tier === "anon" ? 8 : 6), cap = p.cap || (v.tier === "anon" ? 1 : 3);
    const run = () => {
      mo.disconnect();
      if (!$(".ad-slot", target)) {
        const items = [...target.children].filter(c => !c.classList.contains("ad-slot") && !c.matches("p"));
        for (let n = 1; n <= cap && n * every <= items.length; n++) { const el = slot(p.type, v, p.li); items[n * every - 1].after(el); watch(el); }
      }
      mo.observe(target, { childList: true });
    };
    const mo = new MutationObserver(run); run();
  }

  function init() {
    const p = promo();
    if (p.active && !PREVIEW) { promoBanner(p); return; }        // launch month: no AdSense at all
    const v = VIEW = viewer(); if (!adsAllowed(v)) return;
    let n = 0;
    for (const pl of PLACEMENTS[page]) {
      if (pl.member && v.tier !== "free") continue;              // dashboard/course-player slots: free signed-in members only
      if (v.tier === "anon" && n >= 2) break;                    // visitors: max 2 ad units per page
      place(pl, v); n++;
    }
  }
  window.CC_ADS = { config: { ADSENSE_CLIENT, SLOTS, LAUNCH_PROMO, UPGRADE_URL }, promo, viewer, setOverlays: on => localStorage.setItem("cc_ads_overlays", on ? "1" : "0") };
  addEventListener("cc:consent", e => { if (e.detail === "all" && !promo().active && !$(".ad-slot")) init(); });
  document.readyState !== "loading" ? init() : document.addEventListener("DOMContentLoaded", init);
})();
