/* 101 Codecrafts — session state (Clerk) for every page.
   - ?static=1 (mockup screenshots): does nothing, the mockup stays pixel-identical.
   - Signed out: clean guest state (no fake user, no fake notification dots/badges) + Sign in / Join.
   - Signed in: real name/initials from Clerk, unread count from GET /api/v1/me/notifications.
   Clerk dev instance; the publishable key is public by design. */
(function () {
  const CFG = window.CC_CONFIG = Object.assign({
    apiBase: "/api",
    clerkPublishableKey: "pk_test_dXByaWdodC1tYW5hdGVlLTM2NjEuY2xlcmsuYWNjb3VudHMuZGV2JA==",
    clerkFrontendApi: "https://upright-manatee-3661.clerk.accounts.dev"
  }, window.CC_CONFIG || {});
  const STATIC = /[?&]static/.test(location.search) || location.protocol === "file:";
  const listeners = [];
  const AUTH = window.CC_AUTH = { user: null, ready: false, clerk: null, onChange: f => { listeners.push(f); if (AUTH.ready) f(AUTH.user); },
    signOut: async () => { if (AUTH.clerk) await AUTH.clerk.signOut(); location.href = "index.html"; } };
  if (STATIC) return;

  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initials = n => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "G";

  /* final=false: the early pass (guest classes, no fake badges) while Clerk loads. The account chip keeps its skeleton
     until final=true, so a signed-in member never sees a flash of "Sign in / Join" (or a fake name). */
  function paint(user, final) {
    const name = user ? (user.fullName || user.firstName || (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress.split("@")[0]) || "Member") : "Guest";
    document.documentElement.classList.toggle("signed-in", !!user);
    document.documentElement.classList.toggle("signed-out", !user);
    // dashboard mockup top bar (only visible in ?static=1 now; the live dashboard uses the shared shell)
    $$(".me-name").forEach(e => e.textContent = name);
    $$(".me-role").forEach(e => e.innerHTML = user ? "Member" : '<a href="signin.html">Sign in</a> · <a href="signup.html">Join</a>');
    $$(".me-av").forEach(e => { if (!user) { e.removeAttribute("srcset"); e.src = "assets/img/avatar-guest.svg"; e.alt = "Guest"; } else if (user.imageUrl && user.hasImage) { e.src = user.imageUrl; e.alt = name; } });
    // no fake notification dots / badges; real unread count fills them in below
    $$(".dot, .sbar nav .badge, .side .nav .badge").forEach(e => { e.hidden = true; e.style.display = "none"; });
    // fake community stat on the dashboard (was a hard-coded 10K+)
    $$(".stat.s1 b[data-count]").forEach(b => { b.removeAttribute("data-count"); b.textContent = "—"; });
    document.documentElement.classList.remove("has-roles");
    if (!final) return;
    const email = user && user.primaryEmailAddress ? user.primaryEmailAddress.emailAddress : "";
    const img = user && user.hasImage && user.imageUrl ? user.imageUrl : "";
    const detail = { user, name, initials: user ? initials(name) : "", email, image: img };
    if (window.CC_SHELL) window.CC_SHELL.account(detail); else document.addEventListener("cc:shell", () => window.CC_SHELL.account(detail), { once: true });
    if (user) { unread(); roles(); }
    AUTH.user = user; AUTH.ready = true; listeners.forEach(f => { try { f(user); } catch (e) {} });
  }
  async function unread() {
    try {
      const r = await fetch("/api/v1/me/notifications?unread=1", { credentials: "include", headers: { Accept: "application/json" } });
      if (!r.ok) return; const j = await r.json(); const items = (j && (j.data && (j.data.items || j.data))) || [];
      const n = Array.isArray(items) ? items.filter(x => !x.read_at).length : 0;
      if (n) $$(".dot").forEach(e => { e.hidden = false; e.style.display = ""; });
    } catch (e) { /* offline: stay quiet */ }
  }
  /* Learner / Tutor / Admin switcher: only the roles this member holds (GET /api/v1/me -> roles), and only if more than one */
  async function roles() {
    try {
      const h = { Accept: "application/json" };
      try { const t = AUTH.clerk && AUTH.clerk.session && await AUTH.clerk.session.getToken(); if (t) h.Authorization = "Bearer " + t; } catch (e) {}
      const r = await fetch("/api/v1/me", { credentials: "include", headers: h });
      if (!r.ok) return; const j = await r.json(); const me = (j && (j.data || j)) || {};
      const rs = new Set((me.roles || []).map(String));
      const has = { learner: true, tutor: rs.has("tutor"), admin: rs.has("admin") || rs.has("super_admin") };
      const n = Object.values(has).filter(Boolean).length;
      $$(".role-tabs a").forEach(a => { const k = (a.textContent || "").trim().toLowerCase(); a.hidden = !has[k]; });
      document.documentElement.classList.toggle("has-roles", n > 1);
      const top = has.admin ? "Admin" : has.tutor ? "Tutor" : "Learner";
      $$(".acct-role").forEach(e => e.textContent = top);
    } catch (e) { /* offline / API down: keep the switcher hidden */ }
  }
  function mountAuthUi(clerk) {
    const page = document.body && document.body.dataset.page;
    const form = page === "signin" ? document.getElementById("si") : page === "signup" ? document.getElementById("su") : null;
    if (!form) return;
    if (clerk.user) { location.replace(page === "signup" ? "onboarding.html" : "dashboard.html"); return; }
    const host = document.createElement("div"); host.id = "clerk-" + page; form.replaceWith(host);
    const opts = { signInUrl: "signin.html", signUpUrl: "signup.html", forceRedirectUrl: page === "signup" ? "onboarding.html" : "dashboard.html", appearance: { variables: { colorPrimary: "#f26a1b", borderRadius: "0px" } } };
    page === "signin" ? clerk.mountSignIn(host, opts) : clerk.mountSignUp(host, opts);
  }
  function loadClerk() {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = CFG.clerkFrontendApi + "/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
      s.async = true; s.crossOrigin = "anonymous";
      s.setAttribute("data-clerk-publishable-key", CFG.clerkPublishableKey);
      s.onload = () => res(window.Clerk); s.onerror = rej; document.head.appendChild(s);
    });
  }
  // guest classes first, account chip stays a skeleton; then the real session (or the guest state if Clerk can't load within 6 s)
  const start = () => { paint(null, false);
    const fallback = setTimeout(() => { if (!AUTH.ready) paint(null, true); }, 6000);
    loadClerk().then(async Clerk => {
      await Clerk.load(); AUTH.clerk = Clerk; clearTimeout(fallback); paint(Clerk.user || null, true); mountAuthUi(Clerk);
      Clerk.addListener(({ user }) => { if ((user && user.id) !== (AUTH.user && AUTH.user.id)) paint(user || null, true); });
    }).catch(() => { clearTimeout(fallback); if (!AUTH.ready) paint(null, true); }); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
