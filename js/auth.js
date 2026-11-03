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
    $$(".me-role").forEach(e => e.innerHTML = user ? "Member" : '<a href="/signin.html">Sign in</a> · <a href="/signup.html">Join</a>');
    $$(".me-av").forEach(e => { if (!user) { e.removeAttribute("srcset"); e.src = "/assets/img/avatar-guest.svg"; e.alt = "Guest"; } else if (user.imageUrl && user.hasImage) { e.src = user.imageUrl; e.alt = name; } });
    // shared top bar chip
    $$(".chip-me").forEach(c => {
      const b = c.querySelector("b"), sm = c.querySelector("small"), av = c.querySelector(".av");
      if (b) b.textContent = name; if (av) av.textContent = initials(name);
      if (sm) sm.innerHTML = user ? "Member" : '<a href="/signin.html">Sign in</a> · <a href="/signup.html">Join</a>';
    });
    // no fake notification dots / badges; real unread count fills them in below
    $$(".dot, .sbar nav .badge, .side .nav .badge").forEach(e => { e.hidden = true; e.style.display = "none"; });
    // fake community stat on the dashboard (was a hard-coded 10K+)
    $$(".stat.s1 b[data-count]").forEach(b => { b.removeAttribute("data-count"); const t = b.closest(".stat"); if (t) t.hidden = true; }); // no real number yet: hide the tile, never show a dash
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
  /* Clerk theme: brand colours, square corners, site fonts, orange primary with navy text. The page supplies the
     heading and the sign-in/sign-up switch, so Clerk's own header and footer link are hidden (no box inside a box).
     Variable names cover clerk-js v5 (Core 2) and the Core 3 renames; unknown keys are ignored. */
  const NAVY = "#0B1236", ORANGE = "#fc8c0c", FONT = '"Body", "Barlow", system-ui, sans-serif';
  const btn = { borderRadius: "0", minHeight: "48px", fontFamily: FONT, fontWeight: "700", fontSize: "15px", letterSpacing: ".5px", textTransform: "uppercase" };
  const APPEARANCE = {
    layout: { socialButtonsPlacement: "top", socialButtonsVariant: "blockButton", logoPlacement: "none", showOptionalFields: true },
    options: { socialButtonsPlacement: "top", socialButtonsVariant: "blockButton", logoPlacement: "none", showOptionalFields: true },
    variables: {
      colorPrimary: ORANGE, colorTextOnPrimaryBackground: NAVY, colorPrimaryForeground: NAVY,
      colorText: NAVY, colorForeground: NAVY, colorTextSecondary: "#3e5d74", colorMutedForeground: "#3e5d74",
      colorBackground: "#ffffff", colorInputBackground: "#ffffff", colorInput: "#ffffff", colorInputText: NAVY, colorInputForeground: NAVY,
      colorNeutral: NAVY, colorBorder: NAVY, colorRing: "#00b9e6", colorDanger: "#d93636", colorSuccess: "#0f7a45",
      fontFamily: FONT, fontFamilyButtons: FONT, fontSize: "16px", borderRadius: "0px", spacingUnit: "1rem"
    },
    elements: {
      rootBox: { width: "100%" },
      cardBox: { width: "100%", maxWidth: "none", boxShadow: "none", border: "0", borderRadius: "0", overflow: "visible" },
      card: { boxShadow: "none", border: "0", borderRadius: "0", padding: "0", background: "transparent", gap: "20px" },
      header: { display: "none" },
      socialButtonsBlockButton: Object.assign({}, btn, { textTransform: "none", border: "2px solid " + NAVY, background: "#fff", color: NAVY, boxShadow: "none" }),
      socialButtonsBlockButtonText: { fontWeight: "700", fontSize: "15px" },
      dividerLine: { background: "#e0e6ea", height: "2px" },
      dividerText: { color: "#3e5d74", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", fontSize: "12px" },
      formFieldLabel: { color: NAVY, fontWeight: "700", fontSize: "14px" },
      formFieldInput: { borderRadius: "0", minHeight: "48px", fontSize: "16px", border: "2px solid " + NAVY, boxShadow: "none", background: "#fff" },
      formButtonPrimary: Object.assign({}, btn, { background: ORANGE, color: NAVY, border: "2px solid " + NAVY, boxShadow: "4px 4px 0 " + NAVY,
        "&:hover": { background: ORANGE, transform: "translate(-2px,-2px)", boxShadow: "6px 6px 0 " + NAVY }, "&:focus": { boxShadow: "4px 4px 0 " + NAVY } }),
      footer: { background: "transparent", padding: "16px 0 0", border: "0" },
      footerAction: { display: "none" },
      formFieldAction: { color: "#146c9f", fontWeight: "700" },
      identityPreviewEditButton: { color: "#146c9f" },
      otpCodeFieldInput: { borderRadius: "0", border: "2px solid " + NAVY },
      alert: { borderRadius: "0", border: "2px solid " + NAVY }
    }
  };
  /* After sign-in/sign-up. Absolute URLs so the Google round trip (FAPI -> #/sso-callback -> here) never resolves them
     against a Clerk path. A Google account with no user yet is transferred from SignIn to SignUp, so both
     components carry both targets. Hash routing keeps the SSO callback on the same static page (signin.html#/sso-callback):
     the static host has no /signin/sso-callback path. */
  const abs = p => new URL(p, location.href).href;
  function mountAuthUi(clerk) {
    const page = document.body && document.body.dataset.page;
    const form = page === "signin" ? document.getElementById("si") : page === "signup" ? document.getElementById("su") : null;
    if (!form) return;
    // already signed in: leave the auth page once (replace, so Back does not return here)
    if (clerk.user) { location.replace(page === "signup" ? "onboarding.html" : "dashboard.html"); return; }
    const host = document.createElement("div"); host.id = "clerk-" + page; form.replaceWith(host);
    const opts = { routing: "hash", signInUrl: abs("signin.html"), signUpUrl: abs("signup.html"),
      signInForceRedirectUrl: abs("dashboard.html"), signUpForceRedirectUrl: abs("onboarding.html"),
      appearance: APPEARANCE };
    page === "signin" ? clerk.mountSignIn(host, opts) : clerk.mountSignUp(host, opts);
  }
  /* ClerkJS 6 (Core 3) + the separate @clerk/ui bundle, both from the instance's Frontend API.
     Clerk Protect needs ClerkJS >= 6.39: instances created on/after 27 Oct 2026 have "Require Device Intelligence checks"
     on, which blocks every browser sign-up (incl. a first Google sign-in) when Device Intelligence can't run
     ("This action was detected as suspicious and has been blocked"). It also needs *.protect.clerk.com in the CSP. */
  function addScript(src, attrs) {
    return new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.async = true; s.crossOrigin = "anonymous";
      Object.entries(attrs || {}).forEach(([k, v]) => s.setAttribute(k, v));
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  function loadClerk() {
    return Promise.all([
      addScript(CFG.clerkFrontendApi + "/npm/@clerk/ui@1/dist/ui.browser.js"),
      addScript(CFG.clerkFrontendApi + "/npm/@clerk/clerk-js@6/dist/clerk.browser.js", { "data-clerk-publishable-key": CFG.clerkPublishableKey })
    ]).then(() => window.Clerk);
  }
  // guest classes first, account chip stays a skeleton; then the real session (or the guest state if Clerk can't load within 6 s)
  const start = () => { paint(null, false);
    const fallback = setTimeout(() => { if (!AUTH.ready) paint(null, true); }, 6000);
    loadClerk().then(async Clerk => {
      await Clerk.load({ ui: { ClerkUI: window.__internal_ClerkUICtor }, signInUrl: abs("signin.html"), signUpUrl: abs("signup.html"),
        signInFallbackRedirectUrl: abs("dashboard.html"), signUpFallbackRedirectUrl: abs("onboarding.html") }); AUTH.clerk = Clerk; clearTimeout(fallback); paint(Clerk.user || null, true); mountAuthUi(Clerk);
      Clerk.addListener(({ user }) => { if ((user && user.id) !== (AUTH.user && AUTH.user.id)) paint(user || null, true); });
    }).catch(() => { clearTimeout(fallback); if (!AUTH.ready) paint(null, true); }); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();
