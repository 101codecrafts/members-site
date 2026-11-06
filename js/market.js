/* 101 Marketplace pages: marketplace, product-item, cart, checkout, orders, seller, rfq.
   Data comes from js/market-api.js (backend only on a real visit; js/market-data.js placeholders only for ?static=1 / admin ?demo=1). No ads are placed by this file;
   js/ads.js has no placements for these pages (cart/checkout/orders/seller must stay ad-free). */
(function () {
  /* BUS L16: a mutation the server did not accept stops here with its honest message (no optimistic "done" on a real account) */
  const refused = r => { if (r && r.notSent) { (window.CC_UI && CC_UI.toast ? CC_UI.toast : alert)(r.message); return true; } return false; };
  "use strict";
  const A = window.MarketAPI, D = window.CC_DATA, html = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const q = new URLSearchParams(location.search), page = document.body.dataset.page;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ugx = n => "UGX " + Math.round(n).toLocaleString("en-UG");
  /* backend listings carry https image urls; a listing with no image gets the neutral placeholder */
  const img = (k, v = "") => /^https:\/\//.test(k || "") ? k : `assets/img/market/${k || "chip-set"}${v ? "--" + v : ""}.svg`;
  const lite = () => html.classList.contains("lite") || html.classList.contains("static") || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stars = r => `<span class="mk-stars" aria-label="Rated ${r} out of 5"><span aria-hidden="true">${"★".repeat(Math.round(r))}${"☆".repeat(5 - Math.round(r))}</span></span>`;
  const off = p => p.compare > p.price ? Math.round((1 - p.price / p.compare) * 100) : 0;
  const SELLER_T = { member: "101 member", business: "Verified business", individual: "Individual" };
  const DELIV_T = { kampala: "Boda · Kampala", upcountry: "Upcountry courier", pickup: "Pickup point", digital: "Instant digital" };
  const catName = id => (D.marketCategories.find(c => c.id === id) || {}).name || id;
  const goHref = id => (window.CC_API ? window.CC_API.goHref(id) : "go.html?id=" + encodeURIComponent(id));

  /* ---------------- product card ---------------- */
  function card(p, opts = {}) {
    const s = A.seller(p.seller), o = off(p);
    return `<article class="mk-card ck ck--flush${opts.wide ? " wide" : ""}">
      <a class="mk-thumb ck-media ck-media--1x1" href="product-item.html?id=${encodeURIComponent(p.id)}" tabindex="-1" aria-hidden="true"><img src="${img(p.img)}" alt="" width="400" height="400" loading="lazy">${o ? `<span class="mk-off">−${o}%</span>` : ""}${p.made101 ? `<span class="mk-src m101">MADE BY 101</span>` : ""}</a>
      <div class="mk-body">
        <h3 class="ck-title"><a class="ck-link" href="product-item.html?id=${encodeURIComponent(p.id)}">${esc(p.title)}</a></h3>
        <div class="mk-meta">${stars(p.rating)} <span>${p.rating} (${p.reviews})</span> · <span>${p.sold.toLocaleString()} sold</span></div>
        <div class="mk-pr"><b>${ugx(p.price)}</b>${p.compare > p.price ? `<s>${ugx(p.compare)}</s>` : ""}</div>
        <div class="mk-tags"><span class="mk-tag st-${s.type}">${SELLER_T[s.type]}</span><span class="mk-tag">${esc(p.condition)}</span><span class="mk-tag">${DELIV_T[p.delivery[0]]}</span></div>
        <p class="mk-seller-l">${esc(s.name)} · ${esc(s.location)}</p>
        ${opts.wide ? `<p class="mk-desc">${esc(p.desc || p.sub + " · " + catName(p.cat))}</p>` : ""}
        <button class="btn sm or mk-add" type="button" data-add="${esc(p.id)}" aria-label="Add ${esc(p.title)} to cart">Add to cart</button>
      </div></article>`;
  }
  function affCard(a) {
    const fx = D.marketFx.usdUgx;
    return `<article class="mk-card aff ck ck--flush">
      <a class="mk-thumb ck-media ck-media--1x1" href="${goHref(a.id)}" target="_blank" rel="noopener noreferrer sponsored" tabindex="-1" aria-hidden="true"><img src="${img(a.img)}" alt="" width="400" height="400" loading="lazy"><span class="mk-src ${a.source.toLowerCase()}">${esc(a.source.toUpperCase())}</span></a>
      <div class="mk-body"><h3 class="ck-title"><a class="ck-link" href="${goHref(a.id)}" target="_blank" rel="noopener noreferrer sponsored">${esc(a.title)}<span class="sr-only"> (opens ${esc(a.source)} in a new tab)</span></a></h3>
        <div class="mk-pr"><b>~US$${a.usd}${esc(a.unit || "")}</b><small>≈ ${ugx(a.usd * fx)}</small></div>
        <p class="mk-seller-l">${esc(a.note)}</p>
        <a class="btn sm mk-add" href="${goHref(a.id)}" target="_blank" rel="noopener noreferrer sponsored">View on ${esc(a.source)} ↗</a></div></article>`;
  }

  /* ---------------- shared market bar: mega-menu + search with autocomplete + cart ---------------- */
  function marketBar() {
    const el = $("[data-mk-top]"); if (!el) return;
    const cats = D.marketCategories;
    el.innerHTML = `<div class="mk-bar">
      <div class="mk-mega"><button class="btn ink mk-allcats" type="button" aria-expanded="false" aria-controls="mk-megapanel"><svg aria-hidden="true"><use href="#i-bars"/></svg>All categories</button>
        <div class="mk-megapanel" id="mk-megapanel" hidden><ul class="mk-mcats" role="list">${cats.map((c, i) => `<li><button type="button" class="mk-mcat" data-i="${i}" aria-expanded="${i === 0}"><svg aria-hidden="true"><use href="#i-${c.icon}"/></svg>${esc(c.name)}<span aria-hidden="true">›</span></button></li>`).join("")}</ul>
          <div class="mk-msubs" id="mk-msubs"></div></div></div>
      <form class="mk-search" role="search" id="mk-sform" action="marketplace.html#browse"><label class="sr-only" for="mk-q">Search the marketplace</label>
        <div class="mk-sbox"><input id="mk-q" name="q" type="search" autocomplete="off" placeholder="Search laptops, ESP32, templates, tutors…" role="combobox" aria-expanded="false" aria-controls="mk-ac" aria-autocomplete="list" value="${esc(q.get("q") || "")}">
        <ul id="mk-ac" class="mk-ac" role="listbox" hidden></ul></div><button class="btn or" type="submit"><svg aria-hidden="true"><use href="#i-search"/></svg><span class="mk-hide-s">Search</span></button></form>
      <nav class="mk-quick" aria-label="Marketplace"><a href="orders.html" class="mk-ql">Orders</a><a href="rfq.html" class="mk-ql">RFQ</a><a href="cart.html" class="mk-cart" aria-label="Cart"><svg aria-hidden="true"><use href="#i-store"/></svg><span>Cart</span><i id="mk-cartn">0</i></a></nav>
    </div>
    <nav class="mk-catstrip" aria-label="Categories">${cats.map(c => `<a href="marketplace.html?cat=${c.id}#browse">${esc(c.name)}</a>`).join("")}</nav>`;
    updateCartCount();
    // mega-menu
    const btn = $(".mk-allcats"), panel = $("#mk-megapanel"), subs = $("#mk-msubs");
    const showSubs = i => { const c = cats[i]; $$(".mk-mcat").forEach(b => b.setAttribute("aria-expanded", b.dataset.i == i));
      const picks = D.marketProducts.filter(p => p.cat === c.id).slice(0, 2);
      subs.innerHTML = `<div><h3>${esc(c.name)}</h3><ul role="list">${c.subs.map(s => `<li><a href="marketplace.html?cat=${c.id}&sub=${encodeURIComponent(s)}#browse">${esc(s)}</a></li>`).join("")}</ul><a class="mk-more" href="marketplace.html?cat=${c.id}#browse">All ${esc(c.name)} →</a></div>
        <div class="mk-mpicks">${picks.map(p => `<a href="product-item.html?id=${p.id}"><img src="${img(p.img)}" alt="" width="80" height="80"><span>${esc(p.title)}<b>${ugx(p.price)}</b></span></a>`).join("")}</div>`; };
    const open = v => { panel.hidden = !v; btn.setAttribute("aria-expanded", v); if (v) showSubs($(".mk-mcat[aria-expanded=true]")?.dataset.i || 0); };
    btn.onclick = () => open(panel.hidden);
    $$(".mk-mcat").forEach(b => { b.onmouseenter = b.onfocus = () => showSubs(b.dataset.i); b.onclick = () => showSubs(b.dataset.i); });
    document.addEventListener("click", e => { if (!panel.hidden && !e.target.closest(".mk-mega")) open(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) { open(false); btn.focus(); } });
    // autocomplete (combobox pattern)
    const inp = $("#mk-q"), ac = $("#mk-ac"); let act = -1, items = [];
    const close = () => { ac.hidden = true; inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); act = -1; };
    const go = it => { if (it.kind === "product") location.href = "product-item.html?id=" + it.id; else location.href = `marketplace.html?cat=${it.id}${it.sub ? "&sub=" + encodeURIComponent(it.sub) : ""}#browse`; };
    inp.oninput = () => {
      items = A.suggest(inp.value); act = -1;
      if (!items.length) return close();
      ac.innerHTML = items.map((it, i) => `<li role="option" id="ac-${i}" aria-selected="false" data-i="${i}"><span class="ac-k">${it.kind === "product" ? "Product" : "Category"}</span>${esc(it.label)}${it.price ? `<b>${ugx(it.price)}</b>` : ""}</li>`).join("");
      ac.hidden = false; inp.setAttribute("aria-expanded", "true");
      $$("li", ac).forEach(li => li.onmousedown = e => { e.preventDefault(); go(items[li.dataset.i]); });
    };
    inp.onkeydown = e => {
      if (ac.hidden) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); act = (act + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        $$("li", ac).forEach((li, i) => li.setAttribute("aria-selected", i === act)); inp.setAttribute("aria-activedescendant", "ac-" + act); }
      else if (e.key === "Enter" && act >= 0) { e.preventDefault(); go(items[act]); }
      else if (e.key === "Escape") close();
    };
    inp.onblur = () => setTimeout(close, 120);
    /* round 11: an empty search says so instead of doing nothing */
    $("#mk-sform").addEventListener("submit", e => { if (inp.value.trim()) return; e.preventDefault(); e.stopImmediatePropagation(); inp.setAttribute("aria-invalid", "true"); inp.placeholder = "Type what you're looking for first"; inp.focus(); }, true);
    inp.addEventListener("input", () => inp.removeAttribute("aria-invalid"));
    if (page === "marketplace") $("#mk-sform").onsubmit = e => { e.preventDefault(); close(); state.q = inp.value.trim(); state.page = 1; render(); $("#browse").scrollIntoView({ behavior: lite() ? "auto" : "smooth" }); };
  }
  function updateCartCount() { const n = $("#mk-cartn"); if (n) n.textContent = A.cartCount(); }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-add]"); if (!b) return;
    A.addToCart(b.dataset.add, 1); updateCartCount(); const t = b.textContent; b.textContent = "Added ✓"; setTimeout(() => b.textContent = t, 1400);
  });

  /* ================= marketplace.html ================= */
  const state = { q: q.get("q") || "", cat: q.get("cat") || "", sub: q.get("sub") || "", sort: "rel", view: localStorage.getItem("mk_view") || "grid", page: 1, per: 12, quick: "" };
  function filtersFromForm() {
    const f = $("#mk-filters"), fd = new FormData(f);
    return { min: +fd.get("min") || 0, max: +fd.get("max") || Infinity, rating: +fd.get("rating") || 0, seller: fd.getAll("seller"), delivery: fd.getAll("delivery"), condition: fd.getAll("condition") };
  }
  function render() {
    const f = filtersFromForm(); const term = state.q.toLowerCase();
    let list = D.marketProducts.filter(p => (!state.cat || p.cat === state.cat) && (!state.sub || p.sub === state.sub) && (!term || (p.title + " " + p.sub + " " + catName(p.cat)).toLowerCase().includes(term))
      && p.price >= f.min && p.price <= f.max && p.rating >= f.rating && (!f.seller.length || f.seller.includes(A.seller(p.seller).type))
      && (!f.delivery.length || f.delivery.some(d => p.delivery.includes(d))) && (!f.condition.length || f.condition.includes(p.condition))
      && (state.quick !== "deal" || p.deal) && (state.quick !== "member" || p.made101));
    const S = { pop: (a, b) => b.sold - a.sold, asc: (a, b) => a.price - b.price, desc: (a, b) => b.price - a.price, rating: (a, b) => b.rating - a.rating || b.reviews - a.reviews, new: (a, b) => b.added.localeCompare(a.added), rel: (a, b) => (b.made101 - a.made101) || b.sold * b.rating - a.sold * a.rating };
    list.sort(S[state.sort]);
    const pages = Math.max(1, Math.ceil(list.length / state.per)); state.page = Math.min(state.page, pages);
    const slice = list.slice((state.page - 1) * state.per, state.page * state.per);
    const g = $("#mk-grid"); g.className = "mk-grid " + state.view;
    g.innerHTML = slice.length ? slice.map(p => card(p, { wide: state.view === "list" })).join("") : `<div class="mk-empty card"><h3>No products match</h3><p>Try fewer filters, or <a href="rfq.html">post a buying request</a> and let sellers come to you.</p></div>`;
    $("#mk-count").textContent = `${list.length} result${list.length === 1 ? "" : "s"}${state.q ? ` for “${state.q}”` : ""}`;
    $("#h-browse").textContent = state.sub ? state.sub.toUpperCase() : state.cat ? catName(state.cat).toUpperCase() : "ALL PRODUCTS";
    // active filter chips
    const chips = [];
    if (state.q) chips.push(["q", `“${state.q}”`]); if (state.cat) chips.push(["cat", catName(state.cat)]); if (state.sub) chips.push(["sub", state.sub]);
    if (state.quick) chips.push(["quick", state.quick === "deal" ? "Deals only" : "Made by 101 members"]);
    $("#mk-active").innerHTML = chips.map(([k, l]) => `<button type="button" class="chip" data-clear="${k}" aria-label="Remove filter ${esc(l)}">${esc(l)} ✕</button>`).join("");
    $$("[data-clear]").forEach(b => b.onclick = () => { const k = b.dataset.clear; if (k === "cat") { state.cat = ""; state.sub = ""; $("#f-cat").value = ""; } else state[k] = ""; if (k === "q") $("#mk-q").value = ""; state.page = 1; render(); });
    const n = f.seller.length + f.delivery.length + f.condition.length + (f.rating ? 1 : 0) + (f.min ? 1 : 0) + (f.max < Infinity ? 1 : 0) + (state.cat ? 1 : 0);
    $("#f-count").textContent = n ? `(${n})` : "";
    // pagination
    const pg = $("#mk-pages"); const btn = (p, l, dis, cur) => `<button type="button" class="ib-sq${cur ? " cur" : ""}" data-p="${p}" ${dis ? "disabled" : ""} ${cur ? 'aria-current="page"' : ""} aria-label="${typeof l === "number" ? "Page " + l : l === "‹" ? "Previous page" : "Next page"}">${l}</button>`;
    pg.innerHTML = pages < 2 ? "" : btn(state.page - 1, "‹", state.page === 1) + Array.from({ length: pages }, (_, i) => btn(i + 1, i + 1, false, i + 1 === state.page)).join("") + btn(state.page + 1, "›", state.page === pages);
    $$("[data-p]", pg).forEach(b => b.onclick = () => { state.page = +b.dataset.p; render(); $("#browse").scrollIntoView(); });
  }
  function marketplace() {
    // hero carousel: only real listings (MarketAPI.heroSlides); no listings -> no band
    const slides = A.heroSlides(D.marketProducts);
    $("#mk-hero").hidden = !slides.length;
    if (slides.length) {
    const sl = $("#mk-slides"), dots = $("#mk-dots"); let cur = 0, timer = null, paused = lite();
    sl.innerHTML = slides.map((s, i) => `<article class="mk-slide t-${s.tone}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${slides.length}" ${i ? "hidden" : ""} ${s.img ? `style="background-image:url(${esc(img(s.img))})"` : ""}>
      <div class="mk-slide-in"><span class="mk-kick">${esc(s.k)}</span><h2>${esc(s.t)}</h2><p>${esc(s.s)}</p><a class="btn ${s.tone === "or" ? "ink" : "or"}" href="${s.href}" ${s.quick ? `data-quick="${s.quick}"` : ""}>${s.cta} →</a></div></article>`).join("");
    dots.innerHTML = slides.map((s, i) => `<button type="button" aria-label="Slide ${i + 1}: ${esc(s.k)}" aria-pressed="${i === 0}"></button>`).join("");
    const show = i => { cur = (i + slides.length) % slides.length; $$(".mk-slide", sl).forEach((s, j) => s.hidden = j !== cur); $$("button", dots).forEach((d, j) => d.setAttribute("aria-pressed", j === cur)); };
    const play = () => { clearInterval(timer); if (!paused) timer = setInterval(() => show(cur + 1), 6000); };
    $("#mk-prev").onclick = () => { show(cur - 1); play(); }; $("#mk-next").onclick = () => { show(cur + 1); play(); };
    $$("button", dots).forEach((d, j) => d.onclick = () => { show(j); play(); });
    const pb = $("#mk-pause"); const setP = v => { paused = v; pb.setAttribute("aria-pressed", v); pb.setAttribute("aria-label", v ? "Play carousel" : "Pause carousel"); pb.textContent = v ? "▶" : "❚❚"; play(); };
    pb.onclick = () => setP(!paused); setP(paused);
    $("#mk-hero").addEventListener("focusin", () => clearInterval(timer)); $("#mk-hero").addEventListener("mouseenter", () => clearInterval(timer)); $("#mk-hero").addEventListener("mouseleave", play);
    const ctl = $(".mk-hero-ctl"); ctl.hidden = slides.length < 2; ctl.style.display = slides.length < 2 ? "none" : "";   // css sets display:flex
    }
    // deals of the day: the band (and its midnight countdown) shows only when real discounted listings flagged as deals exist
    const dealList = A.deals(D.marketProducts), dealSec = $(".mk-deals");
    if (dealSec) dealSec.hidden = !dealList.length;
    const tick = () => { const now = Date.now(), eat = now + 3 * 36e5, end = Math.ceil(eat / 864e5) * 864e5 - 3 * 36e5, ms = Math.max(0, end - now);
      $("#cd-h").textContent = String(Math.floor(ms / 36e5)).padStart(2, "0"); $("#cd-m").textContent = String(Math.floor(ms % 36e5 / 6e4)).padStart(2, "0"); $("#cd-s").textContent = String(Math.floor(ms % 6e4 / 1e3)).padStart(2, "0"); };
    if (dealList.length) { tick(); setInterval(tick, 1000); }
    const none = t => `<p class="muted mk-none">${t}</p>`;
    $("#row-deals").innerHTML = dealList.slice().sort((a, b) => off(b) - off(a)).slice(0, 8).map(p => card(p)).join("");
    $("#row-made").innerHTML = D.marketProducts.filter(p => p.made101).sort((a, b) => b.rating - a.rating).slice(0, 8).map(p => card(p)).join("") || none("No member listings yet. Members' approved apps, templates and services show here.");
    A.fetchAffiliates().then(a => $("#row-aff").innerHTML = a.map(affCard).join(""));
    // filters
    const fc = $("#f-cat"); fc.innerHTML = `<option value="">All categories</option>` + D.marketCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join(""); fc.value = state.cat;
    fc.onchange = () => { state.cat = fc.value; state.sub = ""; state.page = 1; render(); };
    $("#mk-filters").addEventListener("input", () => { state.page = 1; render(); });
    $("#mk-filters").addEventListener("reset", () => setTimeout(() => { state.cat = state.sub = state.quick = ""; state.page = 1; render(); }));
    $$("[data-range]").forEach(b => b.onclick = () => { const [a, z] = b.dataset.range.split("-"); const f = $("#mk-filters"); f.min.value = a; f.max.value = z || ""; state.page = 1; render(); });
    $("#mk-sort").onchange = e => { state.sort = e.target.value; render(); };
    $$("[data-view]").forEach(b => { b.setAttribute("aria-pressed", b.dataset.view === state.view); b.onclick = () => { state.view = b.dataset.view; localStorage.setItem("mk_view", state.view); $$("[data-view]").forEach(x => x.setAttribute("aria-pressed", x === b)); render(); }; });
    $$("[data-quick]").forEach(a => a.addEventListener("click", () => { state.quick = a.dataset.quick; state.page = 1; render(); }));
    if (matchMedia("(max-width: 900px)").matches) $("#mk-fwrap").open = false;
    render();
  }

  /* ================= product-item.html ================= */
  async function productItem() {
    const p = q.get("id") ? await A.fetchProduct(q.get("id")) : null;
    if (!p) { const main = document.querySelector("main") || document.body;
      main.innerHTML = `<section class="wrap"><div class="mk-empty card"><h1>Listing not found</h1><p>This listing doesn't exist, isn't approved yet, or was removed.</p><p><a class="btn or" href="marketplace.html">Browse the marketplace</a></p></div></section>`; return; }
    const s = A.seller(p.seller); const sel = {};
    document.title = p.title + " · 101 Marketplace";
    $("#pi-crumbs").innerHTML = `<a href="marketplace.html">Marketplace</a> › <a href="marketplace.html?cat=${p.cat}#browse">${esc(catName(p.cat))}</a> › <a href="marketplace.html?cat=${p.cat}&sub=${encodeURIComponent(p.sub)}#browse">${esc(p.sub)}</a>`;
    // gallery + zoom
    const views = ["", "side", "top", "detail"], main = $("#pi-main"), im = $("#pi-img"); let zoom = false;
    im.src = img(p.img); im.alt = p.title;
    $("#pi-thumbs").innerHTML = views.map((v, i) => `<button type="button" aria-pressed="${!i}" aria-label="Image ${i + 1} of ${views.length}${v ? ": " + v + " view" : ""}"><img src="${img(p.img, v)}" alt="" width="72" height="72"></button>`).join("");
    $$("#pi-thumbs button").forEach((b, i) => b.onclick = () => { im.src = img(p.img, views[i]); $$("#pi-thumbs button").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    const setZoom = v => { zoom = v && !html.classList.contains("lite"); main.classList.toggle("zoom", zoom); $("#pi-zoom").setAttribute("aria-pressed", zoom); if (!zoom) im.style.transformOrigin = "50% 50%"; };
    main.onmousemove = e => { if (lite()) return; const r = main.getBoundingClientRect(); im.style.transformOrigin = `${(e.clientX - r.left) / r.width * 100}% ${(e.clientY - r.top) / r.height * 100}%`; if (!zoom && matchMedia("(hover:hover)").matches) setZoom(true); };
    main.onmouseleave = () => setZoom(false);
    $("#pi-zoom").onclick = e => { e.stopPropagation(); setZoom(!zoom); };
    main.onkeydown = e => { if (e.key.toLowerCase() === "z") setZoom(!zoom); };
    // info
    const o = off(p);
    $("#pi-badges").innerHTML = (p.made101 ? `<span class="mk-src m101">MADE BY 101</span>` : "") + (p.deal ? `<span class="mk-src deal">DEAL OF THE DAY</span>` : "") + `<span class="mk-tag">${esc(p.condition)}</span>`;
    $("#pi-title").textContent = p.title;
    $("#pi-rating").innerHTML = `${stars(p.rating)} <a href="#p-rev" data-tab="t-rev">${p.rating} · ${p.reviews} reviews</a> · ${p.sold.toLocaleString()} sold`;
    const unit = () => (p.variants || []).reduce((a, v) => a + (v.opts.find(x => x.v === sel[v.name]) || { d: 0 }).d, A.tierPrice(p, qty()));
    const qty = () => Math.max(1, +$("#pi-q").value || 1);
    const price = () => { const u = unit(), base = (p.variants || []).reduce((a, v) => a + (v.opts.find(x => x.v === sel[v.name]) || { d: 0 }).d, p.price);
      $("#pi-price").innerHTML = `<b>${ugx(u)}</b>${p.compare > p.price ? `<s>${ugx(p.compare + base - p.price)}</s><span class="mk-off">−${o}%</span>` : ""}${u < base ? `<small class="pi-tierapplied">Bulk price applied</small>` : ""}${qty() > 1 ? `<small>Total ${ugx(u * qty())}</small>` : ""}`;
      const next = (p.tiers || []).find(t => t.min > qty()); $("#pi-tierhint").textContent = next ? `Buy ${next.min}+ for ${ugx(next.price)} each` : ""; };
    $("#pi-variants").innerHTML = (p.variants || []).map(v => { sel[v.name] = v.opts.find(x => x.d === 0)?.v || v.opts[0].v;
      return `<fieldset><legend>${esc(v.name)}: <b data-vl="${esc(v.name)}">${esc(sel[v.name])}</b></legend><div class="filters">${v.opts.map(x => `<button type="button" class="chip" data-vn="${esc(v.name)}" data-vv="${esc(x.v)}" aria-pressed="${x.v === sel[v.name]}">${esc(x.v)}${x.d ? ` <small>${x.d > 0 ? "+" : "−"}${Math.abs(x.d / 1000)}k</small>` : ""}</button>`).join("")}</div></fieldset>`; }).join("");
    $$("[data-vn]").forEach(b => b.onclick = () => { sel[b.dataset.vn] = b.dataset.vv; $$(`[data-vn="${b.dataset.vn}"]`).forEach(x => x.setAttribute("aria-pressed", x === b)); $(`[data-vl="${b.dataset.vn}"]`).textContent = b.dataset.vv; price(); });
    $("#pi-stock").innerHTML = p.stock == null ? `<span class="ok">● Instant digital delivery</span>` : p.stock <= 10 ? `<span class="low">● Only ${p.stock} left in stock</span>` : `<span class="ok">● In stock (${p.stock})</span>`;
    $$("[data-step]").forEach(b => b.onclick = () => { $("#pi-q").value = Math.max(1, qty() + +b.dataset.step); price(); });
    $("#pi-q").oninput = price;
    // delivery estimate (EAT)
    const eta = () => { const r = $("#pi-region").value, dig = p.delivery.length === 1 && p.delivery[0] === "digital";
      const d = n => { const x = new Date(Date.now() + 3 * 36e5); x.setUTCDate(x.getUTCDate() + n); return x.toLocaleDateString("en-UG", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }); };
      const hr = new Date(Date.now() + 3 * 36e5).getUTCHours();
      $("#pi-eta").innerHTML = dig ? "<b>Instant:</b> download link and licence in your Orders right after payment." :
        !p.delivery.includes(r) ? `Not available for this item. Options: ${p.delivery.map(x => DELIV_T[x]).join(", ")}.` :
        r === "kampala" ? `<b>${hr < 15 ? "Today" : "Tomorrow, " + d(1)}</b> by boda · UGX 5,000. Order before 3 PM EAT for same-day.` :
        r === "upcountry" ? `<b>${d(2)} – ${d(4)}</b> by courier · UGX 15,000.` : `<b>Ready ${d(1)}</b> at your chosen pickup point · free.`; };
    $("#pi-region").onchange = eta;
    // cta
    const line = () => [p.id, qty(), Object.values(sel).join(" / "), unit()];
    $("#pi-add").onclick = () => { A.addToCart(...line()); updateCartCount(); $("#pi-msg").innerHTML = `Added to cart. <a href="cart.html">View cart</a>`; };
    $("#pi-buy").onclick = () => { A.addToCart(...line()); location.href = "checkout.html"; };
    const wb = $("#pi-wish"); const setW = on => { wb.setAttribute("aria-pressed", on); $("span", wb).textContent = on ? "Saved" : "Wishlist"; };
    setW(A.getWishlist().includes(p.id)); wb.onclick = () => setW(A.toggleWish(p.id));
    // seller + bulk
    $("#pi-seller").innerHTML = `<div class="mini-h">Sold by</div><div class="pi-sname"><span class="av" aria-hidden="true">${esc(s.name.split(" ").map(w => w[0]).join("").slice(0, 2))}</span><div><b>${esc(s.name)}</b>${s.verified ? ` <svg class="i vt" aria-label="Verified seller"><use href="#i-shieldc"/></svg>` : ""}<small>${esc(SELLER_T[s.type])} · ${esc(s.location)}</small></div></div>
      <dl class="pi-sstats"><div><dt>Rating</dt><dd>★ ${s.rating}</dd></div><div><dt>Sales</dt><dd>${s.sales.toLocaleString()}</dd></div><div><dt>Replies</dt><dd>${esc(s.response)}</dd></div></dl>
      <div class="row"><a class="btn sm" href="marketplace.html?q=${encodeURIComponent(s.name)}#browse">Visit shop</a><a class="btn sm" href="#p-qa" data-tab="t-qa">Ask a question</a></div>`;
    const tiers = p.tiers || [{ min: 1, max: 9, price: p.price }, { min: 10, max: 49, price: Math.round(p.price * .93 / 500) * 500 }, { min: 50, max: null, price: Math.round(p.price * .87 / 500) * 500 }];
    $("#pi-bulk").innerHTML = `<div class="mini-h">Bulk pricing</div><table class="t pi-tiers"><caption class="sr-only">Price per unit by quantity</caption><thead><tr><th scope="col">Quantity</th><th scope="col">Price / unit</th></tr></thead><tbody>${tiers.map(t => `<tr><td>${t.min}${t.max ? "–" + t.max : "+"}</td><td><b>${ugx(t.price)}</b></td></tr>`).join("")}</tbody></table>
      ${p.tiers ? "" : `<p class="muted" style="font-size:var(--step--2)">Indicative. Final bulk price is set by the seller's quote.</p>`}
      <a class="btn sm cy" href="rfq.html?product=${encodeURIComponent(p.id)}">Request a quote</a>`;
    // tabs
    const tabs = $$("[role=tab]"); const selT = (t, focus) => { tabs.forEach(x => { const on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1; $("#" + x.getAttribute("aria-controls")).hidden = !on; }); if (focus) t.focus(); };
    tabs.forEach((t, i) => { t.onclick = () => selT(t); t.onkeydown = e => { if (e.key === "ArrowRight") selT(tabs[(i + 1) % tabs.length], 1); if (e.key === "ArrowLeft") selT(tabs[(i + tabs.length - 1) % tabs.length], 1); }; });
    $$("[data-tab]").forEach(a => a.onclick = e => { e.preventDefault(); selT($("#" + a.dataset.tab)); $(".pi-tabs-wrap").scrollIntoView(); });
    $("#p-desc").innerHTML = `<div class="prose"><p>${esc(p.desc || `${p.title}. Sold by ${s.name}, ${SELLER_T[s.type].toLowerCase()} in ${s.location}.`)}</p><ul><li>Category: ${esc(catName(p.cat))} › ${esc(p.sub)}</li><li>Condition: ${esc(p.condition)}</li><li>Delivery: ${p.delivery.map(x => DELIV_T[x]).join(", ")}</li><li>Covered by 101 Buyer Protection: payment held by our licensed payment provider until you confirm delivery, 7-day returns</li></ul></div>`;
    const specs = p.specs || { Category: catName(p.cat), Type: p.sub, Condition: p.condition, Seller: s.name };
    $("#p-specs").innerHTML = `<table class="t pi-specs"><caption class="sr-only">Specifications</caption><tbody>${Object.entries(specs).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table>`;
    const revs = await A.fetchReviews(p.id); const dist = [5, 4, 3, 2, 1].map(n => [n, revs.length ? Math.round(revs.filter(r => Math.round(r.stars) === n).length / revs.length * 100) : 0]);
    $("#p-rev").innerHTML = `<div class="pi-revtop"><div class="pi-avg"><b>${p.rating}</b>${stars(p.rating)}<small>${p.reviews} reviews</small></div><div class="pi-dist">${dist.map(([n, pc]) => `<div><span>${n}★</span><i><b style="width:${pc}%"></b></i><span>${pc}%</span></div>`).join("")}</div>
      <div class="filters" role="group" aria-label="Filter reviews"><button class="chip" type="button" aria-pressed="true" data-rf="all">All</button><button class="chip" type="button" aria-pressed="false" data-rf="photos">With photos</button><button class="chip" type="button" aria-pressed="false" data-rf="verified">Verified purchase</button></div></div><div class="list" id="rev-list"></div>`;
    const rl = f => $("#rev-list").innerHTML = revs.filter(r => f === "all" || (f === "photos" ? r.photos.length : r.verified)).map(r => `<article class="li pi-rev"><div class="grow"><div>${stars(r.stars)} <b>${esc(r.who)}</b> ${r.verified ? `<span class="mk-tag st-member">✓ Verified purchase</span>` : ""} <small>${esc(r.date)}</small></div><p>${esc(r.text)}</p>${r.photos.length ? `<div class="pi-rphotos">${r.photos.map(ph => `<img src="${img(ph.split("--")[0], ph.split("--")[1])}" alt="Buyer photo" width="64" height="64" loading="lazy">`).join("")}</div>` : ""}<button class="btn sm" type="button">Helpful</button></div></article>`).join("") || `<p class="muted">No reviews match.</p>`;
    rl("all"); $$("[data-rf]").forEach(b => b.onclick = () => { $$("[data-rf]").forEach(x => x.setAttribute("aria-pressed", x === b)); rl(b.dataset.rf); });
    const qa = await A.fetchQA(p.id);
    $("#p-qa").innerHTML = `<form class="row" id="qa-form"><label class="field" style="flex:1;min-width:220px"><span>Ask the seller</span><input name="t" required placeholder="e.g. Does it work with Ubuntu?"></label><button class="btn or" style="align-self:flex-end">Ask</button></form><p id="qa-msg" role="status" class="muted"></p>
      <div class="list" style="margin-top:12px">${qa.map(x => `<div class="li"><div class="grow"><b>Q: ${esc(x.q)}</b><p>A: ${esc(x.a)} <small>— ${esc(x.by)} · ${x.votes} found helpful</small></p></div></div>`).join("")}</div>`;
    $("#qa-form").onsubmit = async e => { e.preventDefault(); await A.askQuestion(p.id, e.target.t.value); $("#qa-msg").textContent = "Sent. The seller usually replies " + s.response + "."; e.target.reset(); };
    $("#row-also").innerHTML = D.marketProducts.filter(x => x.id !== p.id && (x.cat === p.cat || x.seller === p.seller)).concat(D.marketProducts.filter(x => x.cat !== p.cat)).slice(0, 6).map(x => card(x)).join("");
    price(); eta();
  }

  /* ================= cart.html ================= */
  function cart() {
    const draw = () => {
      const c = A.getCart(), active = c.filter(l => !l.saved), saved = c.filter(l => l.saved);
      const row = (l, i) => { const p = A.product(l.id); if (!p) return ""; return `<article class="cart-line"><img src="${img(p.img)}" alt="" width="88" height="88"><div class="grow"><a href="product-item.html?id=${p.id}"><b>${esc(p.title)}</b></a>${l.variant ? `<small>${esc(l.variant)}</small>` : ""}<small>${esc(A.seller(p.seller).name)} · ${DELIV_T[p.delivery[0]]}</small>
        <div class="row cart-acts">${l.saved ? "" : `<div class="stepper"><button type="button" class="ib-sq" data-q="${i}" data-d="-1" aria-label="Decrease quantity of ${esc(p.title)}">−</button><span aria-live="polite">${l.qty}</span><button type="button" class="ib-sq" data-q="${i}" data-d="1" aria-label="Increase quantity of ${esc(p.title)}">+</button></div>`}
        <button class="btn sm" type="button" data-save="${i}">${l.saved ? "Move to cart" : "Save for later"}</button><button class="btn sm" type="button" data-del="${i}">Remove</button></div></div><b class="cart-price">${ugx(l.price * l.qty)}</b></article>`; };
      $("#cart-lines").innerHTML = active.length ? active.map(l => row(l, c.indexOf(l))).join("") : `<div class="mk-empty"><h3>Your cart is empty</h3><p><a class="btn or" href="marketplace.html">Browse the marketplace</a></p></div>`;
      $("#cart-saved-wrap").hidden = !saved.length; $("#cart-saved").innerHTML = saved.map(l => row(l, c.indexOf(l))).join("");
      const sub = active.reduce((a, l) => a + l.price * l.qty, 0), n = active.reduce((a, l) => a + l.qty, 0);
      const phys = active.some(l => (A.product(l.id) || { delivery: [] }).delivery.some(d => d !== "digital"));
      $("#cart-sum").innerHTML = `<div><dt>Items (${n})</dt><dd>${ugx(sub)}</dd></div><div><dt>Delivery</dt><dd>${phys ? "From UGX 0 (pickup)" : "Free (digital)"}</dd></div><div class="tot"><dt>Subtotal</dt><dd>${ugx(sub)}</dd></div>`;
      const to = $("#to-checkout"); to.toggleAttribute("aria-disabled", !n); to.classList.toggle("dis", !n);
      $$("[data-q]").forEach(b => b.onclick = () => { const c2 = A.getCart(); const l = c2[b.dataset.q]; l.qty = Math.max(1, l.qty + +b.dataset.d); A.setCart(c2); draw(); });
      $$("[data-save]").forEach(b => b.onclick = () => { const c2 = A.getCart(); c2[b.dataset.save].saved = !c2[b.dataset.save].saved; A.setCart(c2); draw(); });
      $$("[data-del]").forEach(b => b.onclick = () => { const c2 = A.getCart(); c2.splice(b.dataset.del, 1); A.setCart(c2); draw(); });
      updateCartCount();
    };
    $("#to-checkout").addEventListener("click", e => { if (!A.cartCount()) e.preventDefault(); });
    draw();
  }

  /* ================= checkout.html ================= */
  function checkout() {
    const lines = A.getCart().filter(l => !l.saved && A.product(l.id)), opts = D.marketDelivery.options;
    const allDigital = lines.length && lines.every(l => A.product(l.id).delivery.join() === "digital");
    $("#co-deliv").innerHTML = allDigital ? `<p class="co-opt on"><span><b>Instant digital delivery</b><small>Download links and licence keys appear in My orders after payment. No delivery fee.</small></span></p>` :
      opts.map((o, i) => `<label class="co-opt"><input type="radio" name="delivery" value="${o.id}" ${i === 0 ? "checked" : ""}><span><b>${esc(o.name)} · ${o.fee ? ugx(o.fee) : "Free"}</b><small>${esc(o.eta)}${o.areas ? " · " + esc(o.areas) : ""}</small></span></label>`).join("");
    $("#co-pp").innerHTML = opts.find(o => o.id === "pickup").points.map(p => `<option>${esc(p)}</option>`).join("");
    const f = $("#co-form");
    const sum = () => { const d = allDigital ? null : opts.find(o => o.id === (f.delivery ? f.delivery.value : "boda")); const sub = lines.reduce((a, l) => a + l.price * l.qty, 0), fee = d ? d.fee : 0;
      $("#co-pp-wrap").hidden = !d || d.id !== "pickup";
      $("#co-lines").innerHTML = lines.map(l => { const p = A.product(l.id); return `<div class="co-line"><img src="${img(p.img)}" alt="" width="48" height="48"><span>${esc(p.title)}${l.variant ? ` · ${esc(l.variant)}` : ""} <small>× ${l.qty}</small></span><b>${ugx(l.price * l.qty)}</b></div>`; }).join("") || `<p class="muted">Your cart is empty. <a href="marketplace.html">Browse the marketplace</a>.</p>`;
      $("#co-sum").innerHTML = `<div><dt>Subtotal</dt><dd>${ugx(sub)}</dd></div><div><dt>Delivery</dt><dd>${fee ? ugx(fee) : "Free"}</dd></div><div class="tot"><dt>Total</dt><dd>${ugx(sub + fee)}</dd></div>`;
      $("#co-place").textContent = `Place order & pay ${ugx(sub + fee)}`; $("#co-place").disabled = !lines.length; };
    f.addEventListener("change", sum);
    const dist = $("#co-district"); dist.onchange = () => { if (allDigital) return; const up = !["Kampala", "Wakiso", "Mukono", "Entebbe"].includes(dist.value); const r = f.querySelector(`[name=delivery][value=${up ? "courier" : "boda"}]`); if (r) { r.checked = true; sum(); } };
    f.onsubmit = async e => {
      e.preventDefault(); const msg = $("#co-msg"), FE = window.CC_UI.fieldError; FE(f.name, ""); FE(f.phone, ""); msg.textContent = "";
      if (!f.name.value.trim()) FE(f.name, "Enter your full name, as it should appear on the delivery.");
      if (!/^(\+?256|0)7\d{8}$/.test(f.phone.value.replace(/\s/g, ""))) FE(f.phone, f.phone.value.trim() ? "That number doesn't look right. Use a Ugandan mobile number, e.g. 0772 123 456." : "Enter your mobile number, e.g. 0772 123 456.");
      const bad = f.querySelector("[aria-invalid=true]"); if (bad) { msg.textContent = "Check the details marked above."; bad.focus(); return; }
      $("#co-place").disabled = true; msg.textContent = f.pay.value === "Card (Flutterwave)" ? "Opening secure card payment…" : `Check your phone: approve the ${f.pay.value} prompt.`;
      let res; try { res = await A.checkout({ lines, delivery: allDigital ? "digital" : f.delivery.value, pickupPoint: f.pickupPoint.value, pay: f.pay.value, phone: f.phone.value, name: f.name.value, district: dist.value }); } catch (err) { msg.textContent = err.message || "Checkout failed. Nothing was charged."; $("#co-place").disabled = false; return; }
      if (res && res.checkout_url) return;   // the payment page takes over
      if (!res || !res.orderId) { msg.textContent = "Checkout failed. Nothing was charged."; $("#co-place").disabled = false; return; }
      location.href = "orders.html?placed=" + encodeURIComponent(res.orderId);
    };
    sum();
  }

  /* ================= orders.html ================= */
  const STEPS = ["Order placed", "Paid · payment held", "Shipped / dispatched", "Out for delivery", "Delivered", "Confirmed · seller paid"];
  async function orders() {
    let all = await A.fetchOrders(), filter = "all";
    if (q.get("placed")) $("#ord-placed").innerHTML = `<div class="card mk-ok"><b>Order ${esc(q.get("placed"))} placed.</b> Our licensed payment provider holds your payment until you confirm delivery. Track it below.</div>`;
    const draw = () => {
      const L = all.filter(o => filter === "all" || (filter === "done" ? o.status >= 5 : filter === "dispute" ? o.dispute : o.status < 5 && !o.dispute));
      $("#ord-list").innerHTML = L.map(o => {
        const steps = STEPS.map((s, i) => ({ s: o.delivery === "digital" && i === 3 ? "Digital access sent" : s, t: o.track[i], done: i <= o.status }));
        const canConfirm = o.status === 4 && !o.dispute, canDispute = o.status >= 1 && !o.dispute;
        return `<article class="card ord" aria-labelledby="o-${o.id}"><header class="ord-h"><div><h2 id="o-${o.id}">${esc(o.id)}</h2><small>Placed ${esc(o.date)} · ${esc(o.pay)} · ${o.delivery === "digital" ? "Digital" : esc(DELIV_T[o.delivery === "boda" ? "kampala" : o.delivery === "courier" ? "upcountry" : o.delivery] || o.delivery)}${o.pickupPoint && o.delivery === "pickup" ? " · " + esc(o.pickupPoint) : ""}</small></div>
          <span class="pill ${o.dispute ? "suspended" : o.status >= 5 ? "paid" : "pending"}">${o.dispute ? "Dispute · " + esc(o.dispute.state) : o.status >= 5 ? "Completed" : esc(STEPS[o.status])}</span><b class="ord-tot">${ugx(o.total)}</b></header>
          <div class="ord-items">${o.items.map(it => { const p = A.product(it.id) || { img: "", title: it.title || it.id }; return `<a href="product-item.html?id=${it.id}"><img src="${img(p.img)}" alt="" width="56" height="56"><span>${esc(p.title)} <small>× ${it.qty}</small></span></a>`; }).join("")}</div>
          <ol class="ord-track" aria-label="Tracking for ${esc(o.id)}">${steps.map((x, i) => `<li class="${x.done ? "done" : ""}${i === o.status && o.status < 5 ? " now" : ""}"><b>${esc(x.s)}</b><small>${x.t ? esc(x.t) + " EAT" : x.done ? "✓" : "—"}</small></li>`).join("")}</ol>
          <div class="row ord-acts">${canConfirm ? `<button class="btn or" type="button" data-confirm="${o.id}">Confirm delivery</button><small class="muted">Releases ${ugx(o.total)} to the seller. Auto-release in 72 hours.</small>` : ""}
          ${o.status >= 5 ? `<span class="muted">Seller paid.</span> <a class="btn sm" href="product-item.html?id=${o.items[0].id}#p-rev">Write a review</a>` : ""}
          ${canDispute ? `<button class="btn sm" type="button" data-dispute="${o.id}">Return / dispute</button>` : ""}
          ${o.dispute ? `<span class="muted">Dispute opened ${esc(o.dispute.opened)}: ${esc(o.dispute.reason)} → ${esc(o.dispute.want)}. Payment frozen while we review it.</span>` : ""}</div></article>`; }).join("") || `<p class="muted">No orders here yet.</p>`;
      $$("[data-confirm]").forEach(b => b.onclick = async () => { if (!confirm("Confirm you received everything in good condition? This releases payment to the seller.")) return;
        const o = all.find(x => x.id === b.dataset.confirm); const t = [...o.track]; t[5] = new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 16).replace("T", " ");
        if (refused(await A.confirmDelivery(o.id, t))) return; o.status = 5; o.track = t; draw(); });
      $$("[data-dispute]").forEach(b => b.onclick = () => { const d = $("#dsp"); d.dataset.id = b.dataset.dispute; $("#dsp-sub").textContent = "Order " + b.dataset.dispute; d.showModal ? d.showModal() : d.setAttribute("open", ""); });
    };
    $("#dsp-form").addEventListener("submit", async e => {
      const d = $("#dsp"); if (e.submitter && e.submitter.value === "cancel") return;
      const f = e.target; if (!f.reason.value) { e.preventDefault(); f.reason.focus(); return; }
      const body = { reason: f.reason.value, want: f.want.value, details: f.details.value };
      if (refused(await A.openDispute(d.dataset.id, body))) return; const o = all.find(x => x.id === d.dataset.id); o.dispute = { ...body, opened: new Date().toISOString().slice(0, 10), state: "Under review" }; f.reset(); draw();
    });
    $$("#ord-filter [data-f]").forEach(b => b.onclick = () => { filter = b.dataset.f; $$("#ord-filter [data-f]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
    draw();
  }

  /* ================= seller.html ================= */
  async function seller() {
    const S = await A.fetchSellerOverview(), k = S.kpis;
    { const h = $("#seller-name"), me = S.me && D.marketSellers && D.marketSellers[S.me];   // never a seed shop name on a real account (BUS Q9)
      if (h) h.textContent = (S.store && S.store.name) || (me && me.name) || (S.empty ? "NAME YOUR SHOP" : "YOUR SHOP"); }
    $("#overview").innerHTML = [["Revenue · 30 days", ugx(k.revenue30), "or"], ["Orders · 30 days", k.orders30, ""], ["Conversion", k.conversion, "cy"], ["Shop rating", S.empty ? "–" : "★ " + k.rating, "ink"]].map(([l, v, c]) => `<div class="kpi ck-skin ${c}"><small>${l}</small><b>${v}</b></div>`).join("");
    $("#sl-cat").innerHTML = D.marketCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    // images preview
    $("#sl-imgs").onchange = e => { const fs = [...e.target.files].slice(0, 8); $("#sl-prev").innerHTML = fs.map((f, i) => `<figure><img src="${URL.createObjectURL(f)}" alt="Upload ${i + 1}: ${esc(f.name)}" width="88" height="88">${i === 0 ? "<figcaption>Cover</figcaption>" : ""}</figure>`).join(""); };
    // variants repeater
    let vn = 0; const addVar = () => { const i = vn++; const d = document.createElement("div"); d.className = "grid g4 sl-var"; d.innerHTML = `<label class="field">Option name<input name="vname${i}" placeholder="e.g. Memory"></label><label class="field">Value<input name="vval${i}" placeholder="e.g. 16GB"></label><label class="field">Price change (UGX)<input name="vd${i}" type="number" inputmode="numeric" value="0"></label><label class="field">Stock<input name="vs${i}" type="number" inputmode="numeric" value="5"></label>`; $("#sl-vars").appendChild(d); };
    $("#sl-addvar").onclick = addVar; addVar();
    $("#sl-form").onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target); const body = Object.fromEntries([...fd].filter(([, v]) => !(v instanceof File))); body.delivery = fd.getAll("delivery");
      const r = await A.saveProduct(body); $("#sl-msg").textContent = `Submitted “${body.title}”. Status: ${r.status}.`; };
    // queue
    const NEXT = { "New": "Accept", "Paid · payment held": "Send licence", "Paid · in escrow": "Send licence", "Shipped": "Mark delivered" };
    $("#sl-queue tbody").innerHTML = S.queue.map((o, i) => `<tr><td><b>${esc(o.id)}</b></td><td>${esc(o.buyer)}</td><td>${esc(o.item)} × ${o.qty}</td><td>${ugx(o.total)}</td><td>${esc(o.delivery)}</td><td><span class="pill ${o.status === "Delivered" ? "paid" : "pending"}" data-st="${i}">${esc(o.status)}</span></td><td>${esc(o.due)}</td><td>${NEXT[o.status] ? `<button class="btn sm or" type="button" data-adv="${i}">${NEXT[o.status]}</button>` : `<span class="muted">Waiting</span>`}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">No orders yet. New orders for your listings appear here.</td></tr>`;
    const FLOW = { "New": "Shipped", "Paid · payment held": "Delivered", "Paid · in escrow": "Delivered", "Shipped": "Delivered" };
    $$("[data-adv]").forEach(b => b.onclick = async () => { const o = S.queue[b.dataset.adv]; if (refused(await A.updateOrderStatus(o.id, FLOW[o.status]))) return; o.status = FLOW[o.status]; $(`[data-st="${b.dataset.adv}"]`).textContent = o.status; b.replaceWith(Object.assign(document.createElement("span"), { className: "muted", textContent: "Updated" })); });
    // payouts
    $("#sl-bal").innerHTML = `<div class="kpi ck-skin or"><small>Available to withdraw</small><b>${ugx(k.available)}</b></div><div class="kpi ck-skin"><small>Held until delivery</small><b>${ugx(k.escrow)}</b><i>Held by our payment provider until buyers confirm delivery</i></div>`;
    const pl = () => $("#sl-plist").innerHTML = S.payouts.map(p => `<div class="li"><span class="date"><b>${p.date.slice(8)}</b>${new Date(p.date).toLocaleString("en", { month: "short" })}</span><div class="grow"><b>${ugx(p.amount)}</b><small>${esc(p.to)}</small></div><span class="pill ${p.status === "paid" ? "paid" : "pending"}">${p.status}</span></div>`).join("") || `<p class="muted">No payouts yet.</p>`; pl();
    $("#sl-payout").onsubmit = async e => { e.preventDefault(); const a = +e.target.amount.value; if (a > k.available) { $("#sl-pmsg").textContent = "That is more than your available balance."; return; }
      if (refused(await A.requestSellerPayout(a, e.target.to.value))) return; k.available -= a; S.payouts.unshift({ date: new Date().toISOString().slice(0, 10), amount: a, to: e.target.to.value, status: "pending" }); pl();
      $("#sl-bal .kpi b").textContent = ugx(k.available); $("#sl-pmsg").textContent = "Payout requested. Mobile money payouts usually land within 1 hour."; e.target.reset(); };
    // charts (Chart.js when available; text alternative always)
    $("#an-text").textContent = !S.sales.labels.length ? "No sales yet. Your weekly sales and category share appear after your first order." : "Weekly sales: " + S.sales.labels.map((l, i) => `${l} ${ugx(S.sales.ugx[i])} (${S.sales.orders[i]} orders)`).join("; ") + ". Share by category: " + S.byCategory.labels.map((l, i) => `${l} ${S.byCategory.values[i]}%`).join(", ") + ".";
    const charts = () => { if (!window.Chart) return false; const OR = "#fc8c0c", INK = "#0B1236", CY = "#05e6f2"; const anim = lite() ? false : undefined;
      new Chart($("#ch-sales"), { type: "bar", data: { labels: S.sales.labels, datasets: [{ type: "bar", label: "Sales (UGX)", data: S.sales.ugx, backgroundColor: INK, yAxisID: "y" }, { type: "line", label: "Orders", data: S.sales.orders, borderColor: OR, backgroundColor: OR, borderWidth: 3, yAxisID: "y1" }] }, options: { animation: anim, maintainAspectRatio: false, scales: { y: { ticks: { callback: v => v / 1e6 + "M" } }, y1: { position: "right", grid: { display: false } } } } });
      new Chart($("#ch-cat"), { type: "doughnut", data: { labels: S.byCategory.labels, datasets: [{ data: S.byCategory.values, backgroundColor: [OR, CY, INK], borderColor: "#fff", borderWidth: 2 }] }, options: { animation: anim, maintainAspectRatio: false, plugins: { legend: { position: "right" } } } }); return true; };
    if (!charts()) { let n = 0; const t = setInterval(() => { if (charts() || ++n > 20) { clearInterval(t); if (!window.Chart) $$(".chart-box").forEach(b => b.outerHTML = `<p class="muted">${esc($("#an-text").textContent)}</p>`); } }, 250); }
    // reviews
    $("#sl-reviews").innerHTML = S.reviews.map((r, i) => `<article class="li sl-rev"><div class="grow"><div>${stars(r.stars)} <b>${esc(r.who)}</b> on <i>${esc(r.item)}</i></div><p>${esc(r.text)}</p>
      ${r.reply ? `<p class="sl-reply"><b>Your reply:</b> ${esc(r.reply)}</p>` : `<form class="row" data-rv="${i}"><label class="field" style="flex:1;min-width:200px"><span class="sr-only">Reply to ${esc(r.who)}</span><input name="t" required placeholder="Write a public reply…"></label><button class="btn sm or" style="align-self:flex-end">Reply</button></form>`}</div></article>`).join("") || `<p class="muted">No reviews yet. Only buyers who received an order can review it.</p>`;
    $$("[data-rv]").forEach(f => f.onsubmit = async e => { e.preventDefault(); const t = f.t.value; if (refused(await A.replyReview(f.dataset.rv, t))) return; f.outerHTML = `<p class="sl-reply"><b>Your reply:</b> ${esc(t)}</p>`; });
  }

  /* ================= rfq.html ================= */
  async function rfq() {
    $("#rfq-cat").innerHTML = D.marketCategories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    const pid = q.get("product"); if (pid && A.product(pid)) { const p = A.product(pid); $("#rfq-title").value = "Bulk quote: " + p.title; $("#rfq-cat").value = p.cat; }
    const f = $("#rfq-form"); const dl = new Date(Date.now() + 10 * 864e5); f.deadline.value = dl.toISOString().slice(0, 10);
    let data = await A.fetchRFQ();
    const drawMine = () => $("#rfq-mine").innerHTML = data.mine.map(r => `<article class="card rfq" aria-labelledby="r-${r.id}"><header class="ord-h"><div><h3 id="r-${r.id}">${esc(r.title)}</h3><small>${esc(r.id)} · ${r.qty} ${esc(r.unit)} · deliver to ${esc(r.deliverTo)} · quotes by ${esc(r.deadline)}${r.target ? " · target " + ugx(r.target) + "/unit" : ""}</small></div><span class="pill ${r.status === "Accepted" ? "paid" : "pending"}">${esc(r.status)}</span></header>
      ${r.quotes.length ? `<div class="tbl-wrap"><table class="t rfq-q"><caption class="sr-only">Quotes for ${esc(r.title)}</caption><thead><tr><th scope="col">Seller</th><th scope="col">Price / unit</th><th scope="col">Total for ${r.qty}</th><th scope="col">MOQ</th><th scope="col">Lead time</th><th scope="col">Note</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead><tbody>
      ${r.quotes.slice().sort((a, b) => a.unit - b.unit).map(x => { const s = A.seller(x.seller); return `<tr${x.best ? ' class="best"' : ""}><td><b>${esc(s.name)}</b><small> ★ ${s.rating} · ${esc(SELLER_T[s.type])}</small></td><td><b>${ugx(x.unit)}</b>${r.target && x.unit <= r.target ? ' <span class="mk-tag st-member">≤ target</span>' : ""}</td><td>${ugx(x.unit * r.qty)}</td><td>${x.moq}</td><td>${esc(x.lead)}</td><td>${esc(x.note)}</td><td>${r.status === "Accepted" ? (r.accepted === x.seller ? "<b>Accepted ✓</b>" : "") : `<button class="btn sm or" type="button" data-acc="${r.id}|${x.seller}">Accept</button>`}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted">No quotes yet. Quotes from sellers appear here.</p>`}</article>`).join("");
    const bind = () => $$("[data-acc]").forEach(b => b.onclick = async () => { const [id, s] = b.dataset.acc.split("|"); if (refused(await A.acceptQuote(id, s))) return; const r = data.mine.find(x => x.id === id); r.status = "Accepted"; r.accepted = s; drawMine(); bind();
      $("#rfq-msg").textContent = ""; });
    drawMine(); bind();
    $("#rfq-open").innerHTML = data.open.map(r => `<article class="card rfq-o"><h3>${esc(r.title)}</h3><p class="muted">${esc(r.buyer)} · ${r.qty} ${esc(r.unit)} · ${esc(r.deliverTo)} · by ${esc(r.deadline)}</p><p>Target ${ugx(r.target)}/unit · ${r.quotes} quotes so far</p>
      <form class="row" data-quote="${r.id}"><label class="field" style="flex:1;min-width:140px">Your price / unit (UGX)<input name="unit" type="number" min="0" required inputmode="numeric"></label><label class="field" style="flex:1;min-width:120px">Lead time<input name="lead" placeholder="e.g. 3 days" required></label><button class="btn sm or" style="align-self:flex-end">Send quote</button></form><p role="status" class="muted"></p></article>`).join("");
    $$("[data-quote]").forEach(fq => fq.onsubmit = async e => { e.preventDefault(); if (refused(await A.sendQuote(fq.dataset.quote, { unit: +fq.unit.value, lead: fq.lead.value }))) return; fq.nextElementSibling.textContent = "Quote sent. The buyer will see it in their request."; fq.reset(); });
    f.onsubmit = async e => { e.preventDefault(); const fd = new FormData(f); const body = Object.fromEntries([...fd].filter(([, v]) => !(v instanceof File))); body.qty = +body.qty; body.target = +body.target || 0;
      let r; try { r = await A.postRFQ(body); } catch (err) { $("#rfq-msg").textContent = err.message; return; } data.mine.unshift(r); drawMine(); bind(); $("#rfq-msg").textContent = `Posted ${r.id}. Sellers have been notified.`; f.reset(); f.deadline.value = dl.toISOString().slice(0, 10); };
  }

  marketBar();
  /* round 11: draw only once the catalogue is known (backend / demo / empty) so seeded rows never flash */
  (A.ready || Promise.resolve()).then(() => ({ marketplace, "product-item": productItem, cart, checkout, orders, seller, rfq }[page] || (() => {}))());
})();
