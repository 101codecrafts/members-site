/* 101 Marketplace — every marketplace network call lives here (stubs).
   Each function tries the backend (API_BASE + endpoint) and falls back to the placeholders in js/market-data.js.
   Cart, wishlist, placed orders and RFQs are kept in localStorage until the backend exists.
   Payments: MTN MoMo / Airtel Money / card all go through Flutterwave (CC_API.flutterwaveCheckout stub).
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
      const r = await fetch(API_BASE + path, { ...opts, signal: ctl.signal, headers: { Accept: "application/json", "Content-Type": "application/json", ...(opts.headers || {}) } });
      if (!r.ok) throw new Error(r.status); return await r.json();
    } finally { clearTimeout(t); }
  }
  async function or(path, fallback, opts) { try { return await backend(path, opts); } catch (e) { return typeof fallback === "function" ? fallback() : fallback; } }

  const products = () => D().marketProducts;
  const product = id => products().find(p => p.id === id);
  const seller = id => D().marketSellers[id];

  /* ---------- catalogue ---------- */
  const fetchCategories = () => or("/market/categories", () => D().marketCategories);
  const fetchProducts = () => or("/market/products", products);
  const fetchProduct = id => or("/market/products/" + encodeURIComponent(id), () => product(id) || products()[0]);
  const fetchAffiliates = () => or("/market/affiliates", () => D().marketAffiliates);
  const fetchReviews = id => or(`/market/products/${encodeURIComponent(id)}/reviews`, () => D().marketReviews);
  const fetchQA = id => or(`/market/products/${encodeURIComponent(id)}/qa`, () => D().marketQA);
  const askQuestion = (id, text) => or(`/market/products/${encodeURIComponent(id)}/qa`, { ok: true, pending: true }, { method: "POST", body: JSON.stringify({ text }) });
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
    const allDigital = lines.every(l => (product(l.id).delivery || []).join() === "digital");
    const sub = lines.reduce((a, l) => a + l.price * l.qty, 0), fee = allDigital ? 0 : opt.fee, total = sub + fee;
    const res = await or("/market/checkout", () => {
      const id = "ORD-" + String(Date.now()).slice(-5); const now = new Date().toISOString().slice(0, 16).replace("T", " ");
      const order = { id, date: now.slice(0, 10), items: lines.map(l => ({ id: l.id, qty: l.qty, price: l.price, variant: l.variant })), total, delivery: allDigital ? "digital" : delivery, pickupPoint, pay, status: 1, track: [now, now, null, null, null, null], local: true };
      ls.set("cc_orders", [order, ...ls.get("cc_orders", [])]); return { orderId: id, txRef: "cc-mk-" + id, total };
    }, { method: "POST", body: JSON.stringify({ lines, delivery, pickupPoint, pay, phone, name, district }) });
    // Real payment: Flutterwave (mobilemoneyuganda for MTN/Airtel, card). Stubbed; set CC_CONFIG.flwPublicKey for the test modal.
    if (window.CC_API && window.CC_CONFIG && window.CC_CONFIG.flwPublicKey) window.CC_API.flutterwaveCheckout({ amount: total, title: "101 Marketplace order " + res.orderId, txRef: res.txRef, name, email: "" });
    ls.set("cc_cart", getCart().filter(l => l.saved));
    return res;
  }

  /* ---------- orders, escrow, disputes ---------- */
  const fetchOrders = () => or("/market/orders", () => [...ls.get("cc_orders", []), ...D().marketOrders.map(o => ({ ...o, ...(ls.get("cc_order_state", {})[o.id] || {}) }))]);
  function patchOrder(id, patch) {
    const local = ls.get("cc_orders", []); const o = local.find(x => x.id === id);
    if (o) { Object.assign(o, patch); ls.set("cc_orders", local); } else { const st = ls.get("cc_order_state", {}); st[id] = { ...(st[id] || {}), ...patch }; ls.set("cc_order_state", st); }
  }
  const confirmDelivery = (id, track) => or(`/market/orders/${id}/confirm`, () => { patchOrder(id, { status: 5, track }); return { ok: true, released: true }; }, { method: "POST" });
  const openDispute = (id, body) => or(`/market/orders/${id}/dispute`, () => { patchOrder(id, { dispute: { ...body, opened: new Date().toISOString().slice(0, 10), state: "Under review" } }); return { ok: true, ref: "DSP-" + String(Date.now()).slice(-4) }; }, { method: "POST", body: JSON.stringify(body) });

  /* ---------- seller centre ---------- */
  const fetchSellerOverview = () => or("/market/seller/overview", () => D().marketSeller);
  const saveProduct = body => or("/market/seller/products", () => { ls.set("cc_seller_drafts", [body, ...ls.get("cc_seller_drafts", [])]); return { ok: true, id: "draft-" + Date.now(), status: "In review" }; }, { method: "POST", body: JSON.stringify(body) });
  const updateOrderStatus = (id, status) => or(`/market/seller/orders/${id}/status`, { ok: true }, { method: "POST", body: JSON.stringify({ status }) });
  const requestSellerPayout = (amount, to) => or("/market/seller/payouts", { ok: true, status: "pending" }, { method: "POST", body: JSON.stringify({ amount, to }) });
  const replyReview = (i, text) => or(`/market/seller/reviews/${i}/reply`, { ok: true }, { method: "POST", body: JSON.stringify({ text }) });

  /* ---------- RFQ (request for quotation) ---------- */
  const fetchRFQ = () => or("/market/rfq", () => ({ mine: [...ls.get("cc_rfq", []), ...D().marketRFQ.mine], open: D().marketRFQ.open }));
  const postRFQ = body => or("/market/rfq", () => { const r = { id: "RFQ-" + String(Date.now()).slice(-4), status: "Open", quotes: [], ...body }; ls.set("cc_rfq", [r, ...ls.get("cc_rfq", [])]); return r; }, { method: "POST", body: JSON.stringify(body) });
  const acceptQuote = (rfq, sellerId) => or(`/market/rfq/${rfq}/accept`, { ok: true }, { method: "POST", body: JSON.stringify({ seller: sellerId }) });
  const sendQuote = (rfq, body) => or(`/market/rfq/${rfq}/quotes`, { ok: true }, { method: "POST", body: JSON.stringify(body) });

  window.MarketAPI = { product, seller, fetchCategories, fetchProducts, fetchProduct, fetchAffiliates, fetchReviews, fetchQA, askQuestion, suggest,
    getCart, setCart, addToCart, cartCount, getWishlist, toggleWish, tierPrice, checkout, fetchOrders, confirmDelivery, openDispute,
    fetchSellerOverview, saveProduct, updateOrderStatus, requestSellerPayout, replyReview, fetchRFQ, postRFQ, acceptQuote, sendQuote };
})();
