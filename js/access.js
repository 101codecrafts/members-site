/* 101 Codecrafts — CCAccess: the client-side access gate (round 11).
   OWNER: r11/auth. THIS FILE IS THE PLANS BRANCH'S STUB with the owner's API, so pages written against it work
   unchanged after the merge (keep the owner's file then). The policy is inlined from src/data/access-policy.json
   by tools/build.py (between the POLICY markers): edit the JSON, never this copy.
   Role and plan come ONLY from the server (GET /api/v1/me/entitlements here; the owner uses /api/v1/auth/session).
   Nothing in localStorage or the URL can raise them; the server and RLS enforce everything again.

   API: .role .plan .user .limits .ready(Promise) .policy
        .can(action) .why(action) -> null|"signin"|"role"|"plan"|"minor"|"consent"
        .limit(key) .gate(el, action[, "hide"|"lock"]) .denyTarget(action[, next]) .authUrl(next[, extra]) .onChange(fn)
   Declarative: <a data-can="market.sell" data-can-mode="lock">.
   QA only: window.CC_ACCESS_FIXTURE = {role, plan, user, limits} set BEFORE this script (UI only; the API ignores it). */
(function () {
  "use strict";
  var POLICY = /*POLICY*/{"$comment":"Shared access contract \u2014 STUB on r11/plans. OWNER: r11/auth (src/data/access-policy.json there). Same format as the owner's file. On merge keep the owner's file and fold in the keys marked NEW below (plans branch) and the limits block. Front end: js/access.js; server: backend/data/access-policy.json + lib/access.ts + RLS (the DB is the authority). STUB DIFFERENCES: auth_route=/signup.html and home.guest=/courses.html only because /auth.html and /guest.html are created on r11/auth; the owner's values (/auth.html, /guest.html) win on merge.","version":1,"roles":["visitor","guest","learner","tutor","admin","root_admin"],"plans":["free","standard","plus","pro"],"staff":["admin","root_admin"],"home":{"visitor":"/index.html","guest":"/courses.html","learner":"/dashboard.html","tutor":"/tutor.html","admin":"/admin.html","root_admin":"/admin.html"},"auth_route":"/signup.html","plans_route":"/pricing.html","checkout_route":"/upgrade.html","pages":{"pricing":"page.public","upgrade":"plan.upgrade"},"actions":{"page.public":{"roles":["visitor","guest","learner","tutor","admin","root_admin"]},"course.browse":{"roles":["guest","learner","tutor","admin","root_admin"]},"course.take_external":{"roles":["guest","learner","tutor","admin","root_admin"]},"course.take_free":{"roles":["guest","learner","tutor","admin","root_admin"]},"course.take_tutor":{"roles":["learner","tutor","admin","root_admin"],"minor":"consent"},"course.enroll":{"roles":["learner","tutor","admin","root_admin"],"minor":"consent","$comment":"NEW (plans): enrol in a 101 course; server applies courses.active + tutor students.max (can_enroll). Alias of the owner's course.take_tutor."},"lesson.view_locked":{"roles":["learner","tutor","admin","root_admin"],"plans":["standard","plus","pro"],"$comment":"NEW (plans): lessons past lessons.free_per_course or with min_plan>free. Server: app.can_view_lesson (RLS on lessons)."},"course.set_price":{"roles":["tutor","admin","root_admin"],"$comment":"tutor = request only (admin approval queue)"},"course.set_free":{"roles":["admin","root_admin"]},"course.rate":{"roles":["learner","tutor"],"minor":"consent"},"resource.rate":{"roles":["learner","tutor"],"minor":"consent"},"rating.create":{"roles":["learner","tutor"],"minor":"consent","$comment":"NEW (plans): any rating; server requires verified use (enrolment / delivered order / attended session / recorded use)"},"market.browse":{"roles":["guest","learner","tutor","admin","root_admin"]},"market.buy":{"roles":["guest","learner","tutor","admin","root_admin"],"minor":"consent"},"market.sell":{"roles":["learner","tutor"],"minor":"deny","$comment":"listings go to admin approval; count capped by listings.active"},"session.book":{"roles":["learner","tutor"],"minor":"consent"},"account.upgrade":{"roles":["guest"]},"plan.upgrade":{"roles":["learner","tutor"]},"plans.edit":{"roles":["admin","root_admin"]},"payment.provider_manage":{"roles":["root_admin"],"$comment":"NEW (plans): switch payment providers (stubs can never be enabled)"}},"limits":{"learner":{"free":{"courses.active":1,"lessons.free_per_course":3,"ai.daily":10,"projects.active":2,"listings.active":3,"seller.fee_pct":15,"certificates":false,"offline":false,"sessions.discount_pct":0,"sessions.included_monthly":0},"standard":{"courses.active":3,"lessons.free_per_course":null,"ai.daily":50,"projects.active":5,"listings.active":10,"seller.fee_pct":12,"certificates":true,"offline":false,"sessions.discount_pct":0,"sessions.included_monthly":0},"plus":{"courses.active":10,"lessons.free_per_course":null,"ai.daily":200,"projects.active":20,"listings.active":25,"seller.fee_pct":10,"certificates":true,"offline":true,"sessions.discount_pct":10,"sessions.included_monthly":0},"pro":{"courses.active":null,"lessons.free_per_course":null,"ai.daily":1000,"projects.active":null,"listings.active":100,"seller.fee_pct":8,"certificates":true,"offline":true,"sessions.discount_pct":15,"sessions.included_monthly":1}},"tutor":{"free":{"students.max":2,"courses.published":1,"sessions.per_month":4,"commission.pct":30,"price.max_ugx":50000,"listings.active":3,"seller.fee_pct":15,"coupons":false,"featured.monthly":0,"payout.min_ugx":50000,"courses.active":1,"lessons.free_per_course":3},"standard":{"students.max":25,"courses.published":3,"sessions.per_month":20,"commission.pct":20,"price.max_ugx":150000,"listings.active":10,"seller.fee_pct":12,"coupons":true,"featured.monthly":0,"payout.min_ugx":20000,"courses.active":3,"lessons.free_per_course":null},"plus":{"students.max":150,"courses.published":10,"sessions.per_month":60,"commission.pct":15,"price.max_ugx":300000,"listings.active":25,"seller.fee_pct":10,"coupons":true,"featured.monthly":1,"payout.min_ugx":10000,"courses.active":10,"lessons.free_per_course":null},"pro":{"students.max":null,"courses.published":null,"sessions.per_month":null,"commission.pct":10,"price.max_ugx":500000,"listings.active":100,"seller.fee_pct":8,"coupons":true,"featured.monthly":3,"payout.min_ugx":10000,"courses.active":null,"lessons.free_per_course":null}},"guest":{"free":{"courses.active":1,"lessons.free_per_course":3,"ai.daily":5,"listings.active":0}}}}/*END*/;
  var A = window.CCAccess = window.CCAccess && window.CCAccess.__owner ? window.CCAccess : {
    policy: POLICY, role: "visitor", plan: "free", user: null, minor: false, consent: true, limits: null, resolved: false, ready: null
  };
  if (A.__owner) return;          // the owner's real CCAccess already loaded: never shadow it
  var listeners = [], done;
  A.ready = new Promise(function (r) { done = r; });
  A.onChange = function (f) { listeners.push(f); if (A.resolved) try { f(A); } catch (e) {} };
  var staff = function (r) { return (POLICY.staff || []).indexOf(r) >= 0; };
  A.why = function (action, c) {
    c = c || A; var rule = POLICY.actions[action];
    if (!rule || !Array.isArray(rule.roles)) return "role";
    if (rule.roles.indexOf(c.role) < 0) return c.role === "visitor" ? "signin" : "role";
    if (rule.minor === "deny" && c.minor) return "minor";
    if (rule.minor === "consent" && c.minor && !c.consent) return "consent";
    if (rule.plans && !staff(c.role) && rule.plans.indexOf(c.plan || "free") < 0) return "plan";
    return null;
  };
  A.can = function (action, c) { return A.why(action, c) === null; };
  A.minPlan = function (action) { var p = (POLICY.actions[action] || {}).plans; if (!p || !p.length) return null; return POLICY.plans.filter(function (x) { return p.indexOf(x) >= 0; })[0]; };
  A.limit = function (key) {
    if (staff(A.role)) return null;
    if (A.limits && Object.prototype.hasOwnProperty.call(A.limits, key)) return A.limits[key];
    var t = POLICY.limits[A.role === "visitor" ? "guest" : A.role] || POLICY.limits.guest || {}; var row = t[A.plan] || t.free || {};
    return Object.prototype.hasOwnProperty.call(row, key) ? row[key] : 0;
  };
  var safeNext = function (n) { return typeof n === "string" && /^\/(?![\/\\])[^\s]*$/.test(n) && !/^\/auth(\.html)?([?#]|$)/.test(n) ? n : ""; };
  A.safeNext = safeNext;
  A.authUrl = function (next, extra) {
    var q = [], n = safeNext(next || (location.pathname + location.search)); if (n) q.push("next=" + encodeURIComponent(n)); if (extra) q.push(extra);
    return (POLICY.auth_route || "/auth.html") + (q.length ? "?" + q.join("&") : "");
  };
  A.home = function (r) { return (POLICY.home || {})[r || A.role] || "/index.html"; };
  A.denyTarget = function (action, next) {
    var w = A.why(action); if (!w) return null;
    if (w === "signin") return A.authUrl(next);
    if (A.role === "guest") return A.authUrl(next, "upgrade=1");
    if (w === "plan") { var n = safeNext(next || location.pathname + location.search); return (POLICY.plans_route || "/pricing.html") + "?need=" + (A.minPlan(action) || "standard") + (n ? "&next=" + encodeURIComponent(n) : ""); }
    if (w === "consent") return POLICY.guardian_route || "/settings-apps.html#guardian";
    return null;
  };
  A.gate = function (el, action, mode) {
    if (!el) return; mode = mode || el.getAttribute("data-can-mode") || "hide";
    el.setAttribute("data-can", action); el.setAttribute("data-can-mode", mode);
    if (A.can(action)) { el.hidden = false; el.removeAttribute("aria-disabled"); delete el.dataset.canTo; return; }
    var href = el.getAttribute("href"), next; if (href) { try { var u = new URL(href, location.href); if (u.origin === location.origin) next = u.pathname + u.search + u.hash; } catch (e) {} }
    var to = A.denyTarget(action, next);
    if (mode === "hide" || !to) { el.hidden = true; return; }
    el.hidden = false; el.dataset.canTo = to;
  };
  function applyAll() {
    var d = document.documentElement; POLICY.roles.forEach(function (r) { d.classList.remove("role-" + r); });
    d.classList.add("role-" + A.role); d.dataset.role = A.role; d.dataset.plan = A.plan;
    [].forEach.call(document.querySelectorAll("[data-can]"), function (el) { A.gate(el, el.getAttribute("data-can")); });
  }
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var el = e.target.closest && e.target.closest("[data-can-to]"); if (!el) return;
    e.preventDefault(); e.stopPropagation(); location.href = el.dataset.canTo;
  }, true);
  A.set = function (s) {
    A.role = POLICY.roles.indexOf(s.role) >= 0 ? s.role : (s.user ? "guest" : "visitor");
    A.plan = POLICY.plans.indexOf(s.plan) >= 0 ? s.plan : "free";
    A.user = s.user || null; A.minor = !!s.minor; A.consent = s.consent !== false;
    A.limits = s.limits && typeof s.limits === "object" ? s.limits : null; A.resolved = true;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", applyAll, { once: true }); else applyAll();
    done(A); listeners.forEach(function (f) { try { f(A); } catch (e) {} });
    document.dispatchEvent(new CustomEvent("cc:access", { detail: A }));
  };
  A.refresh = applyAll;

  /* resolve: QA fixture → static mockup → server */
  if (window.CC_ACCESS_FIXTURE) { A.set(window.CC_ACCESS_FIXTURE); return; }
  if (/[?&]static/.test(location.search) || location.protocol === "file:") { A.set({ role: "visitor" }); return; }
  function fromServer(user) {
    if (!user) { A.set({ role: "visitor" }); return; }
    var auth = window.CC_AUTH, tok = auth && auth.clerk && auth.clerk.session ? auth.clerk.session.getToken().catch(function () { return null; }) : Promise.resolve(null);
    tok.then(function (t) {
      var h = { Accept: "application/json" }; if (t) h.Authorization = "Bearer " + t;
      return fetch("/api/v1/me/entitlements", { credentials: "include", headers: h });
    }).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (j) {
      var e = j && (j.data || j);
      if (!e) { A.set({ role: "guest", user: { id: user.id } }); return; }      // least privilege until the server answers
      var tutorish = e.role === "tutor";
      A.set({ role: e.role, plan: tutorish ? e.tutor_plan : e.learner_plan, user: { id: user.id, name: user.fullName || "" },
              limits: tutorish ? e.tutor_limits : e.learner_limits });
    }).catch(function () { A.set({ role: "guest", user: { id: user.id } }); });
  }
  var tries = 0;
  (function wait() {
    if (window.CC_AUTH && window.CC_AUTH.onChange) { window.CC_AUTH.onChange(fromServer); return; }
    if (++tries > 100) { A.set({ role: "visitor" }); return; }
    setTimeout(wait, 50);
  })();
})();
