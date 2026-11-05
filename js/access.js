/* 101 Codecrafts — CCAccess: the ONE client-side access gate (round 11, owner: auth).
   The policy below is generated from src/data/access-policy.json by tools/build.py (between the POLICY markers); edit the
   JSON, never this copy. The server enforces the same rules (backend lib/access.ts + RLS); this file only shapes the UI.

   Role and plan come ONLY from the server (GET /api/v1/auth/session, which reads the verified Clerk session). Nothing in
   localStorage, the URL or Clerk unsafeMetadata can raise them. Until the server answers, a signed-in user is treated as
   "guest" (least privilege) and a signed-out one as "visitor".

   API (window.CCAccess):
     .role .plan .user .roles .minor .consent .ready(Promise) .policy
     .can(action)               -> boolean
     .why(action)               -> null | "signin" | "role" | "plan" | "minor" | "consent"
     .limit(key)                -> number | boolean | null (null = unlimited / not set)
     .gate(el, action[, mode])  -> wires an element: mode "hide" (default) removes it for roles that can't use it;
                                   "lock" keeps it and routes a tap to /auth.html?next=… (visitor) or the upgrade path.
     .home([role])              -> the landing page for a role
     .authUrl(next[, extra])    -> "/auth.html?next=…"
     .onChange(fn)              -> fn(CCAccess) after every state change
   Declarative: <a data-can="market.sell"> (hide) · <a data-can="course.take_tutor" data-can-mode="lock">. */
(function () {
  "use strict";
  var POLICY = /*POLICY*/{"$comment":"101 Codecrafts shared access contract (owner: r11 auth). Front end reads it via js/access.js (CCAccess.can / .limit / .gate); the backend mirrors it in backend/data/access-policy.json + lib/access.ts and RLS. Action keys are <area>.<verb>. 'roles' = who may; 'plans' (optional) = plans a learner/tutor must hold (staff bypass plans); 'minor' = 'deny' blocks under-18s always, 'consent' blocks them until a guardian has verified. Limits are DEFAULTS only: the server overrides them from admin-edited plan settings (GET /api/v1/auth/session -> limits). null = unlimited/not set.","version":1,"roles":["visitor","guest","learner","tutor","admin","root_admin"],"plans":["free","standard","plus","pro"],"staff":["admin","root_admin"],"root_email":"101codecrafts@gmail.com","home":{"visitor":"/index.html","guest":"/guest.html","learner":"/dashboard.html","tutor":"/tutor.html","admin":"/admin.html","root_admin":"/admin.html"},"auth_route":"/auth.html","pages":{"$comment":"page (file name without .html) -> action needed to open it; unlisted pages are public. Denied visitor -> auth_route?next=; denied signed-in user -> their home (never the same page).","dashboard":"dashboard.learner","tutor":"dashboard.tutor","admin":"dashboard.admin","guest":"guest.home","courses":"course.browse","course":"course.browse","learn":"course.browse","article":"course.browse","practice":"practice.use","problem":"practice.use","ide":"practice.use","contests":"practice.use","contest":"practice.use","interview":"practice.use","resources":"resource.open","ai-tools":"ai.chat","marketplace":"market.browse","product-item":"market.browse","cart":"market.buy","checkout":"market.buy","orders":"market.buy","rfq":"market.buy","seller":"market.sell","projects":"shell.full","launchpad":"shell.full","testing":"shell.full","competitions":"shell.full","sessions":"shell.full","session":"shell.full","whiteboard":"shell.full","card":"shell.full","cards":"shell.full","groups":"community.post","announcements":"shell.app","settings-apps":"shell.app","profile":"shell.app"},"plans_route":"/settings-apps.html#plan","guardian_route":"/settings-apps.html#guardian","actions":{"page.public":{"roles":["visitor","guest","learner","tutor","admin","root_admin"]},"news.read":{"roles":["visitor","guest","learner","tutor","admin","root_admin"]},"event.browse":{"roles":["visitor","guest","learner","tutor","admin","root_admin"]},"shell.app":{"roles":["guest","learner","tutor","admin","root_admin"]},"shell.full":{"roles":["learner","tutor","admin","root_admin"]},"guest.home":{"roles":["guest"]},"dashboard.learner":{"roles":["learner"]},"dashboard.tutor":{"roles":["tutor"]},"dashboard.admin":{"roles":["admin","root_admin"]},"demo.view":{"roles":["admin","root_admin"]},"course.browse":{"roles":["guest","learner","tutor","admin","root_admin"]},"course.take_external":{"roles":["guest","learner","tutor","admin","root_admin"]},"course.take_free":{"roles":["guest","learner","tutor","admin","root_admin"]},"course.take_tutor":{"roles":["learner","tutor","admin","root_admin"],"minor":"consent"},"course.take_premium":{"roles":["learner","tutor","admin","root_admin"],"plans":["standard","plus","pro"],"minor":"consent"},"course.create":{"roles":["tutor","admin","root_admin"]},"course.set_price":{"roles":["tutor","admin","root_admin"]},"course.set_free":{"roles":["admin","root_admin"]},"course.rate":{"roles":["learner","tutor"],"minor":"consent","$comment":"server also requires an enrolment or completed use"},"resource.open":{"roles":["guest","learner","tutor","admin","root_admin"]},"resource.rate":{"roles":["learner","tutor"],"minor":"consent"},"practice.use":{"roles":["guest","learner","tutor","admin","root_admin"]},"ai.chat":{"roles":["guest","learner","tutor","admin","root_admin"]},"market.browse":{"roles":["guest","learner","tutor","admin","root_admin"]},"market.buy":{"roles":["guest","learner","tutor","admin","root_admin"],"minor":"consent"},"market.sell":{"roles":["learner","tutor"],"minor":"deny"},"project.create":{"roles":["learner","tutor"],"minor":"consent"},"session.book":{"roles":["learner","tutor"],"minor":"consent"},"session.host":{"roles":["tutor"]},"event.register":{"roles":["learner","tutor","admin","root_admin"],"minor":"consent"},"community.post":{"roles":["learner","tutor","admin","root_admin"],"minor":"consent"},"message.send":{"roles":["learner","tutor","admin","root_admin"],"minor":"consent"},"profile.public":{"roles":["learner","tutor","admin","root_admin"],"minor":"deny"},"profile.edit":{"roles":["guest","learner","tutor","admin","root_admin"]},"account.upgrade":{"roles":["guest"]},"plan.upgrade":{"roles":["learner","tutor"]},"payout.manage":{"roles":["tutor"],"minor":"deny"},"guardian.manage":{"roles":["guest","learner"]},"approvals.review":{"roles":["admin","root_admin"]},"users.manage":{"roles":["admin","root_admin"]},"plans.edit":{"roles":["admin","root_admin"]},"flags.edit":{"roles":["admin","root_admin"]},"audit.read":{"roles":["admin","root_admin"]},"admin.add":{"roles":["root_admin"]},"admin.remove":{"roles":["root_admin"]}},"limits":{"learner":{"free":{"courses.active":1,"lessons.preview_only":true,"sessions.per_month":0},"standard":{"courses.active":null,"lessons.preview_only":false,"sessions.per_month":null},"plus":{"courses.active":null,"lessons.preview_only":false,"sessions.per_month":null},"pro":{"courses.active":null,"lessons.preview_only":false,"sessions.per_month":null}},"tutor":{"free":{"students.max":2,"courses.published":null},"standard":{"students.max":null,"courses.published":null},"plus":{"students.max":null,"courses.published":null},"pro":{"students.max":null,"courses.published":null}}}}/*END*/;

  var PAGES = POLICY.pages || {};
  var LABEL = { visitor: "Visitor", guest: "Guest", learner: "Learner", tutor: "Tutor", admin: "Admin", root_admin: "Root admin" };

  var A = window.CCAccess = {
    policy: POLICY, labels: LABEL,
    role: "visitor", roles: [], plan: "free", user: null, minor: false, consent: true, limits: null, resolved: false,
    status: null, onboarding: null, ready: null
  };
  var listeners = [], resolveReady;
  A.ready = new Promise(function (r) { resolveReady = r; });
  A.onChange = function (f) { listeners.push(f); if (A.resolved) try { f(A); } catch (e) {} };

  var isStaff = function (r) { return (POLICY.staff || []).indexOf(r) >= 0; };

  /* the same decision the server makes (lib/access.ts decide()) */
  A.why = function (action, ctx) {
    ctx = ctx || A;
    var rule = POLICY.actions[action];
    if (!rule || typeof rule !== "object" || !Array.isArray(rule.roles)) return "role";   // unknown action: deny (fail closed)
    if (rule.roles.indexOf(ctx.role) < 0) return ctx.role === "visitor" ? "signin" : "role";
    if (rule.minor === "deny" && ctx.minor) return "minor";
    if (rule.minor === "consent" && ctx.minor && !ctx.consent) return "consent";
    if (rule.plans && !isStaff(ctx.role) && rule.plans.indexOf(ctx.plan || "free") < 0) return "plan";
    return null;
  };
  A.can = function (action, ctx) { return A.why(action, ctx) === null; };
  A.limit = function (key) {
    if (A.limits && Object.prototype.hasOwnProperty.call(A.limits, key)) return A.limits[key];
    var byRole = POLICY.limits[A.role]; if (!byRole) return null;
    var byPlan = byRole[A.plan] || byRole.free || {};
    return Object.prototype.hasOwnProperty.call(byPlan, key) ? byPlan[key] : null;
  };
  A.home = function (role) { return POLICY.home[role || A.role] || "/index.html"; };
  var safeNext = function (n) {   // same-origin paths only (no //host, no scheme, no backslash tricks)
    if (typeof n !== "string" || !/^\/(?![\/\\])[^\s]*$/.test(n) || /^\/auth(\.html)?([?#]|$)/.test(n)) return "";
    return n;
  };
  A.safeNext = safeNext;
  A.authUrl = function (next, extra) {
    var q = [], n = safeNext(next || (location.pathname + location.search));
    if (n) q.push("next=" + encodeURIComponent(n));
    if (extra) q.push(extra);
    return POLICY.auth_route + (q.length ? "?" + q.join("&") : "");
  };
  A.denyTarget = function (action, next) {
    var w = A.why(action);
    if (!w) return null;
    if (w === "signin") return A.authUrl(next);
    if (A.role === "guest") return A.authUrl(next, "upgrade=1");
    if (w === "plan") return POLICY.plans_route || "/settings-apps.html#plan";
    if (w === "consent") return POLICY.guardian_route || "/settings-apps.html#guardian";
    return null;   // a role that will never have it: the element is hidden instead
  };

  /* ---- gating the UI ---- */
  function pathPage(href) {
    try { var u = new URL(href, location.href); if (u.origin !== location.origin) return null;
      var m = u.pathname.match(/\/([a-z0-9-]+)(?:\.html)?$/i); return m ? m[1].toLowerCase() : (u.pathname === "/" ? "index" : null); } catch (e) { return null; }
  }
  A.pageAction = function (href) { var p = pathPage(href); return p && p !== "$comment" && typeof PAGES[p] === "string" ? PAGES[p] : null; };

  A.gate = function (el, action, mode) {
    if (!el) return;
    mode = mode || el.getAttribute("data-can-mode") || "hide";
    el.setAttribute("data-can", action); el.setAttribute("data-can-mode", mode);
    var ok = A.can(action), href = el.getAttribute("href"), next;
    if (href) { try { var u = new URL(href, location.href); if (u.origin === location.origin) next = u.pathname + u.search + u.hash; } catch (e) {} }
    var target = ok ? null : A.denyTarget(action, next);
    if (ok) { el.hidden = false; el.removeAttribute("aria-disabled"); delete el.dataset.canTo; return; }
    if (mode === "hide" || !target) { el.hidden = true; return; }
    el.hidden = false; el.setAttribute("aria-disabled", "false"); el.dataset.canTo = target;
  };
  function applyAll() {
    var d = document.documentElement;
    Object.keys(LABEL).concat(["pending"]).forEach(function (r) { d.classList.remove("role-" + r); });
    d.classList.add("role-" + A.role);
    d.classList.toggle("is-staff", isStaff(A.role));
    d.classList.toggle("is-minor", !!A.minor);
    d.dataset.role = A.role;
    [].forEach.call(document.querySelectorAll("[data-can]"), function (el) { A.gate(el, el.getAttribute("data-can")); });
    // sidebar: guests get a limited shell (only what they can open); visitors get none (CSS hides it)
    [].forEach.call(document.querySelectorAll(".sbar .sb-nav a[href]"), function (a) {
      var act = A.pageAction(a.getAttribute("href")); a.hidden = !!(act && !A.can(act));
    });
    [].forEach.call(document.querySelectorAll(".sbar .sb-sec"), function (s) { s.hidden = !s.querySelector("a:not([hidden])"); });
    [].forEach.call(document.querySelectorAll(".acct-role"), function (e) { e.textContent = LABEL[A.role] || "Member"; });
    upgradeCta();
  }
  function upgradeCta() {
    var nav = document.querySelector(".sbar .sb-nav"); if (!nav) return;
    var cta = nav.querySelector(".sb-upgrade");
    if (A.role !== "guest") { if (cta) cta.remove(); return; }
    if (cta) return;
    cta = document.createElement("a"); cta.className = "sb-upgrade"; cta.href = A.authUrl(A.home("guest"), "upgrade=1");
    cta.innerHTML = '<svg aria-hidden="true"><use href="#i-user"/></svg><span>Become a learner or tutor</span>';
    nav.insertBefore(cta, nav.firstChild);
  }
  /* page guard: never redirect to the page we're on (no loops), never from the auth page itself */
  function guardPage() {
    var page = (document.body && document.body.dataset.page) || pathPage(location.href) || "";
    var act = A.pageAction("/" + page + ".html"); if (!act || A.can(act)) return;
    if (/[?&]static/.test(location.search)) return;
    var to = A.role === "visitor" ? A.authUrl(location.pathname + location.search + location.hash) : A.denyTarget(act) || A.home();
    if (pathPage(to) === page) return;
    location.replace(to);
  }
  /* any tap on a gated link/button routes logically for this role */
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var el = e.target.closest && e.target.closest("[data-can-to], a[href]"); if (!el) return;
    var to = el.dataset.canTo;
    if (!to && el.tagName === "A" && !el.target) {
      var act = A.pageAction(el.getAttribute("href"));
      if (act && !A.can(act)) { var u = new URL(el.getAttribute("href"), location.href); to = A.denyTarget(act, u.pathname + u.search + u.hash); }
    }
    if (!to) return;
    e.preventDefault(); location.href = to;
  }, true);

  /* ---- state from the server ---- */
  A.set = function (s) {   // internal: called by js/auth.js with the server's answer (or the signed-out state)
    var roleOk = POLICY.roles.indexOf(s.role) >= 0;
    A.role = roleOk ? s.role : (s.user ? "guest" : "visitor");
    A.roles = Array.isArray(s.roles) ? s.roles.slice() : [];
    A.plan = POLICY.plans.indexOf(s.plan) >= 0 ? s.plan : "free";
    A.user = s.user || null; A.minor = !!s.minor; A.consent = s.consent !== false;
    A.limits = s.limits && typeof s.limits === "object" ? s.limits : null;
    A.status = s.status || null; A.onboarding = s.onboarding || null;
    A.resolved = true;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { applyAll(); guardPage(); }, { once: true });
    else { applyAll(); guardPage(); }
    resolveReady(A);
    listeners.forEach(function (f) { try { f(A); } catch (e) {} });
    document.dispatchEvent(new CustomEvent("cc:access", { detail: A }));
  };
  A.refresh = applyAll;
})();
