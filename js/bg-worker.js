/* Background worker: paints js/bg-paint.js on the OffscreenCanvas it is given; the main thread only forwards size, text rects and pause. */
importScripts("bg-paint.js");
if (!self.fonts) postMessage("fallback");   /* no FontFaceSet in workers: the page paints on the main thread instead */
var P, L, still = false, font = new FontFace("CCBG Mono", "url(../assets/fonts/jetbrains-mono-var.woff2)", { weight: "100 800" });
var ready = font.load().then(function (f) { self.fonts.add(f); }).catch(function () {});
onmessage = function (e) { var o = e.data; ready.then(function () {
  if (o.canvas) { P = CCBGP(o.canvas); L = CCBGL(P.frame, o.fps || 20); still = !!o.still; }
  if (o.rects) { P.rects(o.rects, o.occ); if (still || !L.on) L.once(); }
  if (o.W) { o.time = L.time(); P.setup(o); L.once(); }
  if (o.run === true && !still) { L.on = true; L.start(); } else if (o.run === false) { L.on = false; L.stop(); }
}); };
