/* 101 Codecrafts — app shell behaviour (sidebar rail / mobile drawer, account menu). Styles: css/shell.css.
   >=1024px: the sidebar is a standard column that collapses to a 72px icon rail. Toggle: the sidebar header button,
     the top-bar button, "[" or Ctrl/Cmd+B. State persists in localStorage["cc.sidebar"]; the inline head script in
     tools/build.py applies html.sb-collapsed before first paint, so there is no flash.
   <1024px: the sidebar is a modal drawer (hamburger in the top bar): scrim, Esc / scrim click to close, focus trap,
     the page behind is inert and does not scroll, focus returns to the hamburger.
   Account chip: skeleton until js/auth.js calls CC_SHELL.account(); then the guest buttons or the member menu. */
(function () {
  const html = document.documentElement;
  const STATIC = /[?&]static/.test(location.search);
  const KEY = "cc.sidebar";
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const desk = window.matchMedia("(min-width:1024px)");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let sb, scrim, opener, lastFocus = null;
  const focusables = root => $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])', root).filter(e => e.offsetParent !== null || e === document.activeElement);
  const collapsed = () => html.classList.contains("sb-collapsed");
  const drawerOpen = () => html.classList.contains("sb-open");

  function save(v) { try { localStorage.setItem(KEY, v ? "collapsed" : "expanded"); } catch (e) {} }

  /* keep every toggle's aria in step with the current mode */
  function sync() {
    if (!sb) return;
    const d = desk.matches;
    $$("[data-sb-toggle]").forEach(b => {
      if (d) { b.setAttribute("aria-expanded", String(!collapsed())); b.setAttribute("aria-label", collapsed() ? "Expand sidebar" : "Collapse sidebar"); }
      else { b.setAttribute("aria-expanded", String(drawerOpen())); b.setAttribute("aria-label", "Close menu"); }
    });
    $$("[data-sb-open]").forEach(b => {
      if (d) { b.setAttribute("aria-expanded", String(!collapsed())); b.setAttribute("aria-label", collapsed() ? "Expand sidebar" : "Collapse sidebar"); }
      else { b.setAttribute("aria-expanded", String(drawerOpen())); b.setAttribute("aria-label", drawerOpen() ? "Close menu" : "Open menu"); }
    });
    if (d) { sb.removeAttribute("role"); sb.removeAttribute("aria-modal"); sb.removeAttribute("aria-label"); sb.removeAttribute("inert"); }
    else { sb.setAttribute("role", "dialog"); sb.setAttribute("aria-modal", "true"); sb.setAttribute("aria-label", "Menu");
      if (drawerOpen()) sb.removeAttribute("inert"); else sb.setAttribute("inert", ""); }
  }

  function setCollapsed(v) { html.classList.toggle("sb-collapsed", v); save(v); hideTip(); sync(); }

  function outside() { return $$("body > *").filter(e => !e.contains(sb) && e !== scrim && e.tagName !== "SCRIPT"); }
  function openDrawer() {
    if (desk.matches || drawerOpen()) return;
    lastFocus = document.activeElement;
    html.classList.add("sb-open"); scrim.hidden = false;
    // everything except the drawer is inert: the drawer's ancestors stay live, their other children don't
    const keep = new Set(); let n = sb; while (n && n !== document.body) { keep.add(n); n = n.parentElement; }
    const inert = []; keep.forEach(a => [...a.parentElement.children].forEach(c => { if (!keep.has(c) && c !== scrim && c.tagName !== "SCRIPT" && !c.inert) inert.push(c); }));
    inert.forEach(c => c.inert = true); sb._inert = inert;
    sync();
    const first = $('.sb-nav a[aria-current=page]', sb) || focusables(sb)[0];
    requestAnimationFrame(() => first && first.focus());
  }
  function closeDrawer(restore = true) {
    if (!drawerOpen()) return;
    html.classList.remove("sb-open"); scrim.hidden = true;
    (sb._inert || []).forEach(c => c.inert = false); sb._inert = [];
    sync();
    const t = opener && opener.offsetParent ? opener : lastFocus;
    if (restore && t && t.focus) t.focus();
  }

  /* collapsed rail: visible tooltip on hover and keyboard focus (position:fixed so the scrolling rail can't clip it) */
  let tip;
  function showTip(el) {
    if (!desk.matches || !collapsed()) return;
    const t = el.dataset.tip || (el.querySelector("span") || {}).textContent || el.getAttribute("aria-label"); if (!t) return;
    if (!tip) { tip = document.createElement("div"); tip.className = "sb-tip"; tip.setAttribute("role", "tooltip"); tip.id = "sb-tip"; document.body.appendChild(tip); }
    tip.textContent = t.trim(); tip.hidden = false;
    const r = el.getBoundingClientRect(); tip.style.left = (r.right + 10) + "px"; tip.style.top = (r.top + r.height / 2) + "px";
    el.setAttribute("aria-describedby", "sb-tip");
  }
  function hideTip(e) { if (tip) tip.hidden = true; if (e && e.currentTarget && e.currentTarget.removeAttribute) e.currentTarget.removeAttribute("aria-describedby"); }

  function initSidebar() {
    sb = $("#sbar"); scrim = $("[data-sb-scrim]"); opener = $("[data-sb-open]");
    if (!sb) return;
    $$("[data-sb-toggle]").forEach(b => b.addEventListener("click", () => desk.matches ? setCollapsed(!collapsed()) : closeDrawer()));
    $$("[data-sb-open]").forEach(b => b.addEventListener("click", () => desk.matches ? setCollapsed(!collapsed()) : (drawerOpen() ? closeDrawer() : openDrawer())));
    if (scrim) scrim.addEventListener("click", () => closeDrawer());
    // swipe toward the anchoring edge dismisses the modal drawer (Material 3); vertical scrolls are left alone
    let sx = null, sy = 0;
    sb.addEventListener("touchstart", e => { if (!desk.matches && drawerOpen() && e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
    sb.addEventListener("touchend", e => { if (sx === null) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null; if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) closeDrawer(); }, { passive: true });
    // tapping a destination in the drawer closes it (Material: selecting a destination dismisses the modal drawer)
    sb.addEventListener("click", e => { const a = e.target.closest("a[href]"); if (a && !desk.matches && drawerOpen() && a.getAttribute("href") !== "#") closeDrawer(false); });
    const bindTips = () => $$(".sb-nav a, .sb-foot a, [data-sb-toggle]", sb).forEach(a => {
      if (a.dataset.tip) return; a.dataset.tip = "1";
      a.addEventListener("mouseenter", () => showTip(a)); a.addEventListener("mouseleave", hideTip);
      a.addEventListener("focus", () => showTip(a)); a.addEventListener("blur", hideTip);
    });
    bindTips(); document.addEventListener("cc:nav", bindTips);   // r13: js/access.js swaps in the guest navigation
    sb.addEventListener("scroll", () => hideTip(), { passive: true });
    document.addEventListener("keydown", e => {
      if (drawerOpen()) {
        if (e.key === "Escape") { e.preventDefault(); closeDrawer(); return; }
        if (e.key === "Tab") { const f = focusables(sb); if (!f.length) return; const a = f[0], z = f[f.length - 1];
          if (e.shiftKey && (document.activeElement === a || !sb.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
          else if (!e.shiftKey && (document.activeElement === z || !sb.contains(document.activeElement))) { e.preventDefault(); a.focus(); } }
        return;
      }
      const t = e.target, typing = t && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
      if (typing || e.altKey) return;
      const bracket = e.key === "[" && !e.ctrlKey && !e.metaKey, ctrlB = (e.key === "b" || e.key === "B") && (e.ctrlKey || e.metaKey) && !e.shiftKey;
      if (!(bracket || ctrlB) || $(".acct-menu:not([hidden])")) return;
      e.preventDefault();
      desk.matches ? setCollapsed(!collapsed()) : openDrawer();
    });
    const onMode = () => { if (desk.matches) closeDrawer(false); hideTip(); sync(); };
    desk.addEventListener ? desk.addEventListener("change", onMode) : desk.addListener(onMode);
    sync();
    // enable transitions only after the first frame, so the persisted state never animates in on load
    requestAnimationFrame(() => requestAnimationFrame(() => html.classList.add("sb-ready")));
  }

  /* ---- account chip / menu (APG menu button) ---- */
  function initMenu() {
    const btn = $(".acct-btn"), menu = $("#acct-menu"); if (!btn || !menu) return;
    const items = () => $$('[role=menuitem]', menu).filter(i => i.offsetParent !== null);
    const open = (focus = "first") => { menu.hidden = false; btn.setAttribute("aria-expanded", "true"); const it = items(); const f = focus === "last" ? it[it.length - 1] : it[0]; f && f.focus(); };
    const close = (back = true) => { if (menu.hidden) return; menu.hidden = true; btn.setAttribute("aria-expanded", "false"); if (back) btn.focus(); };
    btn.addEventListener("click", e => { e.stopPropagation(); menu.hidden ? open() : close(); });
    btn.addEventListener("keydown", e => { if (e.key === "ArrowDown") { e.preventDefault(); open("first"); } else if (e.key === "ArrowUp") { e.preventDefault(); open("last"); } });
    menu.addEventListener("keydown", e => {
      const it = items(), i = it.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); it[(i + 1) % it.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); it[(i - 1 + it.length) % it.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); it[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); it[it.length - 1].focus(); }
      else if (e.key === "Tab") close(false);
    });
    document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) close(false); });
    const out = $("[data-signout]", menu); if (out) out.addEventListener("click", () => { close(false); window.CC_AUTH && window.CC_AUTH.signOut ? window.CC_AUTH.signOut() : (location.href = "index.html"); });
  }

  /* called by js/auth.js once the session is known (and directly in ?static=1, where auth does nothing) */
  function account(d) {
    $$("[data-acct]").forEach(box => {
      box.removeAttribute("aria-busy");
      const sk = $(".acct-sk", box), ld = $(".acct-loading", box); if (sk) sk.remove(); if (ld) ld.remove();
      const g = $(".acct-guest", box), u = $(".acct-user", box);
      const member = !!(d && d.user);
      if (g) g.hidden = member; if (u) u.hidden = !member;
      box.classList.toggle("is-member", member); box.classList.toggle("is-guest", !member);
      if (!member || !u) return;
      $$(".acct-name", u).forEach(e => e.textContent = d.name);
      $$(".acct-email", u).forEach(e => { e.textContent = d.email || ""; e.hidden = !d.email; });
      $$(".acct-av", u).forEach(av => { av.innerHTML = d.image ? `<img src="${esc(d.image)}" alt="" width="32" height="32" referrerpolicy="no-referrer">` : esc(d.initials || "?"); });
    });
  }

  window.CC_SHELL = { account, collapse: setCollapsed, open: openDrawer, close: closeDrawer };
  function ready(fn) { document.readyState !== "loading" ? fn() : document.addEventListener("DOMContentLoaded", fn); }
  ready(() => {
    initSidebar(); initMenu();
    document.dispatchEvent(new CustomEvent("cc:shell"));
    // auth.js does nothing in mockup mode or from file://, so settle the chip on the guest state there
    if (STATIC || location.protocol === "file:") account({ user: null });
  });
})();
