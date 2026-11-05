/* 101 Codecrafts — plans, upgrade checkout, lesson locks, rating + marketplace gates (round 11, r11/plans).
   Everything here is UI: the server decides (RLS + create_plan_checkout + can_enroll). Rules this file keeps:
   - Never send an amount: checkout posts {audience, tier, interval, method, phone}; the DB prices it (SR-17).
   - Never fake success: if the API is unreachable the page says so (no "paid" without a verified webhook).
   - External courses are never locked. Paid courses a learner bought are never locked.
   - Every gated tap routes by role: visitor → /auth (with next), guest → become a learner/tutor, low plan → pricing. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var ico = function (n) { return '<svg aria-hidden="true"><use href="#i-' + n + '"/></svg>'; };
  var ugx = function (n) { return "UGX " + Number(n).toLocaleString("en-UG"); };
  var TIERS = ["free", "standard", "plus", "pro"], RANK = function (t) { return Math.max(0, TIERS.indexOf(t || "free")); };
  var NAME = { free: "Free", standard: "Standard", plus: "Plus", pro: "Pro" };
  var STATIC = /[?&]static/.test(location.search);
  var ACC = function () { return window.CCAccess; };
  var ready = function () { return ACC() && ACC().ready ? ACC().ready : Promise.resolve(ACC()); };

  async function authHeaders() {
    var h = { Accept: "application/json", "Content-Type": "application/json" }, a = window.CC_AUTH;
    try { var t = a && a.clerk && a.clerk.session && await a.clerk.session.getToken(); if (t) h.Authorization = "Bearer " + t; } catch (e) {}
    return h;
  }
  async function api(path, opts) {
    opts = opts || {};
    var r = await fetch("/api/v1" + path, { method: opts.method || "GET", credentials: "include", headers: await authHeaders(), body: opts.body ? JSON.stringify(opts.body) : undefined });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) { var err = new Error((j && j.error && j.error.message) || ("HTTP " + r.status)); err.status = r.status; err.code = j && j.error && j.error.code; throw err; }
    return j && Object.prototype.hasOwnProperty.call(j, "data") ? j.data : j;
  }

  /* ---------------- catalogue: live (admin-edited) first, bundled defaults only as an offline fallback ---------------- */
  var catP = null;
  function catalogue() {
    if (catP) return catP;
    catP = (STATIC ? Promise.reject(new Error("static")) : api("/plans")).then(function (c) { c.source = "live"; return c; })
      .catch(function () { var d = JSON.parse(JSON.stringify(window.CC_PLANS_DEFAULT || { learner: [], tutor: [] })); d.source = "default"; return d; });
    return catP;
  }
  function tierOf(cat, audience, tier) { return (cat[audience] || []).filter(function (x) { return x.tier === tier; })[0] || null; }

  /* ---------------- lesson locks (mirrors app.can_view_lesson; the server is the authority) ---------------- */
  function lessonMinPlan(lesson, index) {
    if (lesson.minPlan || lesson.min_plan) return lesson.minPlan || lesson.min_plan;
    var a = ACC(), n = a ? (function () { var t = a.policy.limits.learner || {}; var f = (t.free || {})["lessons.free_per_course"]; return f == null ? Infinity : f; })() : 3;
    return index < n ? "free" : "standard";
  }
  function lessonLocked(course, lesson, index) {
    if (!course || course.external) return false;                       // external courses: free for everyone
    if (typeof lesson.locked === "boolean") return lesson.locked;        // server syllabus said so
    if (lesson.preview || lesson.is_preview) return false;
    if (course.purchased || course.allLessonsFree || course.all_lessons_free) return false;
    var a = ACC(); if (!a) return false;
    if (a.can("lesson.view_locked") && (a.policy.staff || []).indexOf(a.role) >= 0) return false;
    var plan = a.role === "guest" || a.role === "visitor" ? "free" : a.plan;
    return RANK(plan) < RANK(lessonMinPlan(lesson, index));
  }
  function lockPanel(lesson, index) {
    var a = ACC(), need = lessonMinPlan(lesson, index), next = location.pathname + location.search;
    var to = a ? a.denyTarget("lesson.view_locked", next) : null;
    if (a && a.role !== "guest" && a.role !== "visitor" && RANK(a.plan) < RANK(need)) to = "/pricing.html?need=" + need + "&next=" + encodeURIComponent(next);
    var who = a && a.role === "guest" ? "Become a learner, then pick a plan to open it." : a && a.role === "visitor" ? "Sign in or join to keep going." : "Upgrade to " + NAME[need] + " to open it and every lesson like it.";
    var btn = a && a.role === "guest" ? "Become a learner" : a && a.role === "visitor" ? "Sign in to continue" : "Upgrade to " + NAME[need];
    return '<div class="lk-panel" role="region" aria-label="Locked lesson">' +
      '<span class="lk-ic">' + ico("lock") + '</span><h3>LESSON ' + (index + 1) + ' IS PART OF ' + esc(NAME[need].toUpperCase()) + '</h3>' +
      '<p>' + esc(lesson.title || "This lesson") + ' is locked on your plan. ' + esc(who) + '</p>' +
      '<div class="row"><a class="btn or" data-lock-cta href="' + esc(to || "/pricing.html") + '">' + ico("star") + esc(btn) + '</a>' +
      '<a class="btn ghost" href="/pricing.html' + (need ? "?need=" + need : "") + '">See plans</a></div></div>';
  }
  /* server syllabus (titles + lock flags) when the API is there; merged into the client course by position/title */
  async function syllabus(slug) {
    if (STATIC || !slug) return null;
    try { return await api("/courses/" + encodeURIComponent(slug) + "/syllabus"); } catch (e) { return null; }
  }
  function mergeSyllabus(course, syl) {
    if (!syl || !Array.isArray(syl.lessons)) return course;
    course.lessons.forEach(function (l, i) {
      var s = syl.lessons.filter(function (x) { return x.title === l.title; })[0] || syl.lessons[i];
      if (s) { l.locked = !!s.locked; l.min_plan = s.min_plan; }
    });
    return course;
  }

  /* ---------------- rating gate (course page): verified enrolment only ---------------- */
  function ratingCard(course, enrolled) {
    var a = ACC(); var host = $("#p-ov"); if (!host || !a || $("#rt-card")) return;   // placed AFTER the tab panels: show() rewrites #p-ov
    var el = document.createElement("div"); el.className = "card rt-card"; el.id = "rt-card"; el.style.marginTop = "12px";
    var why = a.why("rating.create");
    if (why) {
      var to = a.denyTarget("rating.create");
      el.innerHTML = '<b class="mini-h">RATE THIS COURSE</b><p class="rt-note">' + (a.role === "visitor" ? "Sign in to rate courses you have taken." : a.role === "guest" ? "Ratings come from learners who took the course. Become a learner to rate." : "Ratings are open to enrolled learners.") + '</p>' +
        (to ? '<a class="btn sm" href="' + esc(to) + '">' + (a.role === "visitor" ? "Sign in" : "Become a learner") + '</a>' : "");
    } else if (!enrolled) {
      el.innerHTML = '<b class="mini-h">RATE THIS COURSE</b><p class="rt-note">Only learners enrolled in this course can rate it, so every rating comes from someone who took it.</p>';
    } else {
      el.innerHTML = '<b class="mini-h">RATE THIS COURSE</b><div class="rt-stars" role="group" aria-label="Your rating">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-star="' + n + '" aria-pressed="false" aria-label="' + n + ' star' + (n > 1 ? "s" : "") + '">' + n + '</button>'; }).join("") + '</div>' +
        '<label class="field">A short review (optional)<textarea id="rt-body" rows="3" maxlength="3000"></textarea></label><div class="row"><button class="btn or sm" type="button" id="rt-send" disabled>Post rating</button><span class="rt-note" id="rt-msg" role="status"></span></div>';
      var val = 0;
      el.addEventListener("click", function (e) {
        var b = e.target.closest("[data-star]"); if (!b) return; val = +b.dataset.star;
        $$("[data-star]", el).forEach(function (x) { x.setAttribute("aria-pressed", String(+x.dataset.star <= val)); }); $("#rt-send", el).disabled = false;
      });
      setTimeout(function () {
        var send = $("#rt-send", el); if (!send) return;
        send.onclick = async function () {
          send.disabled = true; $("#rt-msg", el).textContent = "Posting…";
          try { await api("/ratings", { method: "POST", body: { kind: "course", slug: course.id, rating: val, body: ($("#rt-body", el).value || "").trim() || undefined } }); $("#rt-msg", el).textContent = "Thanks: your rating is posted."; }
          catch (err) { send.disabled = false; $("#rt-msg", el).textContent = err.status === 403 ? "Only enrolled learners can rate this course." : "Ratings aren't connected on this preview yet."; }
        };
      });
    }
    var panels = host.parentNode; (panels && panels.lastElementChild ? panels.lastElementChild : host).insertAdjacentElement("afterend", el);
  }

  /* ---------------- page: pricing ---------------- */
  async function pricing() {
    var q = new URLSearchParams(location.search), need = TIERS.indexOf(q.get("need")) >= 0 ? q.get("need") : null, next = ACC() ? ACC().safeNext(q.get("next") || "") : "";
    var a = await ready(), cat = await catalogue();
    var aud = q.get("for") === "tutor" || (a && a.role === "tutor" && q.get("for") !== "learner") ? "tutor" : "learner", interval = q.get("interval") === "yearly" ? "yearly" : "monthly";
    var j = $("[data-pl-join]"); if (j && a) { if (a.role === "visitor") j.href = a.authUrl("/pricing.html"); else { j.textContent = "Back to 101"; j.href = a.home(); } }
    var src = $("#pl-src"); if (src) src.textContent = cat.source === "live" ? "" : "Showing the default plan list: live prices load when the site is online.";
    function cta(t) {
      var role = a ? a.role : "visitor", cur = role === "tutor" && aud === "tutor" ? a.plan : (role === "learner" || role === "tutor") && aud === "learner" ? (role === "learner" ? a.plan : "free") : null;
      var target = "/upgrade.html?audience=" + aud + "&tier=" + t.tier + "&interval=" + interval + (next ? "&next=" + encodeURIComponent(next) : "");
      if (role === "admin" || role === "root_admin") return { label: "Admins edit plans in the console", href: "/admin.html#plans" };
      if (role === "visitor") return t.tier === "free" ? { label: "Join free", href: ACC().authUrl("/pricing.html") } : { label: "Join to choose " + t.name, href: ACC().authUrl(target) };
      if (role === "guest") return { label: aud === "tutor" ? "Become a tutor" : "Become a learner", href: ACC().authUrl(t.tier === "free" ? "/pricing.html" : target, "upgrade=" + aud) };
      if (aud === "tutor" && role !== "tutor") return { label: "Apply to teach", href: ACC().authUrl("/tutor.html", "upgrade=tutor") };
      if (cur === t.tier) return { label: "Your plan", current: true };
      if (t.tier === "free") return { label: "Included", current: true, muted: true };
      return { label: (RANK(t.tier) > RANK(cur) ? "Upgrade to " : "Switch to ") + t.name, href: target };
    }
    function draw() {
      $$("[data-aud]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.aud === aud)); });
      $$("[data-int]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.int === interval)); });
      var list = cat[aud] || [];
      $("#pl-grid").innerHTML = list.map(function (t) {
        var c = cta(t), price = t.tier === "free" ? 0 : (interval === "yearly" ? t.yearly_ugx : t.monthly_ugx);
        var per = t.tier === "free" ? "forever" : interval === "yearly" ? "a year" : "a month";
        var cls = "pl-card" + (t.highlight ? " is-hl" : "") + (need === t.tier ? " is-need" : "") + (c.current && !c.muted ? " is-current" : "");
        return '<article class="' + cls + '" data-tier="' + esc(t.tier) + '">' + (need === t.tier ? '<span class="pl-flag cy">Unlocks what you need</span>' : t.highlight ? '<span class="pl-flag">Most picked</span>' : "") +
          '<h3 class="pl-name">' + esc(t.name) + '</h3><p class="pl-tag">' + esc(t.tagline || "") + '</p>' +
          '<div class="pl-price">' + (price == null ? '<b>—</b><small>price not set yet</small>' : '<b>' + (price === 0 ? "UGX 0" : esc(ugx(price))) + '</b><small>' + per + '</small>') + '</div>' +
          (t.price_is_suggestion && t.tier !== "free" ? '<span class="pl-sugg" title="Suggested price: the founder confirms final prices">SUGGESTED PRICE</span>' : "") +
          '<ul class="pl-feats">' + (t.features || []).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") + '</ul>' +
          (c.href ? '<a class="btn ' + (t.highlight || need === t.tier ? "or" : "") + '" href="' + esc(c.href) + '">' + esc(c.label) + '</a>' : '<span class="btn" aria-disabled="true">' + esc(c.label) + '</span>') + '</article>';
      }).join("");
      $("#pl-cmp").innerHTML = compare(list);
    }
    function compare(list) {
      var rows = aud === "learner"
        ? [["Active 101 courses", "courses.active"], ["Lessons open per free course", "lessons.free_per_course", "all"], ["Certificates", "certificates"], ["AI messages a day", "ai.daily"], ["Projects", "projects.active"], ["Marketplace listings", "listings.active"], ["Seller fee", "seller.fee_pct", "%"], ["Offline downloads", "offline"], ["1:1 session discount", "sessions.discount_pct", "%"], ["Mentor sessions included / month", "sessions.included_monthly"]]
        : [["Students", "students.max"], ["Published courses", "courses.published"], ["Sessions / month", "sessions.per_month"], ["101 commission", "commission.pct", "%"], ["Highest course price you can request", "price.max_ugx", "ugx"], ["Coupons", "coupons"], ["Featured slots / month", "featured.monthly"], ["Marketplace listings", "listings.active"], ["Payout minimum", "payout.min_ugx", "ugx"]];
      var cell = function (v, fmt) {
        if (v === true) return '<td class="pl-yes">Yes</td>'; if (v === false) return '<td class="pl-no">No</td>';
        if (v === null || v === undefined) return '<td class="pl-yes">' + (fmt === "all" ? "All" : "Unlimited") + '</td>';
        if (fmt === "%") return "<td>" + v + "%</td>"; if (fmt === "ugx") return "<td>" + esc(ugx(v)) + "</td>"; return "<td>" + esc(v) + "</td>";
      };
      return '<table class="pl-tbl"><caption class="sr-only">Compare ' + aud + ' plans</caption><thead><tr><th scope="col">What you get</th>' + list.map(function (t) { return '<th scope="col">' + esc(t.name) + '</th>'; }).join("") + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr><th scope="row">' + esc(r[0]) + '</th>' + list.map(function (t) { return cell((t.limits || {})[r[1]], r[2]); }).join("") + "</tr>"; }).join("") + "</tbody></table>";
    }
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-aud],[data-int]"); if (!b) return;
      if (b.dataset.aud) aud = b.dataset.aud; if (b.dataset.int) interval = b.dataset.int;
      var u = new URL(location.href); u.searchParams.set("for", aud); u.searchParams.set("interval", interval); history.replaceState(null, "", u);
      draw();
    });
    draw();
    var g = $("#pl-grid .is-need"); if (g && g.scrollIntoView) g.scrollIntoView({ block: "center" });
  }

  /* ---------------- page: upgrade (checkout UI) ---------------- */
  async function upgrade() {
    var q = new URLSearchParams(location.search), a = await ready();
    var aud = q.get("audience") === "tutor" ? "tutor" : "learner", tier = ["standard", "plus", "pro"].indexOf(q.get("tier")) >= 0 ? q.get("tier") : "standard";
    var interval = q.get("interval") === "yearly" ? "yearly" : "monthly", self = location.pathname + location.search;
    if (!a || a.role === "visitor") { location.replace(ACC().authUrl(self)); return; }
    if (a.role === "guest") { location.replace(ACC().authUrl(self, "upgrade=" + aud)); return; }
    if (a.role === "admin" || a.role === "root_admin") { $("#up-main").innerHTML = '<div class="card"><p>Admins don\'t buy plans. Edit plans and prices in the <a href="/admin.html#plans">admin console</a>.</p></div>'; return; }
    if (aud === "tutor" && a.role !== "tutor") { location.replace(ACC().authUrl("/tutor.html", "upgrade=tutor")); return; }
    var cat = await catalogue(), t = tierOf(cat, aud, tier);
    if (!t) { $("#up-main").innerHTML = '<div class="card"><p>That plan isn\'t available. <a href="/pricing.html">See all plans</a>.</p></div>'; return; }
    var cur = aud === "tutor" ? a.plan : (a.role === "learner" ? a.plan : "free");
    var shown = interval === "yearly" ? t.yearly_ugx : t.monthly_ugx;
    $("#up-plan").textContent = "101 " + t.name + " · " + (aud === "tutor" ? "Tutor" : "Learner");
    $("#up-int").textContent = interval === "yearly" ? "Yearly" : "Monthly";
    $("#up-price").textContent = shown == null ? "Set by 101" : ugx(shown);
    $("#up-feats").innerHTML = (t.features || []).map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("");
    $("#up-current").textContent = cur === tier ? "You're already on this plan." : "Your plan now: " + NAME[cur] + ".";
    $("#up-swap").href = "/upgrade.html?audience=" + aud + "&tier=" + tier + "&interval=" + (interval === "yearly" ? "monthly" : "yearly");
    $("#up-swap").textContent = interval === "yearly" ? "Pay monthly instead" : "Pay yearly (2 months free)";
    var methods = (cat.methods && cat.methods.length ? cat.methods : ["mtn_momo", "airtel_money", "card"]);
    $$(".up-method").forEach(function (m) { var on = methods.indexOf(m.dataset.method) >= 0; m.hidden = !on; if (!on) m.querySelector("input").disabled = true; });
    var first = $(".up-method:not([hidden]) input"); if (first) first.checked = true;
    var form = $("#up-form"), msg = $("#up-msg"), phoneWrap = $("#up-phone-wrap"), phone = $("#up-phone"), warn = $("#up-netwarn");
    function method() { var r = $("input[name=method]:checked"); return r ? r.value : null; }
    function syncPhone() {
      var m = method(), momo = m === "mtn_momo" || m === "airtel_money"; phoneWrap.hidden = !momo; phone.required = momo;
      var d = (phone.value || "").replace(/[\s-]/g, ""), mm = /^(?:\+?256|0)(7\d)\d{7}$/.exec(d), p = mm ? mm[1] : "";
      var net = ["76", "77", "78"].indexOf(p) >= 0 ? "mtn_momo" : ["70", "74", "75"].indexOf(p) >= 0 ? "airtel_money" : null;
      warn.hidden = !(momo && net && net !== m);
      warn.textContent = net === "mtn_momo" ? "That looks like an MTN number. Pick MTN Mobile Money, or use an Airtel number." : "That looks like an Airtel number. Pick Airtel Money, or use an MTN number.";
    }
    form.addEventListener("change", syncPhone); phone.addEventListener("input", syncPhone); syncPhone();
    if (cur === tier) { $("#up-pay").disabled = true; }
    form.addEventListener("submit", async function (e) {
      e.preventDefault(); msg.className = "up-msg"; msg.textContent = "";
      var m = method(); if (!m) { msg.textContent = "Choose how to pay."; return; }
      var body = { audience: aud, tier: tier, interval: interval, method: m };            // NO amount: the server prices it (SR-17)
      if (m !== "card") { if (!/^(\+?256|0)7\d{8}$/.test((phone.value || "").replace(/[\s-]/g, ""))) { msg.className = "up-msg err"; msg.textContent = "Enter a Ugandan mobile number like 07XX XXX XXX."; phone.focus(); return; } body.phone = phone.value.replace(/[\s-]/g, ""); }
      var btn = $("#up-pay"); btn.disabled = true; btn.setAttribute("aria-busy", "true"); msg.textContent = "Asking 101 for your total…";
      try {
        var r = await api("/billing/checkout", { method: "POST", body: body });
        $("#up-price").textContent = ugx(r.amount_ugx); $("#up-confirmed").hidden = false;
        if (r.checkout_url) {
          msg.textContent = "Total confirmed: " + ugx(r.amount_ugx) + ". Opening the test checkout…";
          var go = $("#up-go"); go.href = r.checkout_url; go.hidden = false;
          setTimeout(function () { location.href = r.checkout_url; }, 900);
        } else msg.textContent = r.instructions || "Check your phone to approve the test payment.";
      } catch (err) {
        btn.disabled = false; btn.removeAttribute("aria-busy"); msg.className = "up-msg err";
        msg.textContent = err.status === 409 ? "You're already on this plan." : err.status === 403 ? (err.message || "Your account can't buy this plan.") : err.status === 404 || err.status === 405 || !err.status ? "Payments aren't connected on this preview, so nothing was charged. Try again on the live site." : (err.message || "Couldn't start the payment. Nothing was charged.");
      }
    });
  }

  /* ---------------- marketplace gates (UI; DB triggers + RLS enforce) ---------------- */
  async function market(page) {
    var a = await ready(); if (!a) return;
    $$('a[href="seller.html"], a[href="/seller.html"]').forEach(function (el) { a.gate(el, "market.sell", "lock"); });
    $$('a[href="cart.html"], a[href="checkout.html"], a[href="orders.html"], a[href="rfq.html"]').forEach(function (el) { a.gate(el, "market.buy", "lock"); });
    var guardBuy = function (e) {
      var b = e.target.closest("[data-add], #pi-add, #pi-buy, #co-place"); if (!b || a.can("market.buy")) return;
      e.preventDefault(); e.stopImmediatePropagation(); location.href = a.denyTarget("market.buy") || a.authUrl();
    };
    document.addEventListener("click", guardBuy, true);
    var need = { seller: "market.sell", cart: "market.buy", checkout: "market.buy", orders: "market.buy", rfq: "market.buy" }[page];
    if (need && !a.can(need) && !STATIC) {
      var to = a.denyTarget(need) || a.home();
      if (to && to.split("?")[0] !== location.pathname) location.replace(to);
    }
    if (page === "seller" && a.can("market.sell")) {
      var cap = a.limit("listings.active"), fee = a.limit("seller.fee_pct");
      var top = $(".page-h"); if (top && !$("#pl-seller-note")) {
        var p = document.createElement("p"); p.id = "pl-seller-note"; p.className = "pl-note";
        p.textContent = "Every listing is reviewed by a 101 admin before it goes live. Your plan: " + (cap == null ? "unlimited" : cap) + " listings, " + (fee == null ? "" : fee + "% seller fee") + ".";
        top.appendChild(p);
      }
    }
  }

  window.CC_PLANS = { catalogue: catalogue, lessonLocked: lessonLocked, lessonMinPlan: lessonMinPlan, lockPanel: lockPanel, syllabus: syllabus, mergeSyllabus: mergeSyllabus, ratingCard: ratingCard, api: api };
  var page = document.body && document.body.dataset.page;
  var run = function () {
    if (page === "pricing") pricing();
    else if (page === "upgrade") upgrade();
    else if (["marketplace", "product-item", "cart", "checkout", "orders", "seller", "rfq"].indexOf(page) >= 0) market(page);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true }); else run();
})();
