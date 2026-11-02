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
      <label>View <select id="cc-role" aria-label="Switch role view">
        <option value="dashboard.html" ${role === "member" || role === "learner" ? "selected" : ""}>Learner</option>
        <option value="tutor.html" ${role === "tutor" ? "selected" : ""}>Tutor</option>
        <option value="admin.html" ${role === "admin" ? "selected" : ""}>Admin</option></select></label>
      <button type="button" id="cc-lite" aria-pressed="${html.classList.contains("lite")}">${ico("download")} Lite</button>
      <label>${ico("chat")}<select id="cc-lang" aria-label="Language"><option value="en">English</option><option value="lg">Luganda</option><option value="sw">Kiswahili</option><option value="fr">Français</option></select></label>
      <button type="button" id="cc-theme" aria-pressed="${html.dataset.theme === "dark"}" aria-label="Toggle dark theme">◐</button>`;
    document.body.appendChild(bar);
    $("#cc-role").onchange = e => location.href = e.target.value;
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
    b.addEventListener("click", e => { const v = e.target.dataset && e.target.dataset.v; if (v) { localStorage.setItem("cookies", v); b.remove(); } });
  }

  /* ---------------- below-the-fold widgets on the mockup pages ---------------- */
  async function dashboardExtras() {
    const host = $("#below-fold"); if (!host) return;
    const [news, res] = await Promise.all([API.fetchNews(), API.fetchResources()]);
    $("#daily-news-list").innerHTML = news.slice(0, 4).map(n => newsCard(n)).join("");
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
    if (!list) { rows.forEach(r => $$("a", r).forEach(a => { a.target = "_blank"; a.rel = "noopener noreferrer"; })); return; }
    rows.forEach(r => { r.classList.add("live"); r.innerHTML = socialRow(list); });
  }
  window.CC_UI.socialRow = socialRow;
  /* rewrite /go/ links when opened from disk */
  function fixGoLinks() { if (location.protocol !== "file:") return; $$('a[href^="/go/"]').forEach(a => a.href = "go.html?id=" + a.getAttribute("href").slice(4)); }

  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  ready(() => {
    fixGoLinks();
    if (STATIC) return;                       // mockup comparison mode: no injected UI, no network
    toolbar(); cookieBanner(); whatsappShare(); socials();
    dashboardExtras(); landingExtras(); githubStats();
    // Cal.com booking buttons: data-cal-link="101codecrafts/workshop" opens the Cal.com page (embed snippet can replace this)
    $$("[data-cal-link]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); window.open("https://cal.com/" + b.dataset.calLink, "_blank", "noopener"); }));
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  });
})();
