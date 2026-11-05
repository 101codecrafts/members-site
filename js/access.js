/* STUB of CCAccess (round 11, admin branch). The real file belongs to the r11 auth branch: on merge TAKE THEIRS.
   Same API (window.CCAccess: role, plan, user, roles, ready, can, why, limit, gate, home, authUrl, onChange), no page
   redirects, least privilege until the server answers. Role comes only from the server: GET /api/v1/auth/session
   when that route exists, else GET /api/v1/admin/me (admin pages). Policy = src/data/access-policy.json (fetched). */
(function () {
  "use strict";
  if (window.CCAccess) return;
  var BASE = ((window.CC_CONFIG && window.CC_CONFIG.apiBase) || "/api").replace(/\/$/, "") + "/v1";
  var A = window.CCAccess = { stub: true, role: "visitor", roles: [], plan: "free", user: null, minor: false, consent: true, limits: null, resolved: false,
    policy: { actions: {}, limits: {}, home: {}, staff: ["admin", "root_admin"] } };
  var listeners = [], done;
  A.ready = new Promise(function (r) { done = r; });
  A.onChange = function (f) { listeners.push(f); if (A.resolved) try { f(A); } catch (e) { /* listener */ } };
  A.why = function (action) {
    var rule = (A.policy.actions || {})[action];
    if (!rule || !Array.isArray(rule.roles)) return "role";
    if (rule.roles.indexOf(A.role) < 0) return A.role === "visitor" ? "signin" : "role";
    if (rule.minor === "deny" && A.minor) return "minor";
    if (rule.minor === "consent" && A.minor && !A.consent) return "consent";
    if (rule.plans && (A.policy.staff || []).indexOf(A.role) < 0 && rule.plans.indexOf(A.plan) < 0) return "plan";
    return null;
  };
  A.can = function (action) { return A.why(action) === null; };
  A.limit = function (key) {
    if (A.limits && Object.prototype.hasOwnProperty.call(A.limits, key)) return A.limits[key];
    var r = (A.policy.limits || {})[A.role]; var p = r && (r[A.plan] || r.free); return p && Object.prototype.hasOwnProperty.call(p, key) ? p[key] : null;
  };
  A.home = function (role) { return (A.policy.home || {})[role || A.role] || "dashboard.html"; };
  A.authUrl = function (next) { return "signin.html?next=" + encodeURIComponent(/^\/(?![\/\\])/.test(next || "") ? next : "/dashboard.html"); };
  A.gate = function (el, action, mode) { if (!el) return; if (!A.can(action)) { if ((mode || "hide") === "hide") el.hidden = true; else el.setAttribute("aria-disabled", "true"); } };
  function settle() { A.resolved = true; listeners.forEach(function (f) { try { f(A); } catch (e) { /* listener */ } }); done(A);
    document.querySelectorAll("[data-can]").forEach(function (el) { A.gate(el, el.getAttribute("data-can"), el.getAttribute("data-can-mode")); }); }
  var j = function (u) { return fetch(u, { credentials: "include", headers: { Accept: "application/json" } }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
  Promise.all([j("src/data/access-policy.json"), j(BASE + "/auth/session")]).then(function (res) {
    if (res[0] && res[0].actions) A.policy = res[0];
    var s = res[1] && (res[1].data || res[1]);
    if (s && s.role) { A.role = s.role; A.roles = s.roles || []; A.plan = s.plan || "free"; A.user = s.user || null; A.minor = !!s.minor; A.consent = s.consent !== false; A.limits = s.limits || null; return settle(); }
    if (document.body && document.body.dataset.page === "admin") {
      return j(BASE + "/admin/me").then(function (m) { var d = m && (m.data || m); if (d && d.is_admin) { A.role = d.is_root ? "root_admin" : "admin"; A.roles = [A.role]; A.user = { id: d.user_id }; } settle(); });
    }
    settle();
  });
})();
