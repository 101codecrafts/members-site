/* Shared UI: role switcher, Lite/data-saver, language (i18n), theme, cookie notice, resource + news cards,
   below-the-fold widgets, live GitHub stats, service worker. Nothing here changes the mockup area in ?static=1. */
(function () {
  const html = document.documentElement, API = window.CC_API, D = window.CC_DATA;
  const STATIC = API ? API.STATIC : new URLSearchParams(location.search).has("static");
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ugx = n => "UGX " + Math.round(n).toLocaleString("en-US");
  const ico = (id, cls = "i") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  window.CC_UI = { $, $$, esc, ugx, ico };

  /* ---------------- cards ---------------- */
  const TYPE_CLR = { Course: "or", Book: "cy", Video: "or", Article: "cy", Repo: "ink" };
  function resourceCard(r) {
    const thumb = r.thumb ? `<img src="${esc(r.thumb)}" alt="" loading="lazy" decoding="async" class="heavy">` : `<div class="thumb-ph">${ico({ Course: "cap", Book: "openbook", Video: "yt", Article: "doc", Repo: "code" }[r.type] || "doc")}</div>`;
    return `<a class="rcard hov" href="${API.goHref(r.id)}" target="_blank" rel="noopener noreferrer" data-id="${esc(r.id)}" data-type="${esc(r.type)}" data-path="${esc(r.path || "")}">
      <div class="rthumb">${thumb}<span class="badge-t ${TYPE_CLR[r.type] || "or"}">${esc(r.type)}</span></div>
      <div class="rbody"><h3>${esc(r.title)}</h3>
        <div class="src"><img src="${esc(r.favicon)}" alt="" width="14" height="14" loading="lazy" onerror="this.style.display='none'"> ${esc(r.site)}</div>
        <p>${esc(r.desc)}</p>
        <div class="tags">${(r.tags || []).map(t => `<span>${esc(t)}</span>`).join("")}</div>
        <span class="open">Open on ${esc(r.site)} ↗</span></div></a>`;
  }
  function newsCard(n, big) {
    const host = (() => { try { return new URL(n.url).hostname; } catch (e) { return ""; } })();
    const img = n.image ? `<img src="${esc(n.image)}" alt="" loading="lazy" decoding="async" class="heavy">` : `<div class="thumb-ph news">${esc(n.cat)}</div>`;
    return `<a class="ncard hov ${big ? "big" : ""}" href="${API.goHref(n.id)}" target="_blank" rel="noopener noreferrer" data-cat="${esc(n.cat)}">
      <div class="rthumb">${img}<span class="badge-t ${n.cat === "Africa Tech" ? "cy" : "or"}">${esc(n.cat)}</span></div>
      <div class="rbody"><div class="src"><img src="https://icons.duckduckgo.com/ip3/${esc(host)}.ico" alt="" width="14" height="14" loading="lazy" onerror="this.style.display='none'"> ${esc(n.source)} · ${esc(n.ago)} ago</div>
      <h3>${esc(n.title)}</h3><p>${esc(n.summary || "")}</p><span class="open">Read on ${esc(n.source)} ↗</span></div></a>`;
  }
  window.CC_UI.resourceCard = resourceCard; window.CC_UI.newsCard = newsCard;

  /* ---------------- toolbar: role / lite / language / theme ---------------- */
  const I18N = { en: null };
  async function setLang(lang) {
    localStorage.setItem("lang", lang); html.lang = lang;
    if (lang === "en") { $$("[data-i18n]").forEach(el => { if (el.dataset.en) el.textContent = el.dataset.en; }); return; }
    try { I18N[lang] = I18N[lang] || await (await fetch("i18n/" + lang + ".json")).json(); } catch (e) { return; }
    $$("[data-i18n]").forEach(el => { el.dataset.en = el.dataset.en || el.textContent; const t = I18N[lang][el.dataset.i18n]; if (t) el.textContent = t; });
  }
  function toolbar() {
    const role = document.body.dataset.role || "learner";
    const bar = document.createElement("div"); bar.className = "cc-toolbar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "View settings");
    bar.innerHTML = `
      <button type="button" class="cc-tb-toggle" aria-expanded="false" aria-label="View settings: Lite mode, language, theme">${ico("gear")}</button>
      <button type="button" id="cc-lite" aria-pressed="${html.classList.contains("lite")}">${ico("download")} Lite</button>
      <label>${ico("chat")}<select id="cc-lang" aria-label="Language"><option value="en">English</option><option value="lg">Luganda</option><option value="sw">Kiswahili</option><option value="fr">Français</option></select></label>
      <button type="button" id="cc-theme" aria-pressed="${html.dataset.theme === "dark"}" aria-label="Toggle dark theme">◐</button>`;
    document.body.appendChild(bar);
    const tg = bar.querySelector(".cc-tb-toggle"); tg.onclick = () => { const o = bar.classList.toggle("open"); tg.setAttribute("aria-expanded", o); };
    $("#cc-lite").onclick = e => { const on = !html.classList.contains("lite"); html.classList.toggle("lite", on); localStorage.setItem("lite", on ? "1" : "0"); e.currentTarget.setAttribute("aria-pressed", on); if (!on) location.reload(); };
    const lang = localStorage.getItem("lang") || "en"; $("#cc-lang").value = lang; if (lang !== "en") setLang(lang);
    $("#cc-lang").onchange = e => setLang(e.target.value);
    $("#cc-theme").onclick = e => { const d = html.dataset.theme === "dark" ? "" : "dark"; if (d) html.dataset.theme = d; else delete html.dataset.theme; localStorage.setItem("theme", d); e.currentTarget.setAttribute("aria-pressed", !!d); };
  }
  function cookieBanner() {
    if (localStorage.getItem("cookies")) return;
    const b = document.createElement("div"); b.className = "cc-cookie"; b.setAttribute("role", "dialog"); b.setAttribute("aria-label", "Cookie notice");
    b.innerHTML = `<p><b>Cookies.</b> We use essential cookies to keep you signed in and, with your OK, anonymous analytics to improve 101 Codecrafts. See our <a href="privacy.html">Privacy Policy</a>.</p>
      <div><button type="button" data-v="essential" class="btn-line">Essential only</button><button type="button" data-v="all" class="btn-solid">Accept all</button></div>`;
    document.body.appendChild(b);
    b.addEventListener("click", e => { const v = e.target.dataset && e.target.dataset.v; if (v) { localStorage.setItem("cookies", v); b.remove(); dispatchEvent(new CustomEvent("cc:consent", { detail: v })); } });
  }

  /* ---------------- below-the-fold widgets on the mockup pages ---------------- */
  async function dashboardExtras() {
    const host = $("#below-fold"); if (!host) return;
    const [news, res] = await Promise.all([API.fetchNews(), API.fetchResources()]);
    const dl = $("#daily-news-list"); if (dl) dl.innerHTML = news.slice(0, 4).map(n => newsCard(n)).join("");
    $("#library-row").innerHTML = res.slice(0, 4).map(resourceCard).join("");
  }
  async function landingExtras() {
    const strip = $("#today-in-tech"); if (!strip) return;
    const news = await API.fetchNews();
    const items = news.slice(0, 10).map(n => `<a href="${API.goHref(n.id)}" target="_blank" rel="noopener noreferrer"><b>${esc(n.cat)}</b> ${esc(n.title)}</a>`).join("<i>■</i>");
    $(".marquee-track", strip).innerHTML = items + "<i>■</i>" + items;
    $("#tit-cards").innerHTML = news.slice(0, 3).map(n => newsCard(n, true)).join("");
    $("#tit-date").textContent = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  /* live GitHub stars/forks on Featured Tools cards (falls back silently to the mockup text) */
  async function githubStats() {
    for (const card of $$("[data-repo]")) {
      try { const s = await API.fetchRepoStats(card.dataset.repo); const t = document.createElement("span"); t.className = "gh-live"; t.textContent = `★ ${s.stars} · ⑂ ${s.forks}`; card.appendChild(t); } catch (e) { /* repo not public yet: keep mockup text */ }
    }
  }
  function whatsappShare() {
    $$("[data-wa-share]").forEach(a => { const txt = a.dataset.waShare || document.title; a.href = "https://wa.me/?text=" + encodeURIComponent(txt + " " + location.href.split("?")[0]); a.target = "_blank"; a.rel = "noopener noreferrer"; });
  }
  /* social icon rows: render from fetchSocialLinks(); keep the mockup icons when there is no data */
  function socialRow(list, size) {
    return list.filter(l => l.active && l.url).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" aria-label="101 Codecrafts on ${esc(l.label)}">${ico(l.icon)}</a>`).join("");
  }
  async function socials() {
    const rows = $$("[data-socials]"); if (!rows.length) return;
    const list = await API.fetchSocialLinks();
    if (!list) {   // no backend: show only the networks that have a real URL in the bundled data (never dead '#' icons)
      const known = ((D && D.social) || []).filter(l => l.url).map(l => ({ ...l, active: true }));
      if (known.length) { rows.forEach(r => { r.classList.add("live"); r.innerHTML = socialRow(known); }); }
      return;
    }
    rows.forEach(r => { r.classList.add("live"); r.innerHTML = socialRow(list); });
  }
  window.CC_UI.socialRow = socialRow;
  /* rewrite /go/ links when opened from disk */
  function fixGoLinks() { if (location.protocol !== "file:") return; $$('a[href^="/go/"]').forEach(a => a.href = "go.html?id=" + a.getAttribute("href").slice(4)); }

  /* scale the fixed mockup canvas on mid-size screens (1100–1535px); CSS reflows below 1100px */
  function fitCanvas() {
    const app = $(".app"); if (!app || STATIC) return;
    const w = document.documentElement.clientWidth; html.style.setProperty("--fit", w >= 1100 && w < 1536 ? (w / 1536).toFixed(4) : 1);
  }
  fitCanvas(); addEventListener("resize", fitCanvas);

  /* ---------------- toast, demo-data note, dead-link guard, site search ---------------- */
  function toast(msg) { let t = $("#cc-toast"); if (!t) { t = document.createElement("div"); t.id = "cc-toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 3200); }
  window.CC_UI.toast = toast;
  function demoNote() {
    if ($(".cc-demo") || sessionStorage.getItem("cc_demo_seen")) return;
    const n = document.createElement("div"); n.className = "cc-demo"; n.setAttribute("role", "status");
    n.innerHTML = `<span>Preview · showing demo data</span><button type="button" aria-label="Dismiss">✕</button>`;
    document.body.appendChild(n); n.querySelector("button").onclick = () => { n.remove(); sessionStorage.setItem("cc_demo_seen", "1"); };
    setTimeout(() => n.classList.add("min"), 7000);
  }
  function deadLinks() {
    document.addEventListener("click", e => {
      const a = e.target.closest && e.target.closest('a[href="#"]'); if (!a || e.defaultPrevented) return;
      if (a.hasAttribute("data-wa-share") || a.hasAttribute("data-cal-link")) return;
      e.preventDefault(); const what = (a.getAttribute("aria-label") || a.textContent || "This").trim().replace(/\s+/g, " ").slice(0, 40);
      toast(`${what} opens when the 101 backend is live. You're viewing the preview.`);
    });
  }
  const PAGES = [["Home", "index.html"], ["Dashboard", "dashboard.html"], ["Courses", "courses.html"], ["Learn library", "learn.html"], ["Practice problems", "practice.html"], ["Online IDE", "ide.html"], ["Contests", "contests.html"], ["Interview prep", "interview.html"], ["AI Tools", "ai-tools.html"], ["Projects", "projects.html"], ["Launchpad", "launchpad.html"], ["Competitions", "competitions.html"], ["Study groups", "groups.html"], ["Resource library", "resources.html"], ["Daily tech news", "news.html"], ["Opportunities", "opportunities.html"], ["Announcements", "announcements.html"], ["Events & meetups", "events.html"], ["Live sessions", "sessions.html"], ["Marketplace", "marketplace.html"], ["Testing", "testing.html"], ["Sign in", "signin.html"], ["Join the community", "signup.html"], ["Privacy policy", "privacy.html"], ["Terms", "terms.html"]];
  function searchIndex() {
    const d = D || {}, out = PAGES.map(([t, h]) => ({ t, h, k: "Page" }));
    (d.resources || []).forEach(r => out.push({ t: r.title, h: API ? API.goHref(r.id) : "resources.html", k: r.type || "Resource", ext: true }));
    (d.externalCourses || []).forEach(r => out.push({ t: r.title, h: API ? API.goHref(r.id) : "courses.html", k: "Course", ext: true }));
    (d.aiTools || []).forEach(r => out.push({ t: r.name || r.title, h: "ai-tools.html", k: "AI tool" }));
    (d.projects || []).forEach(r => out.push({ t: r.name || r.title, h: "projects.html", k: "Project" }));
    (d.groups || []).forEach(r => out.push({ t: r.name || r.title, h: "groups.html", k: "Group" }));
    (d.paths || []).forEach(t => out.push({ t, h: "courses.html", k: "Path" }));
    return out.filter(x => x.t);
  }
  function openSearch(q = "") {
    let o = $("#cc-search");
    if (!o) {
      o = document.createElement("div"); o.id = "cc-search"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", "Search 101 Codecrafts");
      o.innerHTML = `<div class="ccs-box"><form class="ccs-bar" role="search"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" placeholder="Search courses, tools, pages…" aria-label="Search" autocomplete="off"><button type="button" class="ccs-x" aria-label="Close search">✕</button></form><ul class="ccs-list" role="listbox"></ul></div>`;
      document.body.appendChild(o);
      const idx = searchIndex(), inp = $("input", o), list = $(".ccs-list", o);
      const render = () => { const v = inp.value.trim().toLowerCase(); const hits = (v ? idx.filter(x => x.t.toLowerCase().includes(v) || x.k.toLowerCase().includes(v)) : idx.slice(0, 8)).slice(0, 12);
        list.innerHTML = hits.length ? hits.map(x => `<li><a href="${esc(x.h)}"${x.ext ? ' target="_blank" rel="noopener noreferrer"' : ""}><span>${esc(x.t)}</span><small>${esc(x.k)}</small></a></li>`).join("") : `<li class="ccs-empty">No matches for “${esc(inp.value)}”. Try “python”, “AI” or “events”.</li>`; };
      inp.addEventListener("input", render);
      $("form", o).addEventListener("submit", e => { e.preventDefault(); const f = $("a", list); if (f) f.click(); });
      const close = () => { o.hidden = true; document.body.style.overflow = ""; };
      $(".ccs-x", o).onclick = close; o.addEventListener("click", e => { if (e.target === o) close(); });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && !o.hidden) close(); });
      o._render = render;
    }
    o.hidden = false; document.body.style.overflow = "hidden"; const inp = $("input", o); inp.value = q; o._render(); setTimeout(() => inp.focus(), 30);
  }
  window.CC_UI.openSearch = openSearch;
  function searchHooks() {
    document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-search]"); if (b) { e.preventDefault(); openSearch(); } });
    $$(".topbar .search input, .topbar .tb-search input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); openSearch(i.value); } }));
    document.addEventListener("keydown", e => { if (e.key === "/" && !/input|textarea|select/i.test((document.activeElement || {}).tagName || "") && !document.activeElement.isContentEditable) { e.preventDefault(); openSearch(); } });
  }
  /* landing, desktop: keep the full-bleed navy header band aligned with the canvas header (promo bars above it can change height) */
  function headerBand() {
    if (document.body.dataset.page !== "landing") return; const pg = $(".page"); if (!pg) return;
    const f = () => html.style.setProperty("--hdr-y", (pg.getBoundingClientRect().top + scrollY) + "px");
    f(); addEventListener("resize", f); if (window.ResizeObserver) new ResizeObserver(f).observe(document.body);
  }
  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  ready(() => {
    fixGoLinks();
    if (STATIC) return;                       // mockup comparison mode: no injected UI, no network
    toolbar(); cookieBanner(); whatsappShare(); socials(); deadLinks(); searchHooks(); headerBand();
    if (window.CC_DEMO) demoNote(); else addEventListener("cc:demo", demoNote, { once: true });
    dashboardExtras(); landingExtras(); githubStats();
    // Cal.com booking buttons: data-cal-link="101codecrafts/workshop" opens the Cal.com page (embed snippet can replace this)
    $$("[data-cal-link]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); window.open("https://cal.com/" + b.dataset.calLink, "_blank", "noopener"); }));
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  });
})();
