/* 101 loaders + state loops (round 9). css/loaders.css sections: 1 route loader (logo blocks drop/squash/hold/lift, 3 s), 2 inline loader (1-0-1 hop wave, 1.5 s, space held from first paint, visible after 300 ms), 3 button busy (1 s), 4 success check line-draw + error X burst/shake, 5 empty states (search sweep, cart hop, sleepy bell, 3 s), 6 offline canvas. The CSS ships comment-free to stay inside the 6 KB gz budget.
   Route loader, inline loaders, button busy, success/error replays, empty states,
   offline canvas. Shape loops in the style of Scenario's Motion Loops (https://www.scenario.com/explorations/motion-loops),
   redrawn in the 101 palette; every period divides 12 s. Styles: css/loaders.css. Inline loader markup: {{LOADER}} in tools/build.py.
   Still frames under prefers-reduced-motion or localStorage.cc_bg_motion = off|reduced (html.ccl-still). Does nothing in ?static=1.
   API: CCLoad.busy(button, on)  CCLoad.inline(label) -> html  CCLoad.route.show()/hide()  CCLoad.offDraw(ctx, w, h, t, dark)
   js/loaders.min.js is GENERATED from this file by tools/minify_loaders.sh. */
(function (W, D) {
  "use strict";
  var H = D.documentElement, L = W.location;
  var qsa = function (s, r) { return [].slice.call((r || D).querySelectorAll(s)); };
  var mk = function (tag, cls, html) { var e = D.createElement(tag); e.className = cls; if (html) e.innerHTML = html; return e; };
  var mq = W.matchMedia ? W.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var still = function () { var m = ""; try { m = W.localStorage.cc_bg_motion || ""; } catch (e) {} return !!(mq && mq.matches) || m === "off" || m === "reduced"; };
  var off = null;

  /* ---- offline loop: a plug winds up, dashes at the socket, sparks just short of it, and backs off (3 s, divides 12) ---- */
  var cl = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; }, win = function (p, a, b) { return cl((p - a) / (b - a)); };
  var ioc = function (k) { return k < .5 ? 4 * k * k * k : 1 - Math.pow(2 - 2 * k, 3) / 2; };
  var oback = function (k) { k -= 1; return 1 + 2.7 * k * k * k + 1.7 * k * k; };
  function offDraw(c, w, h, t, dark) {
    var u = h / 100, cx = w / 2, cy = h * .5, p = (t % 3 + 3) % 3 / 3;
    var ink = dark ? "#EEF1F8" : "#0B1236", sh = dark ? "#000" : "#0B1236";
    var d = 34 * u + 7 * u * ioc(win(p, 0, .18)) - 31 * u * oback(win(p, .18, .42)) + 24 * u * ioc(win(p, .6, .86));   /* half gap */
    var hop = Math.sin(Math.PI * win(p, .6, .86)) * 7 * u;                                                             /* recoil hop */
    var box = function (x, y, bw, bh, col) {   /* flat fill, 3 px navy outline, solid offset shadow */
      c.fillStyle = sh; c.fillRect(x + 5 * u, y + 5 * u, bw, bh); c.fillStyle = col; c.fillRect(x, y, bw, bh);
      c.strokeStyle = "#03103A"; c.lineWidth = 2.6 * u; c.lineJoin = "miter"; c.strokeRect(x, y, bw, bh); };
    c.fillStyle = ink; c.fillRect(0, cy - 1.4 * u, cx - d - 26 * u, 2.8 * u); c.fillRect(cx + d + 26 * u, cy - 1.4 * u, w, 2.8 * u);   /* cables */
    var px = cx - d - 26 * u, py = cy - 15 * u - hop;
    c.fillStyle = ink; c.fillRect(px + 26 * u, py + 6 * u, 10 * u, 4 * u); c.fillRect(px + 26 * u, py + 20 * u, 10 * u, 4 * u);       /* prongs */
    box(px, py, 26 * u, 30 * u, "#FFA615");
    var sx = cx + d, sy = cy - 15 * u - hop * .5;
    box(sx, sy, 26 * u, 30 * u, "#2BE0DA");
    c.fillStyle = "#03103A"; c.fillRect(sx, sy + 6 * u, 7 * u, 4 * u); c.fillRect(sx, sy + 20 * u, 7 * u, 4 * u);                      /* slots */
    var s = win(p, .42, .62);
    if (s > 0 && s < 1) {                                                                                                  /* spark burst */
      c.strokeStyle = "#FFA615"; c.lineWidth = 2.4 * u * (1 - s); c.lineCap = "square"; c.beginPath();
      for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4 + Math.PI / 8, r0 = 6 * u + 14 * u * s, r1 = r0 + 9 * u * (1 - s);
        c.moveTo(cx + 5 * u + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + 5 * u + Math.cos(a) * r1, cy + Math.sin(a) * r1); }
      c.stroke();
    }
  }
  function offline() {
    var cv = D.getElementById("ccl-off"); if (!cv || !cv.getContext) return null;
    var ctx = cv.getContext("2d"), raf = 0;
    var frame = function (now) {
      var r = W.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * r)) { cv.width = Math.round(w * r); cv.height = Math.round(h * r); }
      ctx.setTransform(r, 0, 0, r, 0, 0); ctx.clearRect(0, 0, w, h);
      offDraw(ctx, w, h, still() ? 0 : now / 1e3 % 12, H.dataset.theme === "dark");
      raf = still() || D.hidden ? 0 : W.requestAnimationFrame(frame);
    };
    var go = function () { if (!raf) raf = W.requestAnimationFrame(frame); };
    D.addEventListener("visibilitychange", go);
    W.addEventListener("online", function () { var st = D.getElementById("ccl-off-st"); if (st) st.textContent = "Back online. Reloading…"; L.reload(); });
    go();
    return { sync: go };
  }
  W.CCLoad = { offDraw: offDraw };
  if (/[?&]static/.test(L.search) || H.classList.contains("static")) return;

  var sync = function () { H.classList.toggle("ccl-still", still()); if (off) off.sync(); };
  sync();
  /* the site's reduced-motion rule (brutal.css) switches every CSS animation off, including the 300 ms reveal: reveal by class too */
  setTimeout(function () { H.classList.add("ccl-on"); }, Math.max(0, 300 - (W.performance ? performance.now() : 0)));
  if (mq && mq.addEventListener) mq.addEventListener("change", sync);
  W.addEventListener("storage", function (e) { if (!e || e.key === "cc_bg_motion") sync(); });
  D.addEventListener("change", function (e) { if (e.target && e.target.id === "cc-bgm") setTimeout(sync, 0); });

  /* ---- 1. route loader: only when the next page takes more than 300 ms ---- */
  var ONE = function (x0, x1, xs) { return "M" + x0 + " 57.7H" + x1 + "V142.3H" + xs + "V75.8H" + x0 + "Z"; };
  var L1 = ONE(14.2, 49.4, 28.4), L3 = ONE(152.1, 185.8, 164.6);
  var LOGO = '<svg class="ccl-logo" viewBox="8 0 190 152" aria-hidden="true" focusable="false">' +
    '<g class="b"><path class="s" transform="translate(6 6)" d="' + L1 + '"/><path class="o" d="' + L1 + '"/></g>' +
    '<g class="b b2"><rect class="s" x="65.3" y="63.7" width="84" height="84"/><rect class="c" x="59.3" y="57.7" width="84" height="84"/>' +
    '<rect class="n" x="77.9" y="75.8" width="46.4" height="48.3"/><rect class="o" x="92" y="88.7" width="18.6" height="24.6"/></g>' +
    '<g class="b b3"><path class="s" transform="translate(6 6)" d="' + L3 + '"/><path class="o" d="' + L3 + '"/></g></svg>';
  var route = null, rt = 0, rk = 0;
  var hide = function () { clearTimeout(rt); clearTimeout(rk); if (route) { route.remove(); route = null; } };
  var show = function () {
    if (route) return;
    route = mk("div", "ccl-route", '<div class="ccl-card">' + LOGO + '<span class="ccl-t">Loading page…</span></div>');
    route.setAttribute("role", "status"); route.setAttribute("aria-live", "polite"); route.setAttribute("aria-busy", "true");
    D.body.appendChild(route); rk = setTimeout(hide, 12e3);   /* a cancelled or download navigation never leaves it up */
  };
  var arm = function () { clearTimeout(rt); rt = setTimeout(show, 300); };
  W.addEventListener("pageshow", hide);
  var same = function (h) { var u = new URL(h, L.href); return u.origin === L.origin && (u.pathname !== L.pathname || u.search !== L.search); };
  if (W.navigation && W.navigation.addEventListener) {
    W.navigation.addEventListener("navigate", function (e) {
      if (e.hashChange || e.downloadRequest || !e.destination || e.destination.sameDocument) return;
      try { if (new URL(e.destination.url).origin === L.origin) arm(); } catch (x) {}
    });
  } else {
    D.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href]");
      if (!a || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (a.target && a.target !== "_self") || a.hasAttribute("download") || !/^https?:/.test(a.href) || !same(a.href)) return;
      setTimeout(function () { if (!e.defaultPrevented) arm(); }, 0);
    });
  }

  /* ---- 2. inline loaders: the {{LOADER}} markup marks its container busy until the content replaces it ---- */
  var inline = function (label, tag) { tag = tag || "div"; return "<" + tag + ' class="ccl ccl-in" role="status" aria-live="polite" aria-busy="true"><span class="ccl-d" aria-hidden="true"><i></i><i></i><i></i></span><span class="ccl-t">Loading ' + (label || "") + "…</span></" + tag + ">"; };
  var watchInline = function () {
    qsa(".ccl-in").forEach(function (l) {
      var p = l.parentNode; if (!p || p._ccl) return;
      p._ccl = 1; p.setAttribute("aria-busy", "true");
      new MutationObserver(function (m, o) { if (!p.querySelector(".ccl-in")) { p.removeAttribute("aria-busy"); o.disconnect(); } }).observe(p, { childList: true });
    });
  };
  watchInline();
  setTimeout(function () { qsa(".ccl-in .ccl-t").forEach(function (t) { t.textContent = "Still loading… check your connection."; }); }, 15e3);

  /* ---- 3. button busy: forms with a status line, or a submit that navigates ---- */
  function busy(b, on) {
    if (!b) return;
    if (on) {
      if (b._cclb) return;
      var dots = mk("span", "ccl-bb", "<i></i><i></i><i></i>"); dots.setAttribute("aria-hidden", "true");
      b.style.setProperty("--ccl-cur", W.getComputedStyle(b).color);
      b.classList.add("ccl-busy"); b.setAttribute("aria-busy", "true"); b.appendChild(dots);
      b._cclb = { o: new MutationObserver(function () { if (b._cclb && !b.querySelector(".ccl-bb")) b.appendChild(dots); }), t: setTimeout(function () { busy(b, 0); }, 1e4) };
      b._cclb.o.observe(b, { childList: true });
    } else if (b._cclb) {
      b._cclb.o.disconnect(); clearTimeout(b._cclb.t); if (b._cclb.s) b._cclb.s.disconnect(); b._cclb = null;
      qsa(".ccl-bb", b).forEach(function (x) { x.remove(); });
      b.classList.remove("ccl-busy"); b.removeAttribute("aria-busy"); b.style.removeProperty("--ccl-cur");
    }
  }
  /* Decided one task after the submit, once the form's own handler has run what it can without the network: busy only when
     something is still pending (the button is disabled, the status line ends in "…", or the submit navigates). */
  D.addEventListener("submit", function (e) {
    var f = e.target, b = e.submitter || f.querySelector("[type=submit],button:not([type])");
    setTimeout(function () {
      if (!b || f.querySelector("[aria-invalid=true],.form-msg.err")) return;
      var st = f.querySelector(".form-msg,[role=status],[aria-live]"), txt = st ? st.textContent.trim() : "";
      if (!(b.disabled || /(…|\.\.\.)$/.test(txt) || !e.defaultPrevented)) return;
      busy(b, 1);
      if (st && b._cclb) {
        b._cclb.s = new MutationObserver(function () { if (st.textContent.trim() !== txt) busy(b, 0); });
        b._cclb.s.observe(st, { childList: true, characterData: true, subtree: true });
        if (b.disabled) new MutationObserver(function (m, o) { if (!b.disabled) { busy(b, 0); o.disconnect(); } }).observe(b, { attributes: true, attributeFilter: ["disabled"] });
      }
    }, 0);
  });
  W.addEventListener("pageshow", function () { qsa(".ccl-busy").forEach(function (b) { busy(b, 0); }); });

  /* ---- 4. success / error replays: the check draws and the X shakes on every new message ---- */
  var kindOf = function (s) {
    if (/couldn['’]t|could not|can['’]t|failed|error|invalid|not ready|try again/i.test(s)) return "err";
    if (/copied|saved|sent|submitted|received|registered|approved|posted|created|downloaded|scheduled|refreshed|added|you['’]re (in|on)|we['’]ll remind|thanks/i.test(s)) return "ok";
    return "";
  };
  var replay = function (el) { el.classList.add("ccl-rp"); void el.offsetWidth; el.classList.remove("ccl-rp"); };
  var watchMsg = function (el, toast) {
    if (el._cclm) return; el._cclm = 1;
    new MutationObserver(function () {
      if (toast) { var k = kindOf(el.textContent); if (k) el.setAttribute("data-k", k); else el.removeAttribute("data-k"); }
      replay(el);
    }).observe(el, { childList: true, characterData: true, subtree: true });
  };
  var scanMsg = function () {
    qsa(".form-msg,.ses-msg").forEach(function (m) { watchMsg(m); });
    var t = D.getElementById("cc-toast"); if (t) { watchMsg(t, 1); if (!t.hasAttribute("data-k") && kindOf(t.textContent)) t.setAttribute("data-k", kindOf(t.textContent)); }
  };

  /* ---- 5. empty states: a small loop above the existing message ---- */
  var EI = {   /* Neo-Brutalist: flat fills, 3 px navy outlines, solid offset shadows, square joins */
    search: '<rect class="n" x="10" y="54" width="40" height="4"/><g class="sw"><g class="s" transform="translate(4 4)"><rect x="8" y="6" width="26" height="26"/><path d="M30 30l6-6 14 14-6 6z"/></g>' +
      '<path class="o" d="M30 30l6-6 14 14-6 6z"/><rect class="c" x="8" y="6" width="26" height="26"/><rect class="p" x="13" y="11" width="6" height="6"/></g>',
    cart: '<rect class="n" x="6" y="54" width="48" height="4"/><rect class="o hp" x="26" y="24" width="12" height="13"/><path class="k" d="M3 11h8l3 8"/>' +
      '<path class="s" d="M17 23h36l-5 18H22z"/><path class="p" d="M14 20h36l-5 18H19z"/><rect class="n" x="18" y="42" width="8" height="8"/><rect class="n" x="38" y="42" width="8" height="8"/>',
    bell: '<g class="bl"><g class="s" transform="translate(4 4)"><path d="M20 14h20l4 24H16z"/><rect x="11" y="38" width="38" height="7"/></g><rect class="n" x="26" y="7" width="8" height="7"/>' +
      '<rect class="n" x="25" y="45" width="10" height="8"/><path class="o" d="M20 14h20l4 24H16z"/><rect class="c" x="11" y="38" width="38" height="7"/></g><path class="k z" d="M45 5h9l-9 10h9" stroke-width="3"/>'
  };
  var EMPTY = [["#cart-lines .mk-empty", "cart"], [".ann-list li.muted,.ccl-ann", "bell"], [".empty,.mk-empty,.cempty,.ccs-empty", "search"]];
  var scanEmpty = function () {
    var ann = D.getElementById("ann-grid");
    if (ann && !ann.children.length) ann.innerHTML = '<p class="muted empty ccl-ann">No announcements here yet. You\'re all caught up.</p>';
    EMPTY.forEach(function (r) {
      qsa(r[0]).forEach(function (el) {
        if (el.classList.contains("ccl-eh")) return;
        el.classList.add("ccl-eh");
        el.insertAdjacentHTML("afterbegin", '<svg class="ccl-e" viewBox="0 0 60 60" aria-hidden="true" focusable="false">' + EI[r[1]] + "</svg>");
      });
    });
  };
  var q = 0, scan = function () { q = 0; scanEmpty(); scanMsg(); watchInline(); };
  var start = function () {
    scan(); off = offline(); sync();
    new MutationObserver(function () { if (!q) q = W.requestAnimationFrame(scan); }).observe(D.body, { childList: true, subtree: true });
  };
  if (D.readyState === "loading") D.addEventListener("DOMContentLoaded", start); else start();

  W.CCLoad = { busy: busy, inline: inline, route: { show: show, hide: hide }, offDraw: offDraw, kindOf: kindOf };
})(window, document);
