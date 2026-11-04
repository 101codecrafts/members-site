/* 101 AI loader: the floating assistant (js/ai-mascot.min.js, then js/ai-float.js) is fetched only after the load event plus an idle slot, so it
   never competes with the page. Not on ?static=1, legal pages (terms, privacy), the /go interstitial or in print (CSS). */
(function () {
  var d = document.documentElement, b = document.body;
  if (!b || d.classList.contains("static") || /^(terms|privacy|cookies|go)$/.test(b.dataset.page || "") || window.CC_AI) return;
  var src = (document.currentScript && document.currentScript.src) || "js/ai.js";
  function add(f, cb) { var s = document.createElement("script"); s.src = new URL(f, src).href; s.async = true; if (cb) s.onload = s.onerror = cb; document.head.appendChild(s); }
  function go() { if (window.AIMascot) add("ai-float.js"); else add("ai-mascot.min.js", function () { add("ai-float.js"); }); }   /* mascot first: it is the launcher (round 8) */
  function idle() { (window.requestIdleCallback || function (f) { setTimeout(f, 200); })(go, { timeout: 2500 }); }
  if (document.readyState === "complete") idle(); else addEventListener("load", idle, { once: true });
})();
