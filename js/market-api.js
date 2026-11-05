/* 101 Marketplace — every marketplace network call lives here (stubs).
   Each function tries the backend (API_BASE + endpoint). Round 11: js/market-data.js placeholders appear ONLY for ?static=1 or an admin's ?demo=1;
   a real visit gets the backend's answer or an honest empty state (no fake listings, sellers, orders or success).
   Cart, wishlist, placed orders and RFQs are kept in localStorage until the backend exists.
   Payments: MTN MoMo / Airtel Money / card all go through Flutterwave; the server prices every order and returns the checkout URL (SR-17).
   Escrow: the buyer's money is held by 101 until "Confirm delivery" (or auto-release 72 h after delivered); disputes freeze it.
   Backend endpoints expected (TODO):
     GET  /market/products?q=&cat=&min=&max=&rating=&seller=&delivery=&condition=&sort=&page=
     GET  /market/products/:id          GET /market/search/suggest?q=
     GET  /market/affiliates            (Amazon/Alibaba picks, with affiliate-tagged URLs server-side)
     POST /market/cart  POST /market/checkout  → { orderId, flwTxRef }
     GET  /market/orders   POST /market/orders/:id/confirm   POST /market/orders/:id/dispute
     GET  /market/seller/overview  POST /market/seller/products  POST /market/seller/orders/:id/status
     POST /market/seller/payouts   POST /market/seller/reviews/:id/reply
     GET  /market/rfq   POST /market/rfq   POST /market/rfq/:id/quotes   POST /market/rfq/:id/accept */
(function () {
  const D = () => window.CC_DATA;
  const q = new URLSearchParams(location.search);
  const STATIC = q.has("static");
  const API_BASE = (window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api";
  const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };

  async function backend(path, opts = {}) {
    if (STATIC || location.protocol === "file:") throw new Error("no backend");
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    try {
      const V = window.CC_V1, v1 = V && V.toV1(path); if (!v1) throw new Error("no v1 endpoint");
      const r = await fetch(API_BASE + v1, { credentials: "include", ...opts, signal: ctl.signal, headers: { Accept: "application/json", "Content-Type": "application/json", ...(opts.headers || {}) } });
      if (!r.ok) throw new Error(r.status); return V.unwrap(await r.json());
    } finally { clearTimeout(t); }
  }
  async function or(path, fallback, opts) { try { return await backend(path, opts); } catch (e) { return typeof fallback === "function" ? fallback() : fallback; } }

  /* ---------- round 11: seeded listings never reach a real visit ----------
     js/market-data.js people, listings, reviews, orders and seller numbers are kept aside and shown ONLY for ?static=1 or an
     admin's ?demo=1 (server-confirmed role). Everyone else sees the backend's answer, or honest empty states.
     Categories, delivery options, the FX rate and the affiliate search links are reference data (no people or money) and stay. */
  const ZERO_SELLER = { kpis: { revenue30: 0, orders30: 0, conversion: "0%", rating: "–", available: 0, escrow: 0 }, queue: [], payouts: [], reviews: [],
    sales: { labels: [], ugx: [], orders: [] }, byCategory: { labels: [], values: [] }, empty: true };
  const SEED = {};
  ["marketProducts", "marketSellers", "marketReviews", "marketQA", "marketOrders", "marketSeller", "marketRFQ"].forEach(k => { SEED[k] = D()[k]; });
  const EMPTY = { marketProducts: [], marketSellers: {}, marketReviews: [], marketQA: [], marketOrders: [], marketSeller: ZERO_SELLER, marketRFQ: { mine: [], open: [] } };
  const demoURL = /[?&]demo=1(&|$)/.test(location.search);
  const demoOK = () => STATIC || (demoURL && !!(window.CCAccess && CCAccess.can && CCAccess.can("demo.view")));
  const useSeed = on => Object.keys(EMPTY).forEach(k => { D()[k] = on ? SEED[k] : (Array.isArray(EMPTY[k]) ? [] : JSON.parse(JSON.stringify(EMPTY[k]))); });
  if (!STATIC) useSeed(false);
  const UNKNOWN_SELLER = { id: "", name: "Seller", type: "individual", rating: 0, sales: 0, joined: "", response: "after review", location: "", verified: false };
  /* backend row (mkt_products) → the card shape js/market.js draws */
  const TYPE_CAT = { digital: "software", software_license: "software", course_bundle: "courses", service: "services", physical: "laptops" };
  function fromRow(r) {
    if (!r || r.title == null) return null;
    const st = r.mkt_stores || {}, sid = "st-" + (r.store_id || st.slug || "");
    if (!D().marketSellers[sid]) D().marketSellers[sid] = { ...UNKNOWN_SELLER, id: sid, name: st.name || "Seller", rating: +st.rating_avg || 0 };
    const digital = /digital|license|bundle|service/.test(r.type || "");
    return { id: r.slug || r.id, uuid: r.id, title: r.title, cat: TYPE_CAT[r.type] || "software", sub: "", price: +r.price_ugx || 0, compare: +r.compare_at_ugx || 0,
      rating: +r.rating_avg || 0, reviews: +r.rating_count || 0, sold: +r.sold_count || 0, stock: r.stock == null ? null : +r.stock, seller: sid,
      delivery: digital ? ["digital"] : ["kampala", "upcountry", "pickup"], condition: "New", img: (r.images && r.images[0]) || "", deal: false, made101: false,
      added: (r.created_at || "").slice(0, 10), desc: r.description_md || "" };
  }
  const products = () => D().marketProducts;
  const product = id => products().find(p => p.id === id) || null;
  const seller = id => D().marketSellers[id] || UNKNOWN_SELLER;
  /* resolves once the catalogue is known: backend rows, the seed (static / admin demo), or [] */
  const ready = (async () => {
    if (STATIC) return;
    let rows = null; try { rows = await backend("/market/products?limit=60"); } catch (e) { rows = null; }
    if (Array.isArray(rows)) { D().marketProducts = rows.map(fromRow).filter(Boolean); return; }
    if (demoURL && window.CCAccess && CCAccess.ready) { try { await CCAccess.ready; } catch (e) { /* stays empty */ } }
    if (demoOK()) useSeed(true);
  })();

  /* ---------- catalogue ---------- */
  const fetchCategories = () => or("/market/categories", () => D().marketCategories);
  const fetchProducts = async () => { await ready; return products(); };
  const fetchProduct = async id => { await ready; const hit = product(id); if (hit) return hit;
    try { const r = fromRow(await backend("/market/products/" + encodeURIComponent(id))); if (r) { products().push(r); return r; } } catch (e) { /* not found */ }
    return null; };
  const fetchAffiliates = () => or("/market/affiliates", () => D().marketAffiliates);
  const fetchReviews = id => or(`/market/products/${encodeURIComponent(id)}/reviews`, () => demoOK() ? D().marketReviews : []).then(v => Array.isArray(v) ? v : []);
  const fetchQA = id => or(`/market/products/${encodeURIComponent(id)}/qa`, () => demoOK() ? D().marketQA : []).then(v => Array.isArray(v) ? v : []);
  const askQuestion = (id, text) => or(`/market/products/${encodeURIComponent(id)}/qa`, () => demoOK() ? { ok: true, pending: true } : { ok: false, offline: true }, { method: "POST", body: JSON.stringify({ text }) });
  function suggest(term) { // local autocomplete; backend: GET /market/search/suggest?q=
    const t = term.trim().toLowerCase(); if (!t) return [];
    const cats = D().marketCategories.flatMap(c => [{ kind: "cat", id: c.id, label: c.name }, ...c.subs.map(s => ({ kind: "sub", id: c.id, sub: s, label: s + " · in " + c.name }))]).filter(x => x.label.toLowerCase().includes(t)).slice(0, 3);
    const prods = products().filter(p => (p.title + " " + p.sub).toLowerCase().includes(t)).slice(0, 6).map(p => ({ kind: "product", id: p.id, label: p.title, price: p.price }));
    return [...cats, ...prods];
  }

  /* ---------- cart & wishlist (localStorage) ---------- */
  const getCart = () => ls.get("cc_cart", []);
  function addToCart(id, qty = 1, variant = "", unitPrice) {
    const c = getCart(); const p = product(id); const key = id + "|" + variant;
    const line = c.find(l => l.key === key);
    if (line) line.qty += qty; else c.push({ key, id, qty, variant, price: unitPrice || p.price, saved: false });
    ls.set("cc_cart", c); backend("/market/cart", { method: "POST", body: JSON.stringify(c) }).catch(() => {}); return c;
  }
  const setCart = c => (ls.set("cc_cart", c), c);
  const cartCount = () => getCart().filter(l => !l.saved).reduce((a, l) => a + l.qty, 0);
  const getWishlist = () => ls.get("cc_wish", []);
  function toggleWish(id) { const w = getWishlist(); const i = w.indexOf(id); i < 0 ? w.push(id) : w.splice(i, 1); ls.set("cc_wish", w); return i < 0; }

  /* ---------- checkout ---------- */
  function tierPrice(p, qty) { const t = (p.tiers || []).find(t => qty >= t.min && (t.max == null || qty <= t.max)); return t ? t.price : p.price; }
  async function checkout({ lines, delivery, pickupPoint, pay, phone, name, district }) {
    const opt = D().marketDelivery.options.find(o => o.id === delivery) || { fee: 0 };
    const allDigital = lines.every(l => ((product(l.id) || {}).delivery || []).join() === "digital");
    const sub = lines.reduce((a, l) => a + l.price * l.qty, 0), fee = allDigital ? 0 : opt.fee, total = sub + fee;
    const res = await or("/market/checkout", () => {
      if (!demoOK()) throw Object.assign(new Error("Checkout is not available right now. Nothing was charged; your cart is kept."), { offline: true });
      const id = "ORD-" + String(Date.now()).slice(-5); const now = new Date().toISOString().slice(0, 16).replace("T", " ");
      const order = { id, date: now.slice(0, 10), items: lines.map(l => ({ id: l.id, qty: l.qty, price: l.price, variant: l.variant })), total, delivery: allDigital ? "digital" : delivery, pickupPoint, pay, status: 1, track: [now, now, null, null, null, null], local: true };
      ls.set("cc_orders", [order, ...ls.get("cc_orders", [])]); return { orderId: id, txRef: "cc-mk-" + id, total };
    }, { method: "POST", body: JSON.stringify({ lines, delivery, pickupPoint, pay, phone, name, district }) });
    // Real payment: Flutterwave (mobilemoneyuganda for MTN/Airtel, card). Stubbed; set CC_CONFIG.flwPublicKey for the test modal.
    if (window.CC_API && res && res.checkout_url) window.CC_API.flutterwaveCheckout({ checkoutUrl: res.checkout_url });   // r11: server-priced only (SR-17)
    ls.set("cc_cart", getCart().filter(l => l.saved));
    return res;
  }

  /* ---------- orders, escrow, disputes ---------- */
  const fetchOrders = () => or("/market/orders", () => [...(demoOK() ? ls.get("cc_orders", []) : []), ...D().marketOrders.map(o => ({ ...o, ...(ls.get("cc_order_state", {})[o.id] || {}) }))]);
  function patchOrder(id, patch) {
    const local = ls.get("cc_orders", []); const o = local.find(x => x.id === id);
    if (o) { Object.assign(o, patch); ls.set("cc_orders", local); } else { const st = ls.get("cc_order_state", {}); st[id] = { ...(st[id] || {}), ...patch }; ls.set("cc_order_state", st); }
  }
  /* BUS L16: a money/seller mutation the server did not accept NEVER reports success; the local "it worked" path is demo-only. */
  const NOT_SENT = () => ({ ok: false, offline: true, notSent: true, message: "Not sent: this isn't available yet. Nothing was changed." });
  const demoOr = f => () => (demoOK() ? f() : NOT_SENT());
  const confirmDelivery = (id, track) => or(`/market/orders/${id}/confirm`, demoOr(() => { patchOrder(id, { status: 5, track }); return { ok: true, released: true }; }), { method: "POST" });
  const openDispute = (id, body) => or(`/market/orders/${id}/dispute`, demoOr(() => { patchOrder(id, { dispute: { ...body, opened: new Date().toISOString().slice(0, 10), state: "Under review" } }); return { ok: true, ref: "DSP-" + String(Date.now()).slice(-4) }; }), { method: "POST", body: JSON.stringify(body) });

  /* ---------- seller centre ---------- */
  const fetchSellerOverview = () => or("/market/seller/overview", () => demoOK() ? D().marketSeller : JSON.parse(JSON.stringify(ZERO_SELLER)));
  const saveProduct = body => or("/market/seller/products", () => { if (!demoOK()) return { ok: false, status: "not sent (offline). Your listing was not submitted; try again when you're online" }; ls.set("cc_seller_drafts", [body, ...ls.get("cc_seller_drafts", [])]); return { ok: true, id: "draft-" + Date.now(), status: "In review" }; }, { method: "POST", body: JSON.stringify(body) });
  const updateOrderStatus = (id, status) => or(`/market/seller/orders/${id}/status`, demoOr(() => ({ ok: true, demo: true })), { method: "POST", body: JSON.stringify({ status }) });
  const requestSellerPayout = (amount, to) => or("/market/seller/payouts", demoOr(() => ({ ok: true, status: "pending", demo: true })), { method: "POST", body: JSON.stringify({ amount, to }) });
  const replyReview = (i, text) => or(`/market/seller/reviews/${i}/reply`, demoOr(() => ({ ok: true, demo: true })), { method: "POST", body: JSON.stringify({ text }) });

  /* ---------- RFQ (request for quotation) ---------- */
  const fetchRFQ = () => or("/market/rfq", () => ({ mine: [...(demoOK() ? ls.get("cc_rfq", []) : []), ...D().marketRFQ.mine], open: D().marketRFQ.open }));
  const postRFQ = body => or("/market/rfq", () => { if (!demoOK()) throw Object.assign(new Error("Your request was not posted (offline). Try again when you're online."), { offline: true }); const r = { id: "RFQ-" + String(Date.now()).slice(-4), status: "Open", quotes: [], ...body }; ls.set("cc_rfq", [r, ...ls.get("cc_rfq", [])]); return r; }, { method: "POST", body: JSON.stringify(body) });
  const acceptQuote = (rfq, sellerId) => or(`/market/rfq/${rfq}/accept`, demoOr(() => ({ ok: true, demo: true })), { method: "POST", body: JSON.stringify({ seller: sellerId }) });
  const sendQuote = (rfq, body) => or(`/market/rfq/${rfq}/quotes`, demoOr(() => ({ ok: true, demo: true })), { method: "POST", body: JSON.stringify(body) });

  /* BUS (founder): the marketplace hero and "Deals of the day" carry no invented promos. Slides come only from the listings
     the backend returned (count + lowest real price per category, "Made by 101" only if such listings exist); [] = hide the band. */
  const HERO_ART = { laptops: "hero-laptops", iot: "hero-iot" };
  function heroSlides(list) {
    list = Array.isArray(list) ? list.filter(p => p && p.title && +p.price > 0) : [];
    const cats = (D() && D().marketCategories) || [], name = id => (cats.find(c => c.id === id) || {}).name || "";
    const fmt = n => "UGX " + Math.round(n).toLocaleString("en-UG"), by = {};
    list.forEach(p => { if (!name(p.cat)) return; (by[p.cat] = by[p.cat] || []).push(p); });
    const slides = Object.keys(by).sort((a, b) => by[b].length - by[a].length).map(c => { const ps = by[c], low = ps.reduce((m, p) => Math.min(m, +p.price), Infinity), pic = ps.find(p => /^https:\/\//.test(p.img || ""));
      return { img: HERO_ART[c] || (pic ? pic.img : ""), k: name(c).toUpperCase(), t: `${name(c)} from ${fmt(low)}`, s: `${ps.length} listing${ps.length === 1 ? "" : "s"} on 101 Market right now.`,
        href: `marketplace.html?cat=${encodeURIComponent(c)}#browse`, cta: "Shop " + name(c).toLowerCase(), tone: "ink" }; });
    const made = list.filter(p => p.made101);
    if (made.length) slides.push({ img: "hero-made101", k: "MADE BY 101 MEMBERS", t: "Apps, templates & services built here", s: `${made.length} listing${made.length === 1 ? "" : "s"} from 101 members.`, href: "#browse", cta: "Browse member shops", tone: "or", quick: "member" });
    return slides.slice(0, 3);
  }
  const deals = list => (Array.isArray(list) ? list : []).filter(p => p && p.deal && +p.compare > +p.price && +p.price > 0);
  window.MarketAPI = { heroSlides, deals, ready, demoOK, product, seller, fetchCategories, fetchProducts, fetchProduct, fetchAffiliates, fetchReviews, fetchQA, askQuestion, suggest,
    getCart, setCart, addToCart, cartCount, getWishlist, toggleWish, tierPrice, checkout, fetchOrders, confirmDelivery, openDispute,
    fetchSellerOverview, saveProduct, updateOrderStatus, requestSellerPayout, replyReview, fetchRFQ, postRFQ, acceptQuote, sendQuote };
})();
