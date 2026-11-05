/* 101 Codecrafts: front-end access policy (window.CCAccess). Shared contract for round 11:
   CCAccess.role (visitor|guest|learner|tutor|admin|root_admin), .plan (free|standard|plus|pro), .user,
   .can(action), .limit(key), .gate(el, action), .ready (Promise), .on(fn) (called on every change).
   The policy comes from src/data/access-policy.json; tools/build.py copies it between the POLICY markers below.
   The role is a UI hint only: the server (lib/access.ts + RLS) decides, from the verified session, never from this file.
   STUB written by r11/profile. The auth agent owns the real one; the API is the same, so a merge only swaps the file. */
(function () {
  "use strict";
  if (window.CCAccess) return;
  var POLICY = /*POLICY*/{"actions":{"profile.view_own":{"roles":["guest","learner","tutor","admin","root_admin"]},"profile.edit":{"roles":["guest","learner","tutor","admin","root_admin"]},"profile.public":{"roles":["learner","tutor","admin","root_admin"]},"profile.share":{"roles":["guest","learner","tutor","admin","root_admin"]},"account.billing":{"roles":["guest","learner","tutor","admin","root_admin"]},"account.upgrade":{"roles":["guest","learner","tutor"]},"account.payouts":{"roles":["tutor"]},"account.guardian":{"roles":["guest","learner"]},"account.export":{"roles":["guest","learner","tutor","admin","root_admin"]},"account.delete":{"roles":["guest","learner","tutor","admin"]},"settings.connected_apps":{"roles":["learner","tutor","admin","root_admin"]}},"limits":{}}/*END*/;
  var RANK = { free: 0, standard: 1, plus: 2, pro: 3 };
  var subs = [], resolve, A = {
    role: "visitor", plan: "free", user: null, me: null,
    ready: new Promise(function (r) { resolve = r; }),
    can: function (action) {
      var p = POLICY.actions && POLICY.actions[action]; if (!p) return false;
      if (p.roles && p.roles.indexOf(A.role) < 0) return false;
      if (p.minPlan && A.role !== "admin" && A.role !== "root_admin" && (RANK[A.plan] || 0) < (RANK[p.minPlan] || 0)) return false;
      return true;
    },
    limit: function (key) { var l = POLICY.limits && POLICY.limits[key]; if (l == null) return null; return typeof l === "object" ? (l[A.role + ":" + A.plan] ?? l[A.plan] ?? l[A.role] ?? null) : l; },
    gate: function (el, action) { if (!el) return; var ok = A.can(action); el.hidden = !ok; el.toggleAttribute("data-gated", !ok); return ok; },
    on: function (fn) { subs.push(fn); if (A._set) try { fn(A); } catch (e) {} }
  };
  window.CCAccess = A;
  /* server roles -> contract roles. super_admin is the backend's name for root_admin. */
  function roleOf(me, user) {
    if (!user) return "visitor";
    var rs = (me && me.roles || []).map(String);
    if (rs.indexOf("root_admin") >= 0 || rs.indexOf("super_admin") >= 0) return "root_admin";
    if (rs.indexOf("admin") >= 0) return "admin";
    if (rs.indexOf("tutor") >= 0) return "tutor";
    if (rs.indexOf("learner") >= 0 || (me && me.account_status === "active")) return "learner";
    return "guest";   /* signed in, but the server has not confirmed more (or the API is unreachable): least privilege */
  }
  function set(user, me) {
    A.user = user || null; A.me = me || null; A.role = roleOf(me, user);
    A.plan = (me && RANK[me.plan] != null) ? me.plan : "free"; A._set = true;
    document.documentElement.dataset.ccRole = A.role;
    [].forEach.call(document.querySelectorAll("[data-can]"), function (el) { A.gate(el, el.getAttribute("data-can")); });
    subs.forEach(function (f) { try { f(A); } catch (e) {} }); resolve(A);
    document.dispatchEvent(new CustomEvent("cc:access", { detail: A }));
  }
  async function me() {
    try {
      var h = { Accept: "application/json" }, c = window.CC_AUTH && window.CC_AUTH.clerk;
      var t = c && c.session && await c.session.getToken(); if (t) h.Authorization = "Bearer " + t;
      var r = await fetch("/api/v1/me", { credentials: "include", headers: h }); if (!r.ok) return null;
      var j = await r.json(); return (j && (j.data || j)) || null;
    } catch (e) { return null; }
  }
  function boot() {
    if (/[?&]static/.test(location.search)) { set(null, null); return; }
    var hook = function () { window.CC_AUTH.onChange(async function (u) { if (!u) return set(null, null); set(u, null); set(u, await me()); }); };
    if (window.CC_AUTH) hook(); else { var n = 0, iv = setInterval(function () { if (window.CC_AUTH) { clearInterval(iv); hook(); } else if (++n > 60) { clearInterval(iv); set(null, null); } }, 100); }
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
