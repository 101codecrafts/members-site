/* shared harness bits: layer element, theme, pause signals */
(function (g) {
  var d = document.documentElement;
  g.CCH = {
    layer: function () { var el = document.getElementById("ccbg"); if (!el) { el = document.createElement("div"); el.id = "ccbg"; el.setAttribute("aria-hidden", "true"); document.body.appendChild(el); } d.classList.add("bg-on"); return el; },
    theme: function () { return d.dataset.theme === "dark" ? "dark" : "light"; },
    reduced: function () { return matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&]static/.test(location.search); },
    dpr: function () { var c = +(new URLSearchParams(location.search).get("dpr")) || 2; return Math.min(window.devicePixelRatio || 1, c); },
    fps: function () { return +(new URLSearchParams(location.search).get("fps")) || 30; },
    onPause: function (el, cb) { var vis = true, onscr = true, f = function () { cb(!(vis && onscr)); };
      document.addEventListener("visibilitychange", function () { vis = !document.hidden; f(); });
      if ("IntersectionObserver" in window) new IntersectionObserver(function (e) { onscr = e[0].isIntersecting; f(); }).observe(el); },
    onResize: function (cb) { var t; addEventListener("resize", function () { clearTimeout(t); t = setTimeout(cb, 200); }); },
    /* text guard: rects (viewport px, padded) of text that sits straight on the page background, so engines can dim glyphs
       under it. Which elements qualify is decided once (and on DOM change); on scroll only their rects are re-read (<=10Hz). */
    guard: function (cb) {
      var CTL = "button,.btn,[class*=btn-],a.cta,[data-bg-quiet]", list = [], T, opaque = function (e) { var b = getComputedStyle(e).backgroundColor; return b && b !== "transparent" && !/rgba\([^)]*,\s*0\)$/.test(b); };
      var bgEls = [document.documentElement, document.body].concat([].slice.call(document.querySelectorAll(".page,.app.dz,.main,.shell,main,.content")));
      function scan() { list = [].slice.call(document.querySelectorAll("h1,h2,h3,h4,p,li,dt,dd,figcaption,blockquote,label,.kick,.eyebrow,small,time," + CTL)).filter(function (e) {
          if (e.closest("#ccbg")) return false; if (e.matches(CTL)) return true; for (var a = e; a && bgEls.indexOf(a) < 0; a = a.parentElement) if (opaque(a) || getComputedStyle(a).backgroundImage !== "none") return false; return true; }); read(); }
      function read() { T = 0; var H = innerHeight, r = []; for (var i = 0; i < list.length && r.length < 40; i++) { var b = list[i].getBoundingClientRect();
          if (b.width && b.bottom > -20 && b.top < H + 20) r.push([b.left - 10, b.top - 8, b.width + 20, b.height + 16]); } cb(r); }
      var poke = function () { if (!T) T = requestAnimationFrame(read); };
      addEventListener("scroll", poke, { passive: true }); addEventListener("resize", poke);
      var mt; new MutationObserver(function () { clearTimeout(mt); mt = setTimeout(scan, 400); }).observe(document.body, { childList: true, subtree: true });
      scan(); setTimeout(scan, 1500);
    },
    onTheme: function (cb) { new MutationObserver(cb).observe(d, { attributes: true, attributeFilter: ["data-theme"] }); }
  };
})(window);
