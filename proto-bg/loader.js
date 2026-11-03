/* prototype loader: ?e=canvas|worker|webgl|waapi|none [&theme=dark|light] [&static=1] [&noworker]. Same loader is injected into real pages by the bench. */
(function () {
  var q = new URLSearchParams(location.search), e = q.get("e") || window.CCBG_ENGINE || "worker", d = document.documentElement;
  if (q.get("theme") === "dark") d.dataset.theme = "dark"; else if (q.get("theme") === "light") delete d.dataset.theme;
  if (e === "none" || d.classList.contains("static")) return;
  var go = function () {
  var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/proto-bg/base.css"; document.head.appendChild(l);
  ["common", "field", "draw", "static", e].forEach(function (f) { var s = document.createElement("script"); s.src = "/proto-bg/" + f + ".js"; s.async = false; document.head.appendChild(s); });
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : go();
})();
