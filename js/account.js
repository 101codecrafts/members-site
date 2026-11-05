/* 101 Codecrafts: account menu runtime (round 11). The menu markup is built into every page by tools/build.py (no layout shift);
   this fills in what only the session knows and hides rows the role can't use. js/shell.js owns open/close + keyboard,
   js/auth.js owns the real Clerk user (name, email, avatar). Nothing here ever shows a placeholder person.
   - plan line: "Free plan" (+ Upgrade) from CCAccess.plan; Pro, admins and root see no Upgrade
   - Payouts: tutors only (CCAccess.can("account.payouts"))
   - View profile: /u/<username> once the server knows the handle, else profile.html (own profile)
   - Theme row cycles System -> Light -> Dark (same storage as the View settings toggle in js/ui.js)
   - Switch account: Clerk multi-session if enabled (other signed-in sessions are listed), else sign out -> sign in
   - Sign in / Join links carry ?return=<this page> so the auth flow can come back. Does nothing in ?static=1. */
(function () {
  "use strict";
  if (/[?&]static/.test(location.search)) return;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var html = document.documentElement;
  var PLAN = { free: "Free", standard: "Standard", plus: "Plus", pro: "Pro" };
  var ROLE = { visitor: "Visitor", guest: "Guest", learner: "Learner", tutor: "Tutor", admin: "Admin", root_admin: "Root admin" };
  var LANG = { en: "English", lg: "Luganda", sw: "Kiswahili", fr: "Français" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  function themeName() { var t = ""; try { t = localStorage.theme || ""; } catch (e) {} return t === "dark" ? "Dark" : t === "light" ? "Light" : "System"; }
  function applyTheme(t) {
    try { if (t === "system") localStorage.removeItem("theme"); else localStorage.theme = t; } catch (e) {}
    var dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) { html.dataset.theme = "dark"; html.style.colorScheme = "dark"; } else { delete html.dataset.theme; html.style.colorScheme = ""; }
    var b = document.getElementById("cc-theme"); if (b) b.setAttribute("aria-pressed", String(dark));
    $$("[data-acct-theme-val]").forEach(function (e) { e.textContent = themeName(); });
  }
  window.CC_THEME = { set: applyTheme, name: themeName };

  function paint(A) {
    var signed = !!A.user, me = A.me || {}, prof = me.profile || {};
    $$("[data-acct-plan]").forEach(function (e) { e.textContent = (PLAN[A.plan] || "Free") + " plan"; e.hidden = !signed; });
    $$(".acct-role").forEach(function (e) { if (signed) e.textContent = ROLE[A.role] || "Member"; });
    var staff = A.role === "admin" || A.role === "root_admin";
    $$("[data-acct-upgrade]").forEach(function (a) {
      a.hidden = !signed || staff;
      var line = $("[data-acct-planline]", a); if (line) line.textContent = (PLAN[A.plan] || "Free") + " plan";
      var tag = $(".am-up-tag", a); if (tag) tag.hidden = A.plan === "pro";
      a.setAttribute("aria-label", (PLAN[A.plan] || "Free") + " plan" + (A.plan === "pro" ? ": see plans" : ": upgrade"));
    });
    $$("[data-acct-tutor]").forEach(function (e) { e.hidden = !(window.CCAccess && CCAccess.can("account.payouts")); });
    $$("[data-acct-me]").forEach(function (a) { a.href = prof.username ? "/u/" + encodeURIComponent(prof.username) : "profile.html"; });
  }
  function langName() { var l = "en"; try { l = localStorage.lang || "en"; } catch (e) {} return LANG[l] || "English"; }

  async function switchAccount() {
    var c = window.CC_AUTH && window.CC_AUTH.clerk;
    var sess = c && c.client && (c.client.signedInSessions || c.client.activeSessions || []) || [];
    var others = sess.filter(function (s) { return !c.session || s.id !== c.session.id; });
    var menu = document.getElementById("acct-menu");
    if (others.length && menu) {   /* multi-session: list the other accounts right in the menu */
      $$(".am-other", menu).forEach(function (e) { e.remove(); });
      var anchor = $("[data-acct-switch]", menu);
      others.forEach(function (s) {
        var u = s.user || s.publicUserData || {}, n = u.fullName || [u.firstName, u.lastName].filter(Boolean).join(" ") || (u.primaryEmailAddress && u.primaryEmailAddress.emailAddress) || u.identifier || "Account";
        var b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "menuitem"); b.className = "am-other";
        b.innerHTML = '<svg aria-hidden="true"><use href="#i-user"/></svg><span class="am-grow">' + esc(n) + "</span><small class=am-val>Switch</small>";
        b.onclick = function () { c.setActive({ session: s.id }).then(function () { location.reload(); }); };
        anchor.parentNode.insertBefore(b, anchor);
      });
      var add = document.createElement("a"); add.setAttribute("role", "menuitem"); add.className = "am-other"; add.href = "signin.html?add=1";
      add.innerHTML = '<svg aria-hidden="true"><use href="#i-userplus"/></svg>Add another account'; anchor.parentNode.insertBefore(add, anchor);
      anchor.hidden = true; var f = $(".am-other", menu); if (f) f.focus();
      return;
    }
    /* single-session instance: sign out, then sign in with the other account (and come back here) */
    var back = "signin.html?switch=1&return=" + encodeURIComponent(location.pathname + location.search);
    try { if (c) await c.signOut(); } catch (e) {}
    location.href = back;
  }

  function init() {
    $$("[data-return]").forEach(function (a) {
      var u = new URL(a.getAttribute("href"), location.href);
      if (!/^\/?(signin|signup|auth|index)?(\.html)?$/.test(location.pathname.replace(/^\//, ""))) u.searchParams.set("return", location.pathname + location.search);
      a.href = u.pathname.replace(/^\//, "") + u.search;
    });
    $$("[data-acct-theme-val]").forEach(function (e) { e.textContent = themeName(); });
    $$("[data-acct-lang]").forEach(function (e) { e.textContent = langName(); });
    $$("[data-acct-theme]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation(); var n = themeName(); applyTheme(n === "System" ? "light" : n === "Light" ? "dark" : "system");
        b.setAttribute("aria-label", "Theme: " + themeName() + ". Activate to change.");
      });
      b.setAttribute("aria-label", "Theme: " + themeName() + ". Activate to change.");
    });
    $$("[data-acct-switch]").forEach(function (b) { b.addEventListener("click", function (e) { e.stopPropagation(); switchAccount(); }); });
    addEventListener("storage", function (e) { if (e.key === "theme") $$("[data-acct-theme-val]").forEach(function (x) { x.textContent = themeName(); }); if (e.key === "lang") $$("[data-acct-lang]").forEach(function (x) { x.textContent = langName(); }); });
    var lang = document.getElementById("cc-lang"); if (lang) lang.addEventListener("change", function () { $$("[data-acct-lang]").forEach(function (x) { x.textContent = langName(); }); });
    if (window.CCAccess) CCAccess.on(paint); else document.addEventListener("cc:access", function (e) { paint(e.detail); });
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", init) : init();
})();
